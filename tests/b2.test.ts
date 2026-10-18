import { describe, expect, it } from 'vitest';
import golden from './fixtures/b2-golden.json' with { type: 'json' };
import type { Command } from '../src/types/game';
import { policyLevers, realityPack } from '../src/data/reality';
import { politicalModel as model } from '../src/data/seeds/political-model';
import type { GameState } from '../src/types/game';
import { CORE_VALUES, DOMAIN_IDS } from '../src/types/simulation';
import { considerationShares, computeAnalysis, evaluateSupport, fiscalCredibility, governmentTerm, neutralViability, platformIdentity, policyFit, trust } from '../src/engine/voters/model';
import { evolvePerceptions, smoothViability, updateViability, viabilityTarget } from '../src/engine/voters/dynamics';
import { createGame, dispatchCommand, replay, simulationFields } from '../src/engine/simulation/engine';
import { stateHash } from '../src/engine/simulation/determinism';
import { SCALE } from '../src/engine/simulation/math';
import { editDraft, publishPlatform } from '../src/engine/policy';
import { makePoll, pollMargin, integerSqrt } from '../src/engine/polling';
import { deriveStream, streamKey } from '../src/engine/simulation/rng';
import { platformDiversity, updateGovernmentAI, updatePartyAI } from '../src/engine/parties/ai';
import { checkCalibration } from '../src/engine/voters/calibration';
import { deserializeSave, serializeSave } from '../src/persistence/codec';
const clone = (state: GameState): GameState => JSON.parse(JSON.stringify(state));
const sum = (vector: Record<string, number>) => Object.values(vector).reduce((a, b) => a + b, 0);
const player = 'player-preview';
function nextMonth(state: GameState) {
  const date = state.politics.analysis.date;
  do { state = dispatchCommand(state, { type: 'ADVANCE_WEEK' }); } while (state.politics.analysis.date === date && state.status === 'active');
  return state;
}

describe('analytic consideration sets', () => {
  it('reduces to a hand-computed plain softmax when awareness is one', () => {
    const result = considerationShares(['a', 'b'], [0, 0], [SCALE, SCALE], 0);
    expect(result).toEqual({ a: 333334, b: 333333, none: 333333 });
    expect(considerationShares(['a', 'b'], [0, 0], [0, 0], 0)).toEqual({ a: 0, b: 0, none: SCALE });
    expect(considerationShares(['a', 'b'], [0, 0], [SCALE, 0], 0)).toEqual({ a: 500000, b: 0, none: 500000 });
  });
  it('enumerates subset probabilities and conserves shares including undecided', () => {
    const result = considerationShares(['a', 'b'], [0, 0], [500000, 500000], 0);
    expect(Math.abs(result.a! - 208333)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.b! - 208333)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.none! - 583334)).toBeLessThanOrEqual(1);
    expect(sum(result)).toBe(SCALE);
    let previous = -1;
    for (let awareness = 0; awareness <= SCALE; awareness += 10000) {
      const choice = considerationShares(['a', 'b'], [800000, 500000], [awareness, 700000]);
      expect(choice.a!).toBeGreaterThanOrEqual(previous);
      expect(sum(choice)).toBe(SCALE); previous = choice.a!;
    }
    expect(() => considerationShares(['a'], [0], [-1])).toThrow();
  });
  it('produces valid probabilities in all 96 cohorts and every aggregate', () => {
    const state = createGame(10), result = evaluateSupport(state);
    for (const row of result.prepared) {
      expect(sum(row.shares)).toBe(SCALE);
      expect(Object.values(row.shares).every(v => v >= 0 && Number.isInteger(v))).toBe(true);
    }
    for (const vector of Object.values(result.aggregated)) expect(sum(vector)).toBe(SCALE);
    expect(result.aggregated.national!.none).toBeGreaterThan(0);
  });
});

