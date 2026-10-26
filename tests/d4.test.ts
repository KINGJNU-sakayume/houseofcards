import { describe, expect, it } from 'vitest';
import legacyD3 from './fixtures/phase-d3-v9.json' with { type: 'json' };
import { electionModel as em } from '../src/data/seeds/election';
import { nominationModel as nm } from '../src/data/seeds/nomination';
import { districtPack } from '../src/data/reality/districts';
import { computeElection } from '../src/engine/election/election';
import { campaignStrength, messageExposure, weeklyCost } from '../src/engine/election/finalPush';
import { projectDistricts } from '../src/engine/election/districts';
import { dispatchCommand, replay } from '../src/engine/simulation/engine';
import { stateHash } from '../src/engine/simulation/determinism';
import { deserializeSave, serializeSave } from '../src/persistence/codec';
import type { Command, GameState } from '../src/types/game';
import type { Politician } from '../src/types/people';
import { createFoundedGame } from './helpers';

const advanceTo = (s: GameState, date: string) => { while (s.date < date) s = dispatchCommand(s, { type: 'ADVANCE_WEEK' }); return s; };
const run = (s: GameState, ...commands: Command[]) => commands.reduce(dispatchCommand, s);
const conservation = (s: GameState) => s.finance!.initialMoney + s.finance!.ledgerTruncatedSum + s.finance!.ledger.reduce((sum, e) => sum + e.amount, 0);
const sum = (v: Record<string, number>) => Object.values(v).reduce((a, b) => a + b, 0);
function withRecruits(s: GameState, change: (p: Politician, i: number) => Partial<Politician> = () => ({})): GameState {
  return { ...s, politicians: s.politicians.map((p, i) => ({ ...p, status: 'recruited', role: 'member', recruitedAt: s.date, cooldownUntil: null, ...change(p, i) })),
    resources: { ...s.resources!, money: 1_000_000, staffCapacity: 200, agendaSlots: 20 }, finance: { ...s.finance!, initialMoney: s.finance!.initialMoney + 1_000_000 - s.resources!.money } };
}
const boost = (s: GameState, awareness: number): GameState => ({ ...s, politics: { ...s.politics, perceptions: Object.fromEntries(Object.entries(s.politics.perceptions).map(([c, v]) => [c, { ...v, player: { ...v.player!, awareness } }])) } });

const founded = run(createFoundedGame(42), { type: 'SET_PLATFORM_DRAFT', leverId: 'housing.rent-support', value: 4 }, { type: 'PUBLISH_PLATFORM', leverId: 'housing.rent-support' });
const district = districtPack.districts.find(d => d.active && d.regionId === 'seoul')!;
const nominated = (() => {
  const s = withRecruits(run(advanceTo(founded, nm.gates.nominations), { type: 'SET_TARGET_DISTRICT', districtId: district.id, targeted: true }), (_, i) => i === 0 ? { regionId: district.regionId } : {});
  return run(s, { type: 'NOMINATE_DISTRICT', districtId: district.id, method: 'strategic', candidateIds: [s.politicians[0]!.id] });
})();
const atPush = advanceTo(nominated, em.finalPush.start);

