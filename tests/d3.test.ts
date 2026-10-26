import { describe, expect, it } from 'vitest';
import legacyD2 from './fixtures/phase-d2-v8.json' with { type: 'json' };
import { nominationModel as nm } from '../src/data/seeds/nomination';
import { districtPack } from '../src/data/reality/districts';
import { candidateEffect, projectDistricts } from '../src/engine/election/districts';
import { candidacyOf, districtDeposit, listDeposit, nominationStage, primaryScore } from '../src/engine/election/nominations';
import { dispatchCommand, replay } from '../src/engine/simulation/engine';
import { stateHash } from '../src/engine/simulation/determinism';
import { deserializeSave, serializeSave } from '../src/persistence/codec';
import type { Command, GameState } from '../src/types/game';
import type { Politician } from '../src/types/people';
import { createFoundedGame } from './helpers';

const advanceTo = (s: GameState, date: string) => { while (s.date < date) s = dispatchCommand(s, { type: 'ADVANCE_WEEK' }); return s; };
const conservation = (s: GameState) => s.finance!.initialMoney + s.finance!.ledgerTruncatedSum + s.finance!.ledger.reduce((sum, e) => sum + e.amount, 0);
const active = districtPack.districts.filter(d => d.active);
// Test-only shortcut: mark generated people as recruited (the real path is RECRUIT_POLITICIAN, covered below).
function withRecruits(s: GameState, change: (p: Politician, i: number) => Partial<Politician> = () => ({})): GameState {
  return { ...s, politicians: s.politicians.map((p, i) => ({ ...p, status: 'recruited', role: 'member', recruitedAt: s.date, cooldownUntil: null, ...change(p, i) })),
    resources: { ...s.resources!, money: 1_000_000, staffCapacity: 200 }, finance: { ...s.finance!, initialMoney: s.finance!.initialMoney + 1_000_000 - s.resources!.money } };
}
const run = (s: GameState, ...commands: Command[]) => commands.reduce(dispatchCommand, s);

const founded = createFoundedGame(42);
const atTargets = advanceTo(founded, nm.gates.targets);
const atNominations = advanceTo(atTargets, nm.gates.nominations);
const atList = advanceTo(atNominations, nm.gates.list);

describe('D3 gates and targets', () => {
  it('unlocks targets, nominations and the list on the Slice §6 dates', () => {
    expect(nominationStage(founded)).toBe('closed');
    expect(nominationStage(atTargets)).toBe('targets'); expect(nominationStage(atNominations)).toBe('nominations'); expect(nominationStage(atList)).toBe('list');
    expect(() => run(founded, { type: 'SET_TARGET_DISTRICT', districtId: active[0]!.id, targeted: true })).toThrow(`${nm.gates.targets}부터`);
    expect(() => run(atTargets, { type: 'NOMINATE_DISTRICT', districtId: active[0]!.id, method: 'strategic', candidateIds: ['pol-001'] })).toThrow(`${nm.gates.nominations}부터`);
    expect(() => run(atNominations, { type: 'SET_LIST', politicianIds: [] })).toThrow(`${nm.gates.list}부터`);
    expect(atTargets.inbox.some(m => m.title.includes('1단계'))).toBe(true);
    expect(atList.inbox.some(m => m.title.includes('3단계'))).toBe(true);
  });
  it('targets only Active districts, at most the configured maximum', () => {
    const light = districtPack.districts.find(d => !d.active)!;
    expect(() => run(atTargets, { type: 'SET_TARGET_DISTRICT', districtId: light.id, targeted: true })).toThrow('주요 지역구 30곳');
    let s = atTargets;
    for (const d of active.slice(0, nm.targets.max)) s = run(s, { type: 'SET_TARGET_DISTRICT', districtId: d.id, targeted: true });
    expect(s.nominations.targets).toHaveLength(nm.targets.max);
    expect(() => run(s, { type: 'SET_TARGET_DISTRICT', districtId: active[nm.targets.max]!.id, targeted: true })).toThrow(`최대 ${nm.targets.max}곳`);
    s = run(s, { type: 'SET_TARGET_DISTRICT', districtId: active[0]!.id, targeted: false });
    expect(s.nominations.targets).not.toContain(active[0]!.id);
  });
});