describe('published fit and counterfactual support', () => {
  it('prefers exact policy matches and weights salient domains more heavily', () => {
    const state = createGame(10), cohort = state.cohorts.find(c => c.id === 'seoul/18-29/housing-pressure')!;
    let match = state.platforms.find(p => p.partyId === player)!;
    for (const lever of policyLevers) match = publishPlatform(editDraft(match, lever.id, cohort.preferences[lever.id]!), lever.id, state.date);
    expect(policyFit(cohort, match, state.issues)).toBe(SCALE);
    let mismatch = match;
    for (const lever of policyLevers.filter(l => l.domain === 'housing')) mismatch = publishPlatform(editDraft(mismatch, lever.id, 0), lever.id, state.date);
    const high = { ...cohort, salience: Object.fromEntries(DOMAIN_IDS.map(d => [d, d === 'housing' ? 10000 : 1])) as typeof cohort.salience };
    const low = { ...cohort, salience: Object.fromEntries(DOMAIN_IDS.map(d => [d, d === 'housing' ? 1 : 10000])) as typeof cohort.salience };
    expect(policyFit(high, mismatch, state.issues)).toBeLessThan(policyFit(low, mismatch, state.issues));
    expect(policyFit(cohort, mismatch, state.issues)).toBeLessThan(policyFit(cohort, match, state.issues));
  });
  it('uses the confirmed all-party barrier removal and retains loyalty, trust and government evaluation', () => {
    const state = createGame(12), analysis = computeAnalysis(state), neutral = neutralViability(analysis.currentSupport, state.politics.viability);
    const full = clone(state);
    for (const row of Object.values(full.politics.perceptions)) for (const perception of Object.values(row)) perception.awareness = SCALE;
    for (const id of Object.keys(full.politics.viability)) full.politics.viability[id] = neutral;
    const expected = evaluateSupport(full).aggregated.national!;
    for (const id of Object.keys(expected)) expect(Math.abs(analysis.potentialSupport[id]! - expected[id]!)).toBeLessThanOrEqual(2);
    expect(sum(analysis.potentialSupport)).toBe(SCALE);
    expect(state.politics.perceptions).toEqual(createGame(12).politics.perceptions);
    expect(analysis.potentialSupport[player]!).toBeGreaterThan(analysis.currentSupport[player]!);
    // Major-party Potential may be lower. It is never clamped to Current.
    expect(analysis.potentialSupport.dp!).toBeLessThan(analysis.currentSupport.dp!);
  });
  it('keeps Potential independent of awareness and viability barriers', () => {
    const state = createGame(42), original = computeAnalysis(state), low = clone(state);
    for (const row of Object.values(low.politics.perceptions)) row[player]!.awareness = 1000;
    const awareness = computeAnalysis(low);
    expect(awareness.currentSupport[player]!).toBeLessThan(original.currentSupport[player]!);
    for (const id of Object.keys(original.potentialSupport)) expect(Math.abs(awareness.potentialSupport[id]! - original.potentialSupport[id]!)).toBeLessThanOrEqual(2);
    low.politics.viability[player] = 0;
    expect(computeAnalysis(low).currentSupport[player]!).toBeLessThan(awareness.currentSupport[player]!);
  });
  it('publishes gradually through monthly perceptions and leaves drafts inert', () => {
    const state = createGame(3);
    const draft = dispatchCommand(state, { type: 'SET_PLATFORM_DRAFT', leverId: 'housing.redevelopment', value: 3 });
    expect(stateHash(simulationFields(draft))).toBe(stateHash(simulationFields(state)));
    const published = dispatchCommand(draft, { type: 'PUBLISH_PLATFORM', leverId: 'housing.redevelopment' });
    expect(published.politics.analysis).toBe(state.politics.analysis);
    const baseline = nextMonth(state), changed = nextMonth(published);
    const p = Math.abs(changed.politics.analysis.potentialSupport[player]! - baseline.politics.analysis.potentialSupport[player]!);
    const c = Math.abs(changed.politics.analysis.currentSupport[player]! - baseline.politics.analysis.currentSupport[player]!);
    expect(p).toBeGreaterThan(0); expect(c).toBeLessThan(p);
    expect(c).toBeLessThan(10000);
  });
  it('makes trust depend on fiscal credibility and reversal memory', () => {
    const state = createGame(4), platform = state.platforms.find(p => p.partyId === player)!, party = state.politics.parties.find(p => p.partyId === player)!, cohort = state.cohorts[0]!;
    const reversed = { ...platform, positions: Object.fromEntries(Object.entries(platform.positions).map(([id, p]) => [id, { ...p, reversalPenalty: 10000 }])) };
    expect(trust(cohort, reversed, party, state.issues)).toBeLessThan(trust(cohort, platform, party, state.issues));
    let spending = platform;
    for (const lever of policyLevers) spending = publishPlatform(editDraft(spending, lever.id, lever.fiscalImplication.costPerStep > 0 ? 4 : 0), lever.id, state.date);
    expect(fiscalCredibility(spending)).toBeLessThan(fiscalCredibility(platform));
  });
});