describe('D4 Final Push commands', () => {
  it('opens on 2028-01-17 and only allows nominated districts, bounded intensity and published message domains', () => {
    expect(() => run(nominated, { type: 'SET_CAMPAIGN', districtId: district.id, intensity: 1 })).toThrow(`${em.finalPush.start}부터`);
    const other = districtPack.districts.find(d => d.active && d.id !== district.id)!;
    expect(() => run(atPush, { type: 'SET_CAMPAIGN', districtId: other.id, intensity: 1 })).toThrow('공천한 지역구');
    expect(() => run(atPush, { type: 'SET_CAMPAIGN', districtId: district.id, intensity: em.finalPush.maxIntensity + 1 })).toThrow('유세 강도');
    expect(() => run(atPush, { type: 'SET_MESSAGES', national: 'pension', secondary: [] })).toThrow('공표한 공약이 없어');
    expect(() => run(atPush, { type: 'SET_MESSAGES', national: 'housing', secondary: ['housing'] })).toThrow('서로 달라야');
    const m = run(atPush, { type: 'SET_MESSAGES', national: 'housing', secondary: [] });
    expect(m.finalPush.nationalMessage).toBe('housing'); expect(m.resources!.agendaSlots).toBe(atPush.resources!.agendaSlots - em.finalPush.messageAgendaSlots);
    expect(() => run(atPush, { type: 'SET_LEADER_FOCUS', districtId: other.id })).toThrow('지도부');
    const c = run(atPush, { type: 'SET_CAMPAIGN', districtId: district.id, intensity: 2 }, { type: 'SET_LEADER_FOCUS', districtId: district.id });
    expect(weeklyCost(c)).toEqual({ money: 2 * em.finalPush.weeklyMoneyPerIntensity, staffCapacity: 2 * em.finalPush.weeklyStaffPerIntensity + em.finalPush.leaderStaff });
    expect(run(c, { type: 'SET_CAMPAIGN', districtId: district.id, intensity: 0 }).finalPush.campaign).toEqual({});
  });
  it('pays weekly, accumulates effort scaled by the nominee\'s Organization, and pauses on shortage', () => {
    const c = run(atPush, { type: 'SET_CAMPAIGN', districtId: district.id, intensity: 3 });
    const week = dispatchCommand(c, { type: 'ADVANCE_WEEK' });
    expect(week.finance!.ledger.some(e => e.kind === 'campaign')).toBe(true); expect(week.resources!.money).toBe(conservation(week));
    const effort = week.finalPush.effort[district.id]!;
    expect(effort).toBeGreaterThan(0); expect(week.finalPush.spent[district.id]).toBe(3 * em.finalPush.weeklyMoneyPerIntensity);
    const organized = { ...c, politicians: c.politicians.map((p, i) => i === 0 ? { ...p, attributes: { ...p.attributes, organization: 100 } } : p) };
    const unorganized = { ...c, politicians: c.politicians.map((p, i) => i === 0 ? { ...p, attributes: { ...p.attributes, organization: 0 } } : p) };
    expect(dispatchCommand(organized, { type: 'ADVANCE_WEEK' }).finalPush.effort[district.id]!).toBeGreaterThan(dispatchCommand(unorganized, { type: 'ADVANCE_WEEK' }).finalPush.effort[district.id]!);
    const poor = { ...c, resources: { ...c.resources!, money: 0 }, finance: { ...c.finance!, initialMoney: c.finance!.initialMoney - c.resources!.money } };
    const paused = dispatchCommand(poor, { type: 'ADVANCE_WEEK' });
    expect(paused.finalPush.effort[district.id] ?? 0).toBe(0);
    expect(paused.inbox.some(m => m.title.includes('유세를 하지 못했습니다'))).toBe(true);
    // Withdrawal takes the allocation with it.
    const withdrawn = run(week, { type: 'NOMINATE_DISTRICT', districtId: district.id, method: 'none', candidateIds: [] });
    expect(withdrawn.finalPush.campaign).toEqual({}); expect(withdrawn.finalPush.effort).toEqual({});
  });
  it('campaign effort and messages act through the chain, never as flat votes', () => {
    expect(campaignStrength(0)).toBe(0); expect(campaignStrength(1_000_000)).toBe(1_000_000);
    expect(campaignStrength(500_000)).toBeGreaterThan(500_000);
    const share = (effort: number) => projectDistricts({ ...atPush, finalPush: { ...atPush.finalPush, effort: { [district.id]: effort } } }).find(p => p.id === district.id)!.sincere.player!;
    const shares = [0, 300_000, 700_000, 1_000_000].map(share);
    for (let i = 1; i < shares.length; i++) expect(shares[i]!).toBeGreaterThanOrEqual(shares[i - 1]!);
    expect(shares[3]!).toBeGreaterThan(shares[0]!);
    const cohort = atPush.cohorts[0]!;
    expect(messageExposure(atPush, cohort.salience)).toBe(0);
    const messaged = run(atPush, { type: 'SET_MESSAGES', national: 'housing', secondary: [] });
    expect(messageExposure(messaged, cohort.salience)).toBeGreaterThan(0);
    const awareness = (s: GameState) => sum(Object.fromEntries(s.cohorts.map(c => [c.id, s.politics.perceptions[c.id]!.player!.awareness])));
    expect(awareness(advanceTo(messaged, '2028-02-07'))).toBeGreaterThan(awareness(advanceTo(atPush, '2028-02-07')));
  });
});

