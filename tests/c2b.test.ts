import { describe, expect, it } from 'vitest';
import legacyC2a from './fixtures/phase-c2a-v4.json' with { type: 'json' };
import { dispatchCommand, replay } from '../src/engine/simulation/engine';
import { createFoundedGame } from './helpers';
import { stateHash } from '../src/engine/simulation/determinism';
import { deserializeSave, serializeSave } from '../src/persistence/codec';
import { politicianModel } from '../src/data/seeds/politicians';
import { recruitmentBand, recruitmentCost, recruitmentProbability, RECRUITMENT_STREAM, type RecruitmentInputs } from '../src/engine/people/recruitment';
import type { Command, GameState } from '../src/types/game';
import type { PromiseType, RoleId } from '../src/types/people';

const c = politicianModel.recruitment;
const advance = (s: GameState, n = 1) => { for (let i = 0; i < n; i++) s = dispatchCommand(s, { type: 'ADVANCE_WEEK' }); return s; };
const rich = (s: GameState): GameState => ({ ...s, resources: { ...s.resources!, staffCapacity: 500, money: 5_000_000 } });
const recruit = (s: GameState, id: string, role: RoleId = 'member', promises: PromiseType[] = []) => dispatchCommand(s, { type: 'RECRUIT_POLITICIAN', politicianId: id, role, promises });
// Try prospects in id order until one gives the wanted outcome (deterministic per seed).
function until(s: GameState, outcome: 'recruited' | 'declined', role: RoleId = 'member', promises: PromiseType[] = []): { state: GameState; id: string } {
  for (const person of s.politicians.filter(p => p.status === 'prospect')) {
    const next = recruit(s, person.id, role, promises);
    if (next.politicians.find(p => p.id === person.id)!.status === outcome) return { state: next, id: person.id };
    s = next;
  }
  throw new Error(`no ${outcome}`);
}

