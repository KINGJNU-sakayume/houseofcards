import { describe, expect, it } from 'vitest';
import legacy from './fixtures/phase-b2-v2.json' with { type: 'json' };
import { createGame, dispatchCommand, replay, MAX_COMMANDS } from '../src/engine/simulation/engine';
import { createFoundedGame, foundingCommand } from './helpers';
import { stateHash } from '../src/engine/simulation/determinism';
import { deserializeSave, serializeSave, MAX_SAVE_BYTES } from '../src/persistence/codec';
import { partyManagement as data, partyManagementSchema } from '../src/data/seeds/party-management';
import { realityPack, policyLevers } from '../src/data/reality';
import { CORE_VALUES, DOMAIN_IDS } from '../src/types/simulation';
import type { Command, GameState } from '../src/types/game';
import { applyPublicationCost, growExpertise, publicationCost, researchCost, settleWeek, staffCap, weeklyFinance } from '../src/engine/parties/management';
import { updatePartyAI } from '../src/engine/parties/ai';
import { updateViability } from '../src/engine/voters/dynamics';
import { handleEngineRequest } from '../src/engine/simulation/protocol';
import { deriveStream, randomInt, streamKey } from '../src/engine/simulation/rng';
const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s));
const advance = (s: GameState, n = 1) => { for (let i = 0; i < n; i++) s = dispatchCommand(s, { type: 'ADVANCE_WEEK' }); return s; };
const conservation = (s: GameState) => s.finance!.initialMoney + s.finance!.ledgerTruncatedSum + s.finance!.ledger.reduce((sum, e) => sum + e.amount, 0);