describe('D4 election', () => {
  const end = advanceTo(run(atPush, { type: 'SET_CAMPAIGN', districtId: district.id, intensity: 2 }), '2028-04-10');
  const e = end.election!;
  it('is held once on the last tick for the scheduled date, with seats from the ruleset data', () => {
    expect(advanceTo(atPush, '2028-04-03').election).toBeNull();
    expect(end.status).toBe('phase_complete'); expect(e.date).toBe('2028-04-12');
    expect(e.districts).toHaveLength(end.electionRuleset.districtSeats);
    expect(sum(e.districtSeats)).toBe(end.electionRuleset.districtSeats);
    expect(sum(e.listSeats)).toBe(end.electionRuleset.listSeats);
    expect(sum(e.totalSeats)).toBe(end.electionRuleset.districtSeats + end.electionRuleset.listSeats);
    for (const r of e.districts) {
      expect(sum(r.votes)).toBe(districtPack.districts.find(d => d.id === r.id)!.turnout2024);
      expect(r.votes[r.winner]).toBe(Math.max(...Object.values(r.votes)));
      expect(r.playerCandidate === null).toBe(r.id !== district.id);
      if (r.id !== district.id) expect(r.votes.player).toBeUndefined();
    }
    // No registered list → not on the list ballot.
    expect(e.listVotes.player).toBeUndefined(); expect(e.listSeats.player ?? 0).toBe(0);
    for (const v of Object.values(e.nationalSwing)) expect(Math.abs(v)).toBeLessThanOrEqual(em.electionDay.nationalSwingRelative);
    expect(end.events.filter(x => x.type === 'ELECTION_HELD')).toHaveLength(1);
    expect(dispatchCommand(end, { type: 'ADVANCE_WEEK' })).toBe(end);
    expect(() => run(end, { type: 'SET_CAMPAIGN', districtId: district.id, intensity: 1 })).toThrow();
  });
  it('the 0-seat branch keeps the party as extra-parliamentary (no revocation under current law)', () => {
    expect(end.electionRuleset.partyRevocation).toBeNull();
    expect(e.totalSeats.player).toBe(0); expect(e.outcome).toBe('extra_parliamentary');
    expect(end.inbox[0]!.body).toContain('원외 정당으로 존속');
    expect(e.deposits.paid).toBe(1500);
    expect(end.resources!.money).toBe(conservation(end));
  });
  it('is pure and deterministic; list seats go to the list in order; list deposits return when anyone is elected', () => {
    const before = { ...advanceTo(atPush, '2028-04-03') };
    expect(computeElection(before)).toEqual(computeElection(before));
    const list = before.politicians.slice(1, 11).map(p => p.id);
    const strong = boost({ ...before, nominations: { ...before.nominations, list } }, 1_000_000);
    const r = computeElection(strong);
    expect(r.listSeats.player!).toBeGreaterThan(0);
    expect(r.playerListElected).toEqual(list.slice(0, r.listSeats.player!));
    expect(r.outcome).toBe('in_parliament');
    expect(r.deposits.paid).toBe(1500 + 10 * 500);
    expect(r.deposits.refunded).toBeGreaterThanOrEqual(10 * 500);
  });
  it('rejects real D3 saves (schema 9) with Korean keep-JSON guidance', () => {
    expect(legacyD3.state.schemaVersion).toBe(9); expect(legacyD3.checksum).toBe(stateHash(legacyD3.state));
    expect(() => deserializeSave(JSON.stringify(legacyD3))).toThrow('D3 세이브(스키마 9)는 Final Push와 선거 결과가 추가된 현재 버전(스키마 16)과 호환되지 않습니다. 기존 JSON을 보관');
  });
});

describe('D4 real command sequence', () => {
  it('a full season with real recruitment, nomination, messages and campaign replays to the same election', () => {
    let s = advanceTo(founded, nm.gates.nominations);
    for (const p of s.politicians.filter(x => x.status === 'prospect')) {
      if (s.politicians.some(x => x.status === 'recruited')) break;
      try { s = dispatchCommand(s, { type: 'RECRUIT_POLITICIAN', politicianId: p.id, role: 'member', promises: ['primary_guarantee', 'regional_priority'] }); } catch { /* refused */ }
    }
    const recruit = s.politicians.find(p => p.status === 'recruited')!;
    const d = districtPack.districts.find(x => x.active && x.regionId === recruit.regionId) ?? district;
    s = run(s, { type: 'SET_TARGET_DISTRICT', districtId: d.id, targeted: true }, { type: 'NOMINATE_DISTRICT', districtId: d.id, method: 'strategic', candidateIds: [recruit.id] });
    s = run(advanceTo(s, em.finalPush.start), { type: 'SET_MESSAGES', national: 'housing', secondary: [] }, { type: 'SET_CAMPAIGN', districtId: d.id, intensity: 1 });
    s = advanceTo(s, '2028-04-10');
    expect(s.election).not.toBeNull();
    expect(stateHash(replay(42, s.commandLog))).toBe(stateHash(s));
    expect(stateHash(deserializeSave(serializeSave(s)))).toBe(stateHash(s));
    const tampered = JSON.parse(serializeSave(s)); tampered.state.election.totalSeats.player = 5;
    expect(() => deserializeSave(JSON.stringify(tampered))).toThrow();
  });
});