describe('D3 nominations', () => {
  const district = active.find(d => d.regionId === 'seoul')!;
  const base = withRecruits(run(atNominations, { type: 'SET_TARGET_DISTRICT', districtId: district.id, targeted: true }));
  const people = base.politicians;
  it('strategic nomination charges the statutory deposit atomically and refunds it on withdrawal', () => {
    expect(districtDeposit(base)).toBe(1500); expect(listDeposit(base)).toBe(500);
    const id = people[0]!.id;
    const s = run(base, { type: 'NOMINATE_DISTRICT', districtId: district.id, method: 'strategic', candidateIds: [id] });
    expect(s.nominations.districts[district.id]).toMatchObject({ politicianId: id, method: 'strategic' });
    expect(s.resources!.money).toBe(base.resources!.money - 1500); expect(s.resources!.money).toBe(conservation(s));
    expect(candidacyOf(s, id)).toEqual({ kind: 'district', districtId: district.id });
    expect(() => run(s, { type: 'NOMINATE_DISTRICT', districtId: district.id, method: 'strategic', candidateIds: [people[1]!.id] })).toThrow('이미 공천');
    expect(() => run(s, { type: 'SET_TARGET_DISTRICT', districtId: district.id, targeted: false })).toThrow('철회');
    const withdrawn = run(s, { type: 'NOMINATE_DISTRICT', districtId: district.id, method: 'none', candidateIds: [] });
    expect(withdrawn.nominations.districts).toEqual({}); expect(withdrawn.resources!.money).toBe(base.resources!.money); expect(withdrawn.resources!.money).toBe(conservation(withdrawn));
    expect(() => run(base, { type: 'NOMINATE_DISTRICT', districtId: active[1]!.id, method: 'strategic', candidateIds: [id] })).toThrow('집중 지역');
    const prospect = { ...base, politicians: base.politicians.map((p, i) => i === 0 ? { ...p, status: 'prospect' as const } : p) };
    expect(() => run(prospect, { type: 'NOMINATE_DISTRICT', districtId: district.id, method: 'strategic', candidateIds: [id] })).toThrow('영입한 인재');
    const poor = { ...base, resources: { ...base.resources!, money: 1499 } };
    expect(() => run(poor, { type: 'NOMINATE_DISTRICT', districtId: district.id, method: 'strategic', candidateIds: [id] })).toThrow('자금이 부족');
  });
  it('a primary picks the winner by Slice §26 factors plus bounded noise, deterministically, and raises participant trust and organization', () => {
    const strong = withRecruits(base, (p, i) => i === 0 ? { regionId: district.regionId, attributes: { ...p.attributes, localBase: 95, recognition: 95, campaigning: 95, broadAppeal: 95, negotiation: 95 } }
      : i === 1 ? { attributes: { ...p.attributes, localBase: 5, recognition: 5, campaigning: 5, broadAppeal: 5, negotiation: 5 } } : {});
    const ids = [strong.politicians[1]!.id, strong.politicians[0]!.id];
    expect(primaryScore(strong.politicians[0]!, district) - primaryScore(strong.politicians[1]!, district)).toBeGreaterThan(2 * nm.primary.noise);
    const s = run(strong, { type: 'NOMINATE_DISTRICT', districtId: district.id, method: 'primary', candidateIds: ids });
    expect(s.nominations.districts[district.id]!.politicianId).toBe(strong.politicians[0]!.id);
    expect(s.nominations.primaryParticipants).toEqual([...ids].sort());
    expect(s.politicians[0]!.trust).toBe(Math.min(100, strong.politicians[0]!.trust + nm.primary.participantTrust + nm.primary.winnerTrust));
    expect(s.politicians[1]!.trust).toBe(Math.min(100, strong.politicians[1]!.trust + nm.primary.participantTrust));
    expect(s.regionalOrganization[district.regionId]!.level).toBe(Math.min(100, strong.regionalOrganization[district.regionId]!.level + nm.primary.organizationLevel));
    expect(stateHash(run(strong, { type: 'NOMINATE_DISTRICT', districtId: district.id, method: 'primary', candidateIds: ids }))).toBe(stateHash(s));
    expect(s.resources!.money).toBe(strong.resources!.money - nm.primary.money - 1500);
    expect(() => run(strong, { type: 'NOMINATE_DISTRICT', districtId: district.id, method: 'primary', candidateIds: [ids[0]!] })).toThrow('경선은');
  });
  it('strategic nomination lowers passed-over regional recruits\' trust, softened by the nominee\'s Negotiation', () => {
    const local = withRecruits(base, p => ({ regionId: district.regionId, trust: 60, attributes: { ...p.attributes, negotiation: 0 } }));
    const nominee = local.politicians[0]!.id, other = local.politicians[1]!.id;
    const hard = run(local, { type: 'NOMINATE_DISTRICT', districtId: district.id, method: 'strategic', candidateIds: [nominee] });
    const smooth = run({ ...local, politicians: local.politicians.map((p, i) => i === 0 ? { ...p, attributes: { ...p.attributes, negotiation: 100 } } : p) },
      { type: 'NOMINATE_DISTRICT', districtId: district.id, method: 'strategic', candidateIds: [nominee] });
    const trustOf = (s: GameState) => s.politicians.find(p => p.id === other)!.trust;
    expect(trustOf(hard)).toBe(60 - nm.strategic.passedOverTrust);
    expect(trustOf(smooth)).toBeGreaterThan(trustOf(hard)); expect(trustOf(smooth)).toBeLessThan(60);
    expect(hard.regionalOrganization[district.regionId]!.level).toBe(Math.max(0, local.regionalOrganization[district.regionId]!.level - nm.strategic.organizationLevel));
  });
});