describe('C1 founding and compatibility', () => {
  it('starts with five parties and an explicit absence of player analysis, then founds once without fake polling history', () => {
    const initial = createGame(42);
    expect(initial.status).toBe('founding'); expect(initial.playerParty).toBeNull(); expect(initial.resources).toBeNull();
    expect(initial.platforms).toHaveLength(5); expect(initial.politics.analysis.playerPartyId).toBeNull(); expect(initial.politics.analysis.barriers).toBeNull();
    for (const text of [JSON.stringify(initial.platforms), JSON.stringify(initial.cohorts), JSON.stringify(initial.politics)]) expect(text).not.toMatch(/"player"|player-preview/);
    expect(stateHash(deserializeSave(serializeSave(initial)))).toBe(stateHash(initial));
    for (const command of [{ type: 'ADVANCE_WEEK' }, { type: 'SET_PLATFORM_DRAFT', leverId: 'housing.rent-support', value: 4 }, { type: 'PUBLISH_PLATFORM', leverId: 'housing.rent-support' }, { type: 'COMMISSION_INTERNAL_SURVEY' }, { type: 'SET_STAFF_LEVEL', level: 1 }, { type: 'START_POLICY_RESEARCH', domain: 'housing' }, { type: 'RESPOND_INBOX', messageId: 'x' }] as Command[]) expect(() => dispatchCommand(initial, command)).toThrow('먼저 정당을 창당');
    const founded = dispatchCommand(initial, foundingCommand);
    expect(() => dispatchCommand(founded, foundingCommand)).toThrow('한 번'); expect(founded.platforms).toHaveLength(6);
    expect(founded.politics.polls).toBe(initial.politics.polls); expect(founded.politics.polls[0]!.national.results.player).toBeUndefined();
    expect(founded.politics.analysis.playerPartyId).toBe('player'); expect(founded.politics.analysis.barriers).not.toBeNull();
    for (const position of Object.values(founded.platforms.find(p => p.partyId === 'player')!.positions)) expect(position).toMatchObject({ draftValue: 2, publishedValue: null });
    expect(founded.finance!.members).toBeGreaterThanOrEqual(8000); expect(founded.finance!.members).toBeLessThanOrEqual(15000);
    expect(Object.values(founded.regionalOrganization).reduce((sum, r) => sum + r.members, 0)).toBe(founded.finance!.members);
    for (const vector of [founded.politics.analysis.currentSupport, founded.politics.analysis.potentialSupport, ...Object.values(founded.politics.analysis.byRegion), ...Object.values(founded.politics.analysis.byAge)]) expect(Object.values(vector).reduce((a, b) => a + b, 0)).toBe(1000000);
    expect(founded.politics.parties.find(p => p.partyId === 'player')!.expertise).toEqual(data.newParty.expertise);
  });
  it('validates NFKC names, values, forbidden names and colors in the engine', () => {
    const state = createGame(9);
    for (const fields of [{ values: [] }, { values: ['housing', 'housing', 'science'] }, { values: ['housing', 'science', 'bogus'] }, { name: 'a' }, { name: '가'.repeat(21) }, { shortName: '일곱글자약칭당' }, { name: '당\u0001이름' }, { name: '가상\u200b정당' }, { name: 'ＫＢＳ미래' }, { name: 'minor-bloc' }, { color: '#ff0000' }, ...realityPack.parties.flatMap(p => [{ name: p.name.value }, { shortName: p.shortName.value }])]) expect(() => dispatchCommand(state, { ...foundingCommand, ...fields } as Command)).toThrow();
    expect(dispatchCommand(state, { ...foundingCommand, name: '  ＡＢＣ당  ', shortName: ' ＡＢ ' }).playerParty).toMatchObject({ name: 'ABC당', shortName: 'AB' });
    const normalized = dispatchCommand(state, { ...foundingCommand, name: ' '.repeat(200) + 'ＡＢ당', shortName: ' ＡＢ ' });
    expect(stateHash(deserializeSave(serializeSave(normalized)))).toBe(stateHash(normalized));
    expect(CORE_VALUES).toHaveLength(10); expect(partyManagementSchema.safeParse({ ...data, extra: true }).success).toBe(false);
    expect(partyManagementSchema.safeParse({ ...data, research: { ...data.research, affinityDiscount: 250001 } }).success).toBe(false);
  });
  it('keeps all AI initialization and old house effects intact and new streams independent', () => {
    const before = createGame(11), founded = dispatchCommand(before, foundingCommand);
    for (const c of before.cohorts) for (const [id, p] of Object.entries(before.politics.perceptions[c.id]!)) expect(founded.politics.perceptions[c.id]![id]).toEqual(p);
    for (const house of before.politics.pollHouses) for (const id of Object.keys(house.effects)) expect(founded.politics.pollHouses.find(h => h.id === house.id)!.effects[id]).toBe(house.effects[id]);
    const a = updatePartyAI({ ...before, date: '2026-10-26' }), b = updatePartyAI({ ...founded, date: '2026-10-26' });
    expect(a.changes).toEqual(b.changes); expect(a.state.platforms).toEqual(b.state.platforms.filter(p => p.partyId !== 'player'));
    const extra = { ...before, rngState: { ...before.rngState, [streamKey('unrelated', before.date)]: randomInt(deriveStream(11, 'unrelated', before.date), 50).state } };
    expect(dispatchCommand(extra, foundingCommand).politics).toEqual(founded.politics);
    expect(founded.rngState[streamKey('cohort-calibration', before.date)]).toBe(before.rngState[streamKey('cohort-calibration', before.date)]);
  });
  it('rejects an authentic B2 fixture with keep-JSON guidance and replays C1 identically through worker/save', () => {
    expect(legacy.checksum).toBe(stateHash(legacy.state)); expect(legacy.state.phase).toBe('B2');
    expect(() => deserializeSave(JSON.stringify(legacy))).toThrow('B2 세이브'); expect(() => deserializeSave(JSON.stringify(legacy))).toThrow('기존 JSON을 보관');
    let s = createFoundedGame(12); s = dispatchCommand(s, { type: 'START_POLICY_RESEARCH', domain: 'housing' });
    const response = handleEngineRequest({ id: 1, state: createGame(12), command: foundingCommand });
    expect(response.ok).toBe(true); if (response.ok) expect(response.hash).toBe(stateHash(createFoundedGame(12)));
    s = advance(s, 2); expect(stateHash(replay(s.seed, s.commandLog))).toBe(stateHash(s));
    const restored = deserializeSave(serializeSave(s)); expect(restored.research).toEqual(s.research);
    expect(stateHash(advance(restored, 2))).toBe(stateHash(advance(s, 2)));
  });
  it('enforces UTF-8 byte and command boundaries', () => {
    const serialized = serializeSave(createGame(2)), bytes = new TextEncoder().encode(serialized).length;
    expect(() => deserializeSave(serialized + ' '.repeat(MAX_SAVE_BYTES - bytes))).not.toThrow();
    expect(() => deserializeSave(serialized + ' '.repeat(MAX_SAVE_BYTES - bytes + 1))).toThrow('8MB');
    expect(() => deserializeSave('가'.repeat(Math.floor(MAX_SAVE_BYTES / 3) + 1))).toThrow('8MB');
    expect(MAX_COMMANDS).toBe(6000);
  });
});