describe('perception dynamics, government and viability', () => {
  it('moves awareness, identity and ownership slowly, keeps expertise fixed and never flips loyalty', () => {
    const state = clone(createGame(7));
    let platform = state.platforms.find(p => p.partyId === player)!;
    for (const lever of policyLevers) platform = publishPlatform(editDraft(platform, lever.id, 4), lever.id, state.date);
    state.platforms = state.platforms.map(p => p.partyId === player ? platform : p);
    state.date = '2026-10-26';
    const evolved = evolvePerceptions(state), before = state.politics.parties.find(p => p.partyId === player)!, after = evolved.politics.parties.find(p => p.partyId === player)!;
    expect(after.expertise).toEqual(before.expertise);
    const target = platformIdentity(platform, before.declaredValues);
    expect(after.identity).not.toEqual(before.identity);
    for (const tag of CORE_VALUES) expect(Math.abs(after.identity[tag] - target[tag])).toBeLessThanOrEqual(Math.abs(before.identity[tag] - target[tag]));
    expect(after.identity).not.toEqual(target);
    expect(after.ownership.housing).toBeGreaterThan(before.ownership.housing);
    for (const c of state.cohorts) {
      expect(evolved.politics.perceptions[c.id]![player]!.awareness).toBeGreaterThan(state.politics.perceptions[c.id]![player]!.awareness);
      for (const id of Object.keys(state.politics.viability)) expect(evolved.politics.perceptions[c.id]![id]!.loyalty).toBeLessThanOrEqual(state.politics.perceptions[c.id]![id]!.loyalty);
    }
  });
  it('has a zero, signed and approximately zero-sum government-evaluation term', () => {
    const ids = Object.keys(model.parties), governing = 'dp';
    for (const id of ids) expect(governmentTerm(800000, 0, id, governing)).toBe(0);
    const terms = ids.map(id => governmentTerm(800000, 500000, id, governing));
    expect(terms[ids.indexOf(governing)]).toBeGreaterThan(0);
    expect(Math.abs(terms.reduce((a, b) => a + b, 0))).toBeLessThanOrEqual(ids.length);
    expect(governmentTerm(800000, -500000, 'ppp', governing)).toBeGreaterThan(0);
  });
  it('uses lagged published polls, never same-tick support, with a monthly cap and ruleset knee', () => {
    const state = clone(createGame(2)); state.date = '2026-10-26';
    const expected = updateViability(state);
    const sameTick = JSON.parse(JSON.stringify(state.politics.polls[0]!)); sameTick.date = state.date; sameTick.national.results[player].point = SCALE;
    state.politics.polls.push(sameTick); state.politics.analysis.currentSupport[player] = SCALE;
    expect(updateViability(state)).toEqual(expected);
    expect(expected.viabilityInput.asOf).toBe('2026-10-19');
    for (const id of Object.keys(expected.viability)) expect(Math.abs(expected.viability[id]! - state.politics.viability[id]!)).toBeLessThanOrEqual(model.viability.monthlyCap);
    expect(viabilityTarget(25000, state.rulesetSnapshot)).toBeGreaterThan(viabilityTarget(25000, { ...state.rulesetSnapshot, legalThresholdVoteShare: 30000 }));
    expect(smoothViability(0, 20000, 10000)).toBe(0);
    expect(smoothViability(20000, 20000, 10000)).toBe(500000);
    expect(smoothViability(40000, 20000, 10000)).toBe(SCALE);
  });
});