describe('D3 list', () => {
  const s0 = withRecruits(atList);
  const women = s0.politicians.filter(p => p.gender === 'female').map(p => p.id), men = s0.politicians.filter(p => p.gender === 'male').map(p => p.id);
  const zip = (n: number) => Array.from({ length: n }, (_, i) => i % 2 === 0 ? women[i >> 1]! : men[i >> 1]!);
  it('takes 10–15 names with women at odd positions and at least half women; deposits follow the list size', () => {
    expect(women.length).toBeGreaterThanOrEqual(8); expect(men.length).toBeGreaterThanOrEqual(7);
    const list = zip(10);
    const s = run(s0, { type: 'SET_LIST', politicianIds: list });
    expect(s.nominations.list).toEqual(list); expect(s.resources!.money).toBe(s0.resources!.money - 10 * 500); expect(s.resources!.money).toBe(conservation(s));
    expect(run(s, { type: 'SET_LIST', politicianIds: [] }).resources!.money).toBe(s0.resources!.money);
    expect(() => run(s0, { type: 'SET_LIST', politicianIds: zip(9) })).toThrow('10~15명');
    expect(() => run(s0, { type: 'SET_LIST', politicianIds: zip(16) })).toThrow('10~15명');
    expect(() => run(s0, { type: 'SET_LIST', politicianIds: [men[5]!, ...zip(10).slice(1)] })).toThrow('홀수 순위');
    // With women at every odd position the 50% share follows; it is still checked separately.
    const share = zip(10);
    const noOddRule = { ...s0, electionRuleset: { ...s0.electionRuleset, currentLaw: { ...s0.electionRuleset.currentLaw, listGenderRule: 'none' as 'odd_positions_female' } } };
    expect(() => run(noOddRule, { type: 'SET_LIST', politicianIds: [...men.slice(0, 6), ...women.slice(0, 4)] })).toThrow('50% 이상');
    expect(() => run(s0, { type: 'SET_LIST', politicianIds: [...share.slice(0, 9), share[0]!] })).toThrow('한 번만');
  });
  it('forbids dual candidacy between a district and the list', () => {
    const district = active[0]!;
    const list = zip(10);
    let s = run(s0, { type: 'SET_TARGET_DISTRICT', districtId: district.id, targeted: true }, { type: 'SET_LIST', politicianIds: list });
    expect(() => run(s, { type: 'NOMINATE_DISTRICT', districtId: district.id, method: 'strategic', candidateIds: [list[0]!] })).toThrow('중복입후보');
    s = run(s, { type: 'NOMINATE_DISTRICT', districtId: district.id, method: 'strategic', candidateIds: [men[6]!] });
    expect(() => run(s, { type: 'SET_LIST', politicianIds: [...list.slice(0, 9), men[6]!] })).toThrow('중복입후보');
  });
});

describe('D3 registration and Phase C promises', () => {
  it('closes registration on the deadline and resolves nomination promises', () => {
    const district = active.find(d => d.regionId === 'seoul')!;
    let s = withRecruits(run(atList, { type: 'SET_TARGET_DISTRICT', districtId: district.id, targeted: true }), (_, i) => i < 3 ? { regionId: district.regionId } : {});
    const [a, b, c] = s.politicians.map(p => p.id) as [string, string, string];
    const promise = (n: number, politicianId: string, type: 'primary_guarantee' | 'regional_priority') => ({ id: `promise-${String(n).padStart(3, '0')}`, politicianId, type, madeAt: s.date, due: 'NOMINATION' as const, status: 'pending' as const, resolvedAt: null });
    s = { ...s, promises: [promise(1, a, 'primary_guarantee'), promise(2, c, 'primary_guarantee'), promise(3, a, 'regional_priority'), promise(4, b, 'regional_priority')] };
    s = run(s, { type: 'NOMINATE_DISTRICT', districtId: district.id, method: 'primary', candidateIds: [a, b] });
    const winner = s.nominations.districts[district.id]!.politicianId;
    const reputation = s.recruitmentReputation!;
    s = advanceTo(s, nm.gates.registration);
    expect(s.nominations.registeredAt).toBe(nm.gates.registration);
    expect(nominationStage(s)).toBe('registered');
    const status = Object.fromEntries(s.promises.map(p => [p.id, p.status]));
    expect(status['promise-001']).toBe('kept'); expect(status['promise-002']).toBe('broken');
    expect(status['promise-003']).toBe(winner === a ? 'kept' : 'broken'); expect(status['promise-004']).toBe(winner === b ? 'kept' : 'broken');
    expect(s.recruitmentReputation).toBeLessThan(reputation);
    expect(s.events.some(e => e.type === 'REGISTRATION_CLOSED')).toBe(true);
    expect(() => run(s, { type: 'NOMINATE_DISTRICT', districtId: district.id, method: 'none', candidateIds: [] })).toThrow('마감');
    expect(() => run(s, { type: 'SET_LIST', politicianIds: [] })).toThrow('마감');
  });
});