describe('C2b recruitment', () => {
  it('is deterministic for the same state and choices and spends exactly the cost', () => {
    const s = createFoundedGame(42), id = s.politicians[0]!.id;
    const a = recruit(s, id), b = recruit(s, id);
    expect(stateHash(a)).toBe(stateHash(b));
    expect(a.resources!.staffCapacity).toBe(s.resources!.staffCapacity - recruitmentCost().staffCapacity);
    expect(a.resources!.money).toBe(s.resources!.money - recruitmentCost().money);
    expect(a.finance!.ledger.at(-1)).toMatchObject({ kind: 'recruitment', amount: -recruitmentCost().money, ref: id });
    expect(a.rngState[JSON.stringify([RECRUITMENT_STREAM, s.date])]).toBeDefined();
    expect(['낮음', '보통', '높음']).toContain(recruitmentBand(s, id, 'member', []));
  });
  it('probability is monotone in match, momentum, trust, reputation, role appeal and promises', () => {
    const base: RecruitmentInputs = { match: 400000, momentum: 100000, role: 'member', promises: [], trust: 40, reputation: 50 };
    const p = recruitmentProbability;
    for (const key of ['match', 'momentum'] as const) for (let v = 0; v < 1_000_000; v += 50000) expect(p({ ...base, [key]: v + 50000 })).toBeGreaterThanOrEqual(p({ ...base, [key]: v }));
    for (let v = 0; v < 100; v += 5) { expect(p({ ...base, trust: v + 5 })).toBeGreaterThanOrEqual(p({ ...base, trust: v })); expect(p({ ...base, reputation: v + 5 })).toBeGreaterThanOrEqual(p({ ...base, reputation: v })); }
    expect(p({ ...base, promises: ['primary_guarantee'] })).toBeGreaterThan(p(base));
    expect(p({ ...base, promises: ['primary_guarantee', 'regional_priority'] })).toBeGreaterThan(p({ ...base, promises: ['primary_guarantee'] }));
    expect(p({ ...base, role: 'policy_chair' })).toBeGreaterThan(p(base));
    expect(p({ ...base, match: 0, momentum: 0, trust: 0, reputation: 0 })).toBe(c.minProbability);
    expect(p({ ...base, match: 1_000_000, momentum: 1_000_000, trust: 100, reputation: 100, promises: ['primary_guarantee', 'policy_chair', 'regional_priority'], role: 'policy_chair' })).toBe(c.maxProbability);
  });
  it('refusal is atomic: shortages and invalid choices leave state and command log untouched', () => {
    const s = createFoundedGame(5), id = s.politicians[0]!.id;
    const broke: GameState = { ...s, resources: { ...s.resources!, staffCapacity: 1 } };
    expect(() => recruit(broke, id)).toThrow('Staff Capacity가 부족합니다');
    expect(() => recruit(s, id, 'member', ['policy_chair', 'policy_chair'])).toThrow('한 번만');
    expect(() => recruit(s, 'pol-999')).toThrow('찾을 수 없습니다');
    expect(() => dispatchCommand(s, { type: 'ASSIGN_ROLE', politicianId: id, role: 'policy_chair' })).toThrow('영입한 인재에게만');
    expect(s.commandLog).toHaveLength(1); expect(Object.isFrozen(s)).toBe(true);
  });
  it('a refusal sets a cooldown and small trust drop, then the person returns while available', () => {
    const { state, id } = until(rich(createFoundedGame(3)), 'declined');
    const before = createFoundedGame(3).politicians.find(p => p.id === id)!;
    const person = state.politicians.find(p => p.id === id)!;
    expect(person.cooldownUntil).toBe('2026-12-14'); expect(person.trust).toBe(before.trust - c.refusalTrust);
    expect(() => recruit(state, id)).toThrow('재접촉 대기');
    expect(state.promises).toEqual([]); expect(state.inbox.some(m => m.title.includes('거절'))).toBe(true);
    const later = advance(state, c.cooldownWeeks);
    expect(later.politicians.find(p => p.id === id)).toMatchObject({ status: 'prospect', cooldownUntil: null });
  });
  it('acceptance assigns the role, enforces single slots and creates honest promises', () => {
    const first = until(rich(createFoundedGame(9)), 'recruited', 'policy_chair', ['policy_chair', 'primary_guarantee']);
    const chair = first.state.politicians.find(p => p.id === first.id)!;
    expect(chair).toMatchObject({ status: 'recruited', role: 'policy_chair', recruitedAt: '2026-10-19' });
    const promises = first.state.promises.filter(p => p.politicianId === first.id);
    expect(promises.map(p => [p.type, p.status, p.due])).toEqual([['policy_chair', 'kept', '2026-12-14'], ['primary_guarantee', 'pending', 'NOMINATION']]);
    const other = first.state.politicians.find(p => p.status === 'prospect')!;
    expect(() => recruit(first.state, other.id, 'policy_chair')).toThrow('자리는');
    const second = until(first.state, 'recruited');
    expect(() => dispatchCommand(second.state, { type: 'ASSIGN_ROLE', politicianId: second.id, role: 'policy_chair' })).toThrow('맡고 있습니다');
    const sg = dispatchCommand(second.state, { type: 'ASSIGN_ROLE', politicianId: second.id, role: 'secretary_general' });
    expect(sg.politicians.find(p => p.id === second.id)!.role).toBe('secretary_general');
    // Nomination promises wait for registration (D3); with no primary held the guarantee is broken then.
    const end = advance(sg, 77);
    expect(end.promises.find(p => p.type === 'primary_guarantee')).toMatchObject({ status: 'broken', resolvedAt: '2028-03-20' });
  });
  it('policy_chair promise: kept on appointment, broken on removal or when the window lapses; penalties bounded', () => {
    const made = until(rich(createFoundedGame(12)), 'recruited', 'member', ['policy_chair']);
    const promise = made.state.promises.find(p => p.politicianId === made.id)!;
    expect(promise).toMatchObject({ status: 'pending', due: '2026-12-14' });
    expect(() => until(made.state, 'recruited', 'member', ['policy_chair'])).toThrow('이미 다른 인재에게');
    const appointed = dispatchCommand(made.state, { type: 'ASSIGN_ROLE', politicianId: made.id, role: 'policy_chair' });
    expect(appointed.promises[0]).toMatchObject({ status: 'kept', resolvedAt: '2026-10-19' });
    const trust = appointed.politicians.find(p => p.id === made.id)!.trust;
    const removed = dispatchCommand(appointed, { type: 'ASSIGN_ROLE', politicianId: made.id, role: 'member' });
    expect(removed.promises[0]!.status).toBe('broken');
    expect(removed.politicians.find(p => p.id === made.id)!.trust).toBe(Math.max(0, trust - c.brokenTrust));
    expect(removed.recruitmentReputation).toBe(c.reputationStart - c.brokenReputation);
    // Lapsed window: warning two weeks before, broken after the due date.
    const warned = advance(made.state, 6);
    expect(warned.inbox.some(m => m.title.includes('기한이 다가옵니다'))).toBe(true);
    expect(warned.promises[0]!.status).toBe('pending');
    const lapsed = advance(made.state, 9);
    expect(lapsed.promises[0]!.status).toBe('broken'); expect(lapsed.events.some(e => e.type === 'PROMISE_BROKEN')).toBe(true);
    // Reputation recovers monthly toward its start value and never exceeds it.
    const recovered = advance(removed, 40);
    expect(recovered.recruitmentReputation).toBe(c.reputationStart);
    let s: GameState = { ...removed, recruitmentReputation: c.reputationFloor + 1 };
    s = dispatchCommand(dispatchCommand(s, { type: 'ASSIGN_ROLE', politicianId: made.id, role: 'policy_chair' }), { type: 'ASSIGN_ROLE', politicianId: made.id, role: 'secretary_general' });
    expect(s.recruitmentReputation).toBeGreaterThanOrEqual(c.reputationFloor);
  });
  it('recruitment acts only through the player own perception channels; AI state is untouched', () => {
    const s = createFoundedGame(42);
    const withRecruit = advance(until(s, 'recruited').state, 5), without = advance(s, 5);
    const ai = (x: GameState) => ({ issues: x.issues, government: x.governmentPolicy, platforms: x.platforms.filter(p => p.partyId !== 'player'),
      parties: x.politics.parties.filter(p => p.partyId !== 'player'),
      perceptions: Object.fromEntries(Object.entries(x.politics.perceptions).map(([id, row]) => [id, Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'player'))])) });
    expect(ai(withRecruit)).toEqual(ai(without));
  });
  it('promises and roster survive save, load and replay; real C2a saves are rejected', () => {
    let s = createFoundedGame(42);
    s = until(s, 'recruited', 'member', ['policy_chair', 'regional_priority']).state;
    s = advance(s, 10);
    expect(stateHash(deserializeSave(serializeSave(s)))).toBe(stateHash(s));
    expect(stateHash(replay(42, s.commandLog as Command[]))).toBe(stateHash(s));
    expect(s.promises.length).toBeGreaterThan(0);
    expect(legacyC2a.state.schemaVersion).toBe(4); expect(legacyC2a.checksum).toBe(stateHash(legacyC2a.state));
    expect(() => deserializeSave(JSON.stringify(legacyC2a))).toThrow('C2a 세이브(스키마 4)는 현재 버전(스키마 9)과 호환되지 않습니다. 기존 JSON을 보관');
  });
});