describe('fictional polling with explicit uncertainty', () => {
  it('reproduces polls by seed/stream, varies sampling, derives undecided and uses persistent house effects', () => {
    let state = createGame(22);
    const houseKey = streamKey('poll-house-effects', state.date), position = state.rngState[houseKey];
    const house = state.politics.pollHouses[0]!, analysis = state.politics.analysis;
    const a = makePoll(analysis, house, 22, state.date, {}, 0), b = makePoll(analysis, house, 22, state.date, {}, 0);
    expect(a).toEqual(b);
    expect(makePoll(analysis, house, 22, state.date, { [streamKey('poll-sampling', state.date)]: deriveStream(5, 'poll-sampling', state.date) }, 0).poll).not.toEqual(a.poll);
    expect(a.poll.national.results.none).toBeDefined();
    expect(sum(Object.fromEntries(Object.entries(a.poll.national.results).map(([id, r]) => [id, r.point])))).toBe(SCALE);
    for (let i = 0; i < 5; i++) state = nextMonth(state);
    expect(state.rngState[houseKey]).toBe(position);
    for (const poll of state.politics.polls) expect(poll.houseEffects).toEqual(state.politics.pollHouses.find(h => h.id === poll.houseId)!.effects);
  });
  it('derives margins from sample size and makes subgroup margins wider', () => {
    expect(integerSqrt(15)).toBe(3); expect(integerSqrt(16)).toBe(4);
    const margin = pollMargin(60000, 1000);
    expect(margin).toBeGreaterThan(13000); expect(margin).toBeLessThan(18000);
    expect(pollMargin(60000, 100)).toBeGreaterThan(margin);
    const poll = createGame(22).politics.polls[0]!;
    for (const group of [...Object.values(poll.byAge), ...Object.values(poll.byRegion)]) {
      expect(group.sampleSize).toBeLessThan(poll.national.sampleSize);
      expect(group.results.ppp!.margin).toBeGreaterThan(poll.national.results.ppp!.margin);
    }
  });
  it('has empirical interval coverage in the configured plausibility band', () => {
    const state = createGame(42);
    const analysis = { ...state.politics.analysis, currentSupport: { dp: 350000, ppp: 350000, reform: 60000, rkp: 60000, 'minor-bloc': 50000, 'player-preview': 60000, none: 70000 } };
    const covered = { ppp: 0, 'player-preview': 0 };
    for (let seed = 0; seed < 300; seed++) {
      const poll = makePoll(analysis, state.politics.pollHouses[0]!, seed, state.date, {}, 0).poll;
      for (const id of ['ppp', 'player-preview'] as const) {
        const result = poll.national.results[id]!, truth = analysis.currentSupport[id];
        if (result.low <= truth && result.high >= truth) covered[id]++;
      }
    }
    for (const count of Object.values(covered)) {
      expect(count / 300).toBeGreaterThan(model.polling.coverageBandNational[0] / SCALE);
      expect(count / 300).toBeLessThan(model.polling.coverageBandNational[1] / SCALE);
    }
  });
});