describe('D3 district projection with nominees', () => {
  const district = active.find(d => d.regionId === 'seoul')!;
  const s0 = withRecruits(run(atNominations, { type: 'SET_TARGET_DISTRICT', districtId: district.id, targeted: true }), (_, i) => i === 0 ? { regionId: district.regionId } : {});
  it('before the nomination stage the player is a party everywhere; afterwards it stands only where nominated', () => {
    expect(projectDistricts(atTargets).every(p => p.playerStanding && (p.final.player ?? 0) > 0)).toBe(true);
    expect(projectDistricts(s0).every(p => !p.playerStanding && p.final.player === undefined)).toBe(true);
    const s = run(s0, { type: 'NOMINATE_DISTRICT', districtId: district.id, method: 'strategic', candidateIds: [s0.politicians[0]!.id] });
    const projections = projectDistricts(s), mine = projections.find(p => p.id === district.id)!;
    expect(mine.playerStanding).toBe(true); expect(mine.candidate).toEqual(candidateEffect(s, district)); expect(mine.final.player!).toBeGreaterThan(0);
    expect(projections.filter(p => p.playerStanding).map(p => p.id)).toEqual([district.id]);
    const sum = (v: Record<string, number>) => Object.values(v).reduce((x, y) => x + y, 0);
    for (const p of projections) expect(sum(p.final)).toBe(1_000_000);
  });
  it('a stronger nominee (LocalBase, Campaigning, BroadAppeal, Recognition) never lowers the district estimate', () => {
    const at = (level: number) => {
      const s = { ...s0, politicians: s0.politicians.map((p, i) => i === 0 ? { ...p, attributes: { ...p.attributes, localBase: level, campaigning: level, broadAppeal: level, recognition: level } } : p) };
      return projectDistricts(run(s, { type: 'NOMINATE_DISTRICT', districtId: district.id, method: 'strategic', candidateIds: [s0.politicians[0]!.id] })).find(p => p.id === district.id)!;
    };
    const shares = [10, 40, 70, 100].map(l => at(l).sincere.player!);
    for (let i = 1; i < shares.length; i++) expect(shares[i]!).toBeGreaterThanOrEqual(shares[i - 1]!);
    expect(shares[3]!).toBeGreaterThan(shares[0]!);
  });
});

describe('D3 saves', () => {
  it('a real recruit-and-nominate sequence replays and round-trips', () => {
    let s = atNominations;
    for (const p of s.politicians.filter(p => p.status === 'prospect')) {
      if (s.politicians.filter(x => x.status === 'recruited').length >= 1) break;
      try { s = dispatchCommand(s, { type: 'RECRUIT_POLITICIAN', politicianId: p.id, role: 'member', promises: ['primary_guarantee', 'regional_priority'] }); } catch { /* shortage or not available */ }
    }
    const recruit = s.politicians.find(p => p.status === 'recruited')!;
    expect(recruit).toBeDefined();
    const district = active.find(d => d.regionId === recruit.regionId) ?? active[0]!;
    s = run(s, { type: 'SET_TARGET_DISTRICT', districtId: district.id, targeted: true }, { type: 'NOMINATE_DISTRICT', districtId: district.id, method: 'strategic', candidateIds: [recruit.id] });
    expect(stateHash(replay(42, s.commandLog))).toBe(stateHash(s));
    expect(stateHash(deserializeSave(serializeSave(s)))).toBe(stateHash(s));
  });
  it('rejects real D2 saves (schema 8) with Korean keep-JSON guidance', () => {
    expect(legacyD2.state.schemaVersion).toBe(8); expect(legacyD2.checksum).toBe(stateHash(legacyD2.state));
    expect(() => deserializeSave(JSON.stringify(legacyD2))).toThrow('D2 세이브(스키마 8)는 공천·명부가 추가된 현재 버전(스키마 15)과 호환되지 않습니다. 기존 JSON을 보관');
  });
});