describe('C1 atomic resources, weekly finance and publication', () => {
  it('rejects shortages atomically and charges exact publication costs while drafts and no-op publications stay free', () => {
    const initial = createFoundedGame(1), draft = dispatchCommand(initial, { type: 'SET_PLATFORM_DRAFT', leverId: 'housing.rent-support', value: 4 });
    expect(draft.resources).toBe(initial.resources);
    const cost = publicationCost(draft, 'housing.rent-support'); expect(cost).toEqual({ staffCapacity: 3, agendaSlots: 1 });
    const published = dispatchCommand(draft, { type: 'PUBLISH_PLATFORM', leverId: 'housing.rent-support' });
    expect(published.resources).toEqual({ ...draft.resources!, staffCapacity: draft.resources!.staffCapacity - 3, agendaSlots: draft.resources!.agendaSlots - 1 });
    expect(dispatchCommand(published, { type: 'PUBLISH_PLATFORM', leverId: 'housing.rent-support' })).toBe(published);
    for (const resources of [{ ...draft.resources!, agendaSlots: 0 }, { ...draft.resources!, staffCapacity: 0 }]) {
      const poor = { ...draft, resources }, before = stateHash(poor);
      expect(() => dispatchCommand(poor, { type: 'PUBLISH_PLATFORM', leverId: 'housing.rent-support' })).toThrow('부족'); expect(stateHash(poor)).toBe(before);
    }
    let reversed = dispatchCommand(published, { type: 'SET_PLATFORM_DRAFT', leverId: 'housing.rent-support', value: 0 });
    expect(publicationCost(reversed, 'housing.rent-support').staffCapacity).toBe(7);
    reversed = { ...reversed, resources: { ...reversed.resources!, staffCapacity: 6 } };
    const hash = stateHash(reversed); expect(() => dispatchCommand(reversed, { type: 'PUBLISH_PLATFORM', leverId: 'housing.rent-support' })).toThrow('Staff Capacity'); expect(stateHash(reversed)).toBe(hash);
    reversed = advance(reversed); const paid = applyPublicationCost(reversed, 'housing.rent-support'); expect(paid.resources!.staffCapacity).toBe(reversed.resources!.staffCapacity - 7);
  });
  it('refills to a cap rather than accumulating and applies staff-level capacity only on refill', () => {
    const initial = createFoundedGame(2), hired = dispatchCommand(initial, { type: 'SET_STAFF_LEVEL', level: 1 });
    expect(hired.resources!.staffCapacity).toBe(initial.resources!.staffCapacity); expect(hired.resources!.money).toBe(initial.resources!.money - 3000);
    const refilled = advance(hired); expect(refilled.resources!.staffCapacity).toBe(staffCap(refilled)); expect(refilled.resources!.agendaSlots).toBe(data.finance.agendaCap);
    const reduced = dispatchCommand(refilled, { type: 'SET_STAFF_LEVEL', level: 0 }); expect(reduced.resources).toEqual(refilled.resources);
    expect(advance(reduced).resources!.staffCapacity).toBe(reduced.resources!.staffCapacity);
    expect(dispatchCommand(reduced, { type: 'SET_STAFF_LEVEL', level: 0 })).toBe(reduced);
  });
  it('conserves money beyond 100 ledger entries and leaves idle players solvent through all 77 advances', () => {
    let s = createFoundedGame(3);
    for (let week = 0; week < 77; week++) { s = advance(s); expect(s.resources!.money).toBe(conservation(s)); expect(s.resources!.money).toBeGreaterThanOrEqual(0); }
    expect(s.finance!.ledger).toHaveLength(100); expect(s.finance!.ledgerTruncatedSum).not.toBe(0); expect(s.finance!.arrears).toBe(0);
    expect(s.resources!.money).toBeGreaterThan(0); expect(s.status).toBe('phase_complete');
  });
  it('records arrears, caps paid cash at zero and halves a refill while unpaid, then repays arrears', () => {
    let s = clone(createFoundedGame(4)); s.date = '2026-10-26'; s.resources!.money = 0; s.finance!.initialMoney = 0; s.finance!.staffLevel = 4;
    const weekly = weeklyFinance(s), settled = settleWeek(s, true);
    expect(settled.resources!.money).toBe(0); expect(settled.finance!.arrears).toBe(weekly.expenses - weekly.income);
    expect(settled.resources!.staffCapacity).toBe(Math.floor((data.finance.baseStaffCapacity + data.staffLevels[4]!.capacity) / 2));
    expect(settled.inbox.some(m => m.priority === 'Critical')).toBe(true); expect(settled.resources!.money).toBe(conservation(settled));
    s = clone(settled); s.resources!.money = 100000; s.finance!.initialMoney += 100000;
    const repaid = settleWeek(s, true); expect(repaid.finance!.arrears).toBe(0); expect(repaid.resources!.staffCapacity).toBe(staffCap(repaid)); expect(repaid.resources!.money).toBe(conservation(repaid));
  });
});