describe('party AI, calibration and saves', () => {
  it('is deterministic, bounded by monthly/quarterly caps and retains platform diversity', () => {
    let state = createGame(42);
    const snapshot = stateHash(state);
    const input = { ...state, date: '2026-10-26' };
    expect(updatePartyAI(input)).toEqual(updatePartyAI(input));
    expect(stateHash(state)).toBe(snapshot);
    for (let i = 0; i < 18; i++) {
      state = nextMonth(state);
      for (const p of state.politics.parties) {
        expect(p.ai.changesThisMonth).toBeLessThanOrEqual(model.ai.monthlyCap);
        expect(p.ai.changesThisQuarter).toBeLessThanOrEqual(model.ai.quarterlyCap);
      }
      expect(platformDiversity(state.platforms)).toBeGreaterThanOrEqual(model.ai.diversityFloor);
      for (const p of state.platforms) for (const l of Object.values(p.positions)) expect(l.publishedValue === null || (l.publishedValue >= 0 && l.publishedValue <= 4)).toBe(true);
    }
    const changes = Object.values(state.governmentPolicy.levers).flatMap(l => l.history);
    expect(changes.length).toBeGreaterThan(0);
    const counts: Record<string, number> = {};
    for (const c of changes) { const key = `${c.enactedAt.slice(0, 4)}-${Math.floor((Number(c.enactedAt.slice(5, 7)) - 1) / 3)}`; counts[key] = (counts[key] ?? 0) + 1; }
    expect(Object.values(counts).every(c => c <= model.ai.governmentQuarterlyCap)).toBe(true);
  });
  it('party AI does not read hidden current support, awareness or loyalty', () => {
    const a = clone(createGame(8)); a.date = '2026-10-26';
    const b = clone(a);
    for (const id of Object.keys(b.politics.analysis.currentSupport)) b.politics.analysis.currentSupport[id] = 0;
    for (const row of Object.values(b.politics.perceptions)) for (const p of Object.values(row)) { p.awareness = 0; p.loyalty = 0; }
    expect(updatePartyAI(a).state.platforms).toEqual(updatePartyAI(b).state.platforms);
    expect(updatePartyAI(a).changes).toEqual(updatePartyAI(b).changes);
  });
  it('government AI enacts only its own platform, not opposition announcements', () => {
    const state = clone(createGame(3)); state.date = '2026-12-28';
    const before = updateGovernmentAI(state);
    const opposition = state.platforms.find(p => p.partyId === 'ppp')!;
    state.platforms = state.platforms.map(p => p.partyId === 'ppp' ? publishPlatform(editDraft(opposition, 'housing.rent-support', 4), 'housing.rent-support', state.date) : p);
    expect(updateGovernmentAI(state).state.governmentPolicy).toEqual(before.state.governmentPolicy);
    expect(updateGovernmentAI(state).changes).toEqual(before.changes);
    expect(before.state.issues).toBe(state.issues); // Delayed social update happens in the issue engine.
  });
  it('reports unverified calibration instead of treating missing targets as zero', () => {
    const state = createGame(1), report = checkCalibration(state.politics.analysis, realityPack);
    expect(report.unverified).toEqual([]); expect(report.checked).toHaveLength(20);
    // Verifying observed targets does not certify that development Seeds fit them.
    expect(report.errors.every(error => error.includes('tolerance'))).toBe(true);
    const fixture = JSON.parse(JSON.stringify(realityPack));
    fixture.calibrationTargets = [{ regionId: 'seoul', partyId: 'dp', kind: 'latest-election', target: { id: 'verified-test-only', status: 'REAL_FACT', source: 'test-fixture', verifiedAt: '2026-10-18', value: state.politics.analysis.byRegion.seoul!.dp! } }];
    expect(checkCalibration(state.politics.analysis, fixture).checked).toEqual(['verified-test-only']);
    fixture.calibrationTargets[0].target.value = SCALE;
    expect(checkCalibration(state.politics.analysis, fixture).errors.join()).toContain('tolerance');
    fixture.calibrationTargets[0].target.value = null;
    fixture.calibrationTargets[0].target.status = 'UNVERIFIED_ASSUMPTION';
    expect(checkCalibration(state.politics.analysis, fixture)).toEqual({ checked: [], unverified: ['verified-test-only'], errors: [] });
  });
  it('round trips schema 2, rejects B1 previews and verifies the full political replay', () => {
    let state = createGame(6);
    for (let i = 0; i < 3; i++) state = nextMonth(state);
    expect(stateHash(deserializeSave(serializeSave(state)))).toBe(stateHash(state));
    expect(stateHash(replay(state.seed, state.commandLog))).toBe(stateHash(state));
    const legacy = JSON.parse(serializeSave(state)); legacy.state.phase = 'B1';
    expect(() => deserializeSave(JSON.stringify(legacy))).toThrow('B1 개발 프리뷰');
  });
});


describe('B2 fixed golden replay', () => {
  it('preserves the reviewed initial, season-end and reversal state hashes', () => {
    expect(model.modelVersion).toBe(golden.modelVersion);
    expect(stateHash(createGame(golden.seed))).toBe(golden.initialHash);
    let state = createGame(golden.seed);
    for (let i = 0; i < 77; i++) state = dispatchCommand(state, { type: 'ADVANCE_WEEK' });
    expect(stateHash(state)).toBe(golden.seasonEndHash);
    expect(stateHash(replay(golden.seed, golden.publicationReversalCommands as Command[]))).toBe(golden.publicationReversalHash);
  });
});
