import { describe, expect, it } from 'vitest';
import legacyC2b from './fixtures/phase-c2b-v5.json' with { type: 'json' };
import { dispatchCommand, replay, simulationFields } from '../src/engine/simulation/engine';
import { createFoundedGame } from './helpers';
import { stateHash } from '../src/engine/simulation/determinism';
import { deserializeSave, serializeSave } from '../src/persistence/codec';
import { organizationModel as org } from '../src/data/seeds/organization';
import { partyManagement } from '../src/data/seeds/party-management';
import { staffCap, weeklyFinance } from '../src/engine/parties/management';
import { investmentCost, monthlyOrganization } from '../src/engine/organization';
import { partyProfile, playerExposure, recruitExpertiseTargets, scoutingWeight } from '../src/engine/organization/channels';
import { REGION_IDS } from '../src/data/reality/schema';
import type { Command, GameState } from '../src/types/game';
import type { InvestmentKind } from '../src/types/party';

const advance = (s: GameState, n = 1) => { for (let i = 0; i < n; i++) s = dispatchCommand(s, { type: 'ADVANCE_WEEK' }); return s; };
const invest = (s: GameState, regionId: string, kind: InvestmentKind, intensity = 1) => dispatchCommand(s, { type: 'INVEST_REGION', regionId, kind, intensity });
const conservation = (s: GameState) => s.finance!.initialMoney + s.finance!.ledgerTruncatedSum + s.finance!.ledger.reduce((sum, e) => sum + e.amount, 0);
const meanAwareness = (s: GameState, id = 'player') => s.cohorts.reduce((a, c) => a + c.weight * s.politics.perceptions[c.id]![id]!.awareness, 0);
const published = (seed: number) => { let s = createFoundedGame(seed); s = dispatchCommand(s, { type: 'SET_PLATFORM_DRAFT', leverId: 'housing.rent-support', value: 4 }); return dispatchCommand(s, { type: 'PUBLISH_PLATFORM', leverId: 'housing.rent-support' }); };
// Recruit until `count` people accepted (deterministic per seed), with test-only resources.
function withRecruits(s: GameState, count: number): GameState {
  s = { ...s, resources: { ...s.resources!, staffCapacity: 500, money: 5_000_000 } };
  for (const p of s.politicians) {
    if (s.politicians.filter(x => x.status === 'recruited').length >= count) break;
    s = dispatchCommand(s, { type: 'RECRUIT_POLITICIAN', politicianId: p.id, role: 'member', promises: [] });
  }
  return s;
}