describe('C1 expertise, surveys, lagged viability and inbox', () => {
  it('uses bounded value affinities for research, completes after four weeks and grows with diminishing capped gains', () => {
    const s = createFoundedGame(5); expect(researchCost(s, 'housing').staffCapacity).toBe(3); expect(researchCost(s, 'political-reform').staffCapacity).toBe(4);
    const researching = dispatchCommand(s, { type: 'START_POLICY_RESEARCH', domain: 'housing' }); expect(() => dispatchCommand(researching, { type: 'START_POLICY_RESEARCH', domain: 'housing' })).toThrow('이미 연구');
    const player = (x: GameState) => x.politics.parties.find(p => p.partyId === 'player')!;
    expect(player(advance(researching, 3)).expertise).toEqual(player(s).expertise);
    const finished = advance(researching, 4); expect(finished.research).toHaveLength(0); expect(player(finished).expertise.housing).toBeGreaterThan(player(s).expertise.housing);
    expect(finished.inbox.some(m => m.title.includes('연구 완료'))).toBe(true);
    expect(finished.politics.parties.filter(p => p.partyId !== 'player').map(p => p.expertise)).toEqual(s.politics.parties.filter(p => p.partyId !== 'player').map(p => p.expertise));
    const first = growExpertise(s, 'housing', data.research.gain), second = growExpertise(first, 'housing', data.research.gain);
    expect(player(second).expertise.housing - player(first).expertise.housing).toBeLessThan(player(first).expertise.housing - player(s).expertise.housing);
    let capped = s; for (let i = 0; i < 150; i++) capped = growExpertise(capped, 'housing', data.research.gain); expect(player(capped).expertise.housing).toBeLessThanOrEqual(data.research.expertiseCap);
    let published = dispatchCommand(s, { type: 'PUBLISH_PLATFORM', leverId: policyLevers[0]!.id }); expect(player(published).expertise).toEqual(player(s).expertise);
    const lever = policyLevers.find(l => l.domain === policyLevers[0]!.domain && l.id !== policyLevers[0]!.id)!;
    published = dispatchCommand(published, { type: 'PUBLISH_PLATFORM', leverId: lever.id }); expect(player(published).expertise[lever.domain]).toBeGreaterThan(player(s).expertise[lever.domain]);
  });
  it('charges for immutable snapshots, retains twelve and never feeds a survey to polls or AI', () => {
    const s = createFoundedGame(6), survey = dispatchCommand(s, { type: 'COMMISSION_INTERNAL_SURVEY' });
    expect(s.internalSurveys).toHaveLength(0); expect(survey.resources!.money).toBe(s.resources!.money - data.survey.money); expect(survey.resources!.staffCapacity).toBe(s.resources!.staffCapacity - data.survey.staffCapacity);
    const snapshot = survey.internalSurveys[0]!, hash = stateHash(snapshot);
    expect(Object.isFrozen(snapshot.analysis)).toBe(true); expect(advance(survey).politics).toEqual(advance(s).politics); expect(stateHash(snapshot)).toBe(hash);
    const poor = { ...s, resources: { ...s.resources!, money: 0 } }; const before = stateHash(poor);
    expect(() => dispatchCommand(poor, { type: 'COMMISSION_INTERNAL_SURVEY' })).toThrow('Money'); expect(stateHash(poor)).toBe(before);
    let current = s;
    for (let i = 0; i < 13; i++) { current = dispatchCommand(current, { type: 'COMMISSION_INTERNAL_SURVEY' }); current = advance(current, 5); }
    expect(current.internalSurveys).toHaveLength(12); expect(current.internalSurveys[0]!.date).not.toBe(s.date);
  });
  it('waits for a containing poll before changing player viability and preserves pre-founding history', () => {
    const s = createFoundedGame(7), first = advance(s);
    expect(first.politics.polls[0]!.national.results.player).toBeUndefined(); expect(first.politics.polls[1]!.national.results.player).toBeDefined();
    expect(first.politics.viability.player).toBe(data.newParty.viability); expect(first.politics.viabilityInput.shares.player).toBeUndefined();
    const later = { ...first, date: '2026-11-30' }, expected = updateViability(later);
    expect(expected.viabilityInput.shares.player).toBe(first.politics.polls[1]!.national.results.player!.point);
    expect(Number.isFinite(expected.viability.player)).toBe(true);
    for (const d of DOMAIN_IDS) expect(first.politics.parties.find(p => p.partyId === 'player')!.expertise[d]).toBe(data.newParty.expertise[d]);
  });
  it('emits real triggers only, retains sixty and includes honest Phase D milestone notices', () => {
    let s = createFoundedGame(8); expect(s.inbox).toHaveLength(2);
    s = advance(s, 2); const count = s.inbox.length; s = advance(s); expect(s.inbox).toHaveLength(count);
    s = advance(s, 74); expect(s.inbox.length).toBeLessThanOrEqual(60); expect(s.inbox.some(m => m.body.includes('이 기능은 아직 구현되지 않았습니다'))).toBe(true);
  });
});