describe('C2c regional organization', () => {
  it('investments are atomic and validated', () => {
    const s = createFoundedGame(4);
    for (const [region, kind, intensity, message] of [['nowhere', 'member_drive', 1, '권역'], ['seoul', 'bogus', 1, '종류'], ['seoul', 'member_drive', 4, '강도'], ['seoul', 'local_office', 2, '강도']] as const)
      expect(() => invest(s, region, kind as InvestmentKind, intensity)).toThrow(message);
    const once = invest(s, 'seoul', 'member_drive', 2);
    expect(once.resources!.money).toBe(s.resources!.money - investmentCost('member_drive', 2).money!);
    expect(once.resources!.staffCapacity).toBe(s.resources!.staffCapacity - investmentCost('member_drive', 2).staffCapacity!);
    expect(() => invest(once, 'seoul', 'member_drive')).toThrow('이미 진행 중');
    const poor: GameState = { ...s, resources: { ...s.resources!, staffCapacity: 1 } };
    expect(() => invest(poor, 'seoul', 'policy_forum')).toThrow('Staff Capacity가 부족합니다');
    expect(s.commandLog).toHaveLength(1);
  });
  it('member drives complete after their weeks, raise members, level and dues; aggregates equal sums', () => {
    const s = invest(createFoundedGame(6), 'pk', 'member_drive', 3);
    const before = s.regionalOrganization.pk!, income = weeklyFinance(s).income;
    const pending = advance(s, org.kinds.member_drive.weeks - 1);
    expect(pending.regionalOrganization.pk!.members).toBe(before.members);
    const done = advance(s, org.kinds.member_drive.weeks);
    expect(done.regionalOrganization.pk).toMatchObject({ members: before.members + 3 * org.kinds.member_drive.members, level: before.level + 3 * org.kinds.member_drive.level, investments: [] });
    expect(Object.values(done.regionalOrganization).reduce((sum, r) => sum + r.members, 0)).toBe(done.finance!.members);
    expect(weeklyFinance(done).income).toBeGreaterThan(income);
    expect(done.events.some(e => e.type === 'INVESTMENT_COMPLETED')).toBe(true);
  });
  it('offices add weekly rent and staff capacity, slow decay, and keep the ledger conserved', () => {
    const s = invest(createFoundedGame(8), 'seoul', 'local_office');
    const done = advance(s, org.kinds.local_office.weeks);
    expect(done.regionalOrganization.seoul!.office).toBe(true);
    expect(() => invest(done, 'seoul', 'local_office')).toThrow('이미 지역사무소');
    expect(weeklyFinance(done).expenses).toBe(partyManagement.staffLevels[0]!.weeklyPayroll + org.officeRent);
    expect(staffCap(done)).toBe(staffCap(createFoundedGame(8)) + org.officeStaff);
    const later = advance(done, 40);
    expect(later.resources!.money).toBe(conservation(later));
    // Same region and history, with and without an office: the office halves monthly decay.
    const stale = (office: boolean): GameState => ({ ...done, regionalOrganization: { ...done.regionalOrganization, seoul: { ...done.regionalOrganization.seoul!, office, level: 50, lastActivity: '2026-01-01', investments: [] } } });
    expect(50 - monthlyOrganization(stale(true)).regionalOrganization.seoul!.level).toBe(org.officeDecayPerMonth);
    expect(50 - monthlyOrganization(stale(false)).regionalOrganization.seoul!.level).toBe(org.decayPerMonth);
    expect(later.events.some(e => e.type === 'ORGANIZATION_DECAYED')).toBe(true);
    for (const r of Object.values(advance(later, 37).regionalOrganization)) expect(r.level).toBeGreaterThanOrEqual(0);
  });
  it('awareness rises gradually through organization exposure, never without something to convey, and AI is untouched', () => {
    const quiet = createFoundedGame(10), quietInvested = invest(invest(quiet, 'seoul', 'policy_forum', 2), 'gyeonggi-incheon', 'policy_forum', 1);
    const q1 = advance(quiet, 12), q2 = advance(quietInvested, 12);
    // No publications and no recruits: exposure is zero, so organization has nothing to amplify.
    expect(q2.politics.perceptions).toEqual(q1.politics.perceptions);
    const base = published(10), boosted = invest(invest(base, 'seoul', 'policy_forum', 2), 'gyeonggi-incheon', 'policy_forum', 1);
    let a = base, b = boosted, previousGap = 0;
    for (let month = 0; month < 5; month++) {
      a = advance(a, 4); b = advance(b, 4);
      const gap = meanAwareness(b) - meanAwareness(a);
      expect(gap).toBeGreaterThanOrEqual(previousGap);
      expect(gap / 1_000_000).toBeLessThan(50_000); // < 5%p national awareness: gradual, not one-for-one
      previousGap = gap;
    }
    expect(previousGap).toBeGreaterThan(0);
    for (const id of ['dp', 'ppp', 'reform', 'rkp', 'minor-bloc']) expect(meanAwareness(b, id)).toBe(meanAwareness(a, id));
    expect(b.platforms.filter(p => p.partyId !== 'player')).toEqual(a.platforms.filter(p => p.partyId !== 'player'));
    expect(playerExposure(b, 'seoul', 0, 0)).toBe(0);
  });
  it('recruits add a capped, diminishing profile term and pull expertise up slowly (player only)', () => {
    const s = published(21), r1 = withRecruits(s, 1), r5 = withRecruits(s, 5);
    expect(partyProfile(s)).toBe(0);
    expect(partyProfile(r1)).toBeGreaterThan(0);
    expect(partyProfile(r5)).toBeLessThanOrEqual(org.profileCap);
    expect(partyProfile(r5) - partyProfile(r1)).toBeLessThan(4 * partyProfile(r1) + 1);
    const a = advance(s, 8), b = advance(r5, 8);
    expect(meanAwareness(b)).toBeGreaterThan(meanAwareness(a));
    const targets = recruitExpertiseTargets(r5, partyManagement.research.expertiseCap);
    const before = r5.politics.parties.find(p => p.partyId === 'player')!.expertise, after = b.politics.parties.find(p => p.partyId === 'player')!.expertise;
    for (const [domain, value] of Object.entries(after)) {
      expect(value).toBeLessThanOrEqual(partyManagement.research.expertiseCap);
      if (targets[domain]! > before[domain as keyof typeof before]!) expect(value).toBeGreaterThan(before[domain as keyof typeof before]!);
    }
    for (const id of ['dp', 'ppp']) expect(b.politics.parties.find(p => p.partyId === id)!.expertise).toEqual(s.politics.parties.find(p => p.partyId === id)!.expertise);
  });
  it('Phase D-only attributes have zero effect on the analysis', () => {
    const s = withRecruits(published(30), 3);
    const changed: GameState = { ...s, politicians: s.politicians.map(p => p.status !== 'recruited' ? p : { ...p, attributes: { ...p.attributes, localBase: 100 - p.attributes.localBase, campaigning: 0, organization: 100, broadAppeal: 3, negotiation: 99 } }) };
    expect(simulationFields(advance(changed, 9))).toEqual(simulationFields(advance(s, 9)));
  });
  it('candidate scouting raises only probability weights while active', () => {
    let s = invest(createFoundedGame(2), 'jeju', 'candidate_scouting', 3);
    expect(scoutingWeight(s, 'jeju')).toBe(1);
    s = advance(s, org.kinds.candidate_scouting.weeks);
    expect(scoutingWeight(s, 'jeju')).toBe(1 + 3 * org.scoutingWeightPerIntensity);
    for (const id of REGION_IDS.filter(r => r !== 'jeju')) expect(scoutingWeight(s, id)).toBe(1);
    const end = advance(s, org.boostWeeks + 1);
    expect(scoutingWeight(end, 'jeju')).toBe(1); expect(end.regionalOrganization.jeju!.scouting).toBeNull();
    expect(end.politicians.length).toBeLessThanOrEqual(80);
  });
  it('survives save, load and replay; real C2b saves are rejected', () => {
    let s = invest(invest(published(42), 'seoul', 'local_office'), 'honam', 'policy_forum', 2);
    s = advance(s, 9);
    expect(stateHash(deserializeSave(serializeSave(s)))).toBe(stateHash(s));
    expect(stateHash(replay(42, s.commandLog as Command[]))).toBe(stateHash(s));
    expect(legacyC2b.state.schemaVersion).toBe(5); expect(legacyC2b.checksum).toBe(stateHash(legacyC2b.state));
    expect(() => deserializeSave(JSON.stringify(legacyC2b))).toThrow('C2b 세이브(스키마 5)는 현재 버전(스키마 12)과 호환되지 않습니다. 기존 JSON을 보관');
  });
});
