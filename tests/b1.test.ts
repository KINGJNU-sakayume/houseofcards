import { createFoundedGame as createGame } from './helpers';
import { describe, expect, it } from 'vitest';
import legacySave from './fixtures/phase-a-v1.json' with { type: 'json' };
import { policyLevers, realityPack, seedPack } from '../src/data/reality';
import { validateData } from '../src/data/reality/validate';
import { updateIssues } from '../src/engine/issues';
import { addMonths, editDraft, effectiveValue, enactPolicy, publishPlatform, decayConsistency } from '../src/engine/policy';
import { dispatchCommand, replay, simulationFields } from '../src/engine/simulation/engine';
import { stateHash } from '../src/engine/simulation/determinism';
import { deriveStream, randomInt, streamKey } from '../src/engine/simulation/rng';
import { SCALE } from '../src/engine/simulation/math';
import { normalizeMasses } from '../src/engine/voters/cohorts';
import { deserializeSave, serializeSave } from '../src/persistence/codec';
import { PLAYER_PARTY_ID } from '../src/engine/simulation/initialize';
import { DOMAIN_IDS } from '../src/types/simulation';
import { FORBIDDEN_POLL_MEDIA_NAMES } from '../src/validation/forbidden-names';

describe('B1 snapshot and deterministic saves', () => {
  it('separates the snapshot from the simulation and round trips schema 3 commands', () => {
    let state = createGame(42);
    expect(state.realityPackAsOf).toBe('2026-10-18');
    expect(state.realityPackId).not.toContain('2026-10-19');
    expect(state.simulationStartDate).toBe('2026-10-19');
    expect(state.date).toBe(state.simulationStartDate);
    expect(state.schemaVersion).toBe(8);
    state = dispatchCommand(state, { type: 'SET_PLATFORM_DRAFT', leverId: 'housing.rent-support', value: 4 });
    state = dispatchCommand(state, { type: 'PUBLISH_PLATFORM', leverId: 'housing.rent-support' });
    for (let i = 0; i < 30; i++) state = dispatchCommand(state, { type: 'ADVANCE_WEEK' });
    expect(stateHash(deserializeSave(serializeSave(state)))).toBe(stateHash(state));
    expect(stateHash(replay(state.seed, state.commandLog))).toBe(stateHash(state));
    expect(() => deserializeSave(serializeSave({ ...state, cohorts: state.cohorts.map((c, i) => i ? c : { ...c, weight: -1 }) }))).toThrow('구조');
  });
  it('rejects a genuine Phase A save without changing its JSON', () => {
    const text = JSON.stringify(legacySave);
    expect(legacySave.checksum).toBe(stateHash(legacySave.state));
    expect(() => deserializeSave(text)).toThrow('Phase A 프리뷰 세이브');
    expect(() => deserializeSave(text)).toThrow('기존 JSON 내보내기 파일을 보관');
    expect(JSON.stringify(legacySave)).toBe(text);
  });
  it('keeps the Phase A stream sequence when new named streams are used', () => {
    let state = deriveStream(42, 'calendar-reports', '2026-10-26');
    expect(state).toBe(3281568840);
    const sequence = [];
    for (let i = 0; i < 5; i++) {
      randomInt(deriveStream(42, 'issue-shocks', '2026-10-26'), 61);
      randomInt(deriveStream(42, 'cohort-calibration', '2026-10-19'), 1000);
      const draw = randomInt(state, 3); state = draw.state; sequence.push(draw.value);
    }
    expect(sequence).toEqual([0, 1, 1, 1, 0]);
    expect(state).toBe(2016247035);
    let game = createGame(42);
    for (let i = 0; i < 77; i++) {
      game = dispatchCommand(game, { type: 'ADVANCE_WEEK' });
      const expected = randomInt(deriveStream(42, 'calendar-reports', game.date), 3);
      expect(game.rngState[streamKey('calendar-reports', game.date)]).toBe(expected.state);
    }
  });
  it('round trips more than 500 policy events and stops at the codec command limit', () => {
    let state = createGame(3);
    for (let i = 0; i < 501; i++) state = dispatchCommand(state, { type: 'SET_PLATFORM_DRAFT', leverId: 'housing.rent-support', value: i % 5 });
    expect(stateHash(deserializeSave(serializeSave(state)))).toBe(stateHash(state));
    for (let i = 501; i < 5999; i++) state = dispatchCommand(state, { type: 'SET_PLATFORM_DRAFT', leverId: 'housing.rent-support', value: i % 5 });
    expect(() => dispatchCommand(state, { type: 'ADVANCE_WEEK' })).toThrow('6000개');
    expect(stateHash(deserializeSave(serializeSave(state)))).toBe(stateHash(state));
  });
});

describe('conditional cohorts and policy metadata', () => {
  it('normalizes exactly with stable ties, nonuniform conditional profiles and 96 cells', () => {
    expect(normalizeMasses([{ id: 'c', mass: 1 }, { id: 'a', mass: 1 }, { id: 'b', mass: 1 }], 10)).toEqual({ a: 4, b: 3, c: 3 });
    expect(() => normalizeMasses([{ id: 'zero', mass: 0 }])).toThrow();
    const { cohorts } = createGame(8);
    expect(cohorts).toHaveLength(96);
    expect(new Set(cohorts.map(c => c.id)).size).toBe(96);
    expect(cohorts.reduce((s, c) => s + c.weight, 0)).toBe(SCALE);
    expect(cohorts.every(c => Number.isInteger(c.weight) && c.weight >= 0)).toBe(true);
    for (const region of new Set(cohorts.map(c => c.regionId))) {
      const old = cohorts.find(c => c.regionId === region && c.ageBand === '60+' && c.profileId === 'asset-retirement')!;
      const young = cohorts.find(c => c.regionId === region && c.ageBand === '18-29' && c.profileId === 'asset-retirement')!;
      expect(old.weight).toBeGreaterThan(young.weight);
    }
    for (const row of seedPack.profileConditionals) expect(new Set(row.masses).size).toBeGreaterThan(1);
    for (const cohort of cohorts) {
      expect(Object.values(cohort.partyAttachment).reduce((a, b) => a + b, 0)).toBe(SCALE);
      expect(Object.values(cohort.preferences).every(v => Number.isInteger(v) && v >= 0 && v <= 4)).toBe(true);
    }
  });
  it('derives preferences from life conditions independently of party calibration RNG', () => {
    const a = createGame(1), b = createGame(2);
    expect(a.cohorts.map(c => c.preferences)).toEqual(b.cohorts.map(c => c.preferences));
    expect(a.cohorts.map(c => c.partyAttachment)).not.toEqual(b.cohorts.map(c => c.partyAttachment));
    expect(a.cohorts.map(c => c.weight)).toEqual(b.cohorts.map(c => c.weight));
  });
  it('has exactly the six specified domains and all 32 fully described levers', () => {
    expect(policyLevers).toHaveLength(32);
    expect(new Set(policyLevers.map(l => l.id)).size).toBe(32);
    expect([...new Set(policyLevers.map(l => l.domain))].sort()).toEqual([...DOMAIN_IDS].sort());
    expect(validateData(realityPack, seedPack).errors).toEqual([]);
    const bad = policyLevers.map((l, i) => i ? l : { ...l, valueTags: { imaginary: 1 } });
    expect(validateData(realityPack, seedPack, false, bad).errors.join()).toContain('levers');
    expect(validateData(realityPack, seedPack, false, [...policyLevers, policyLevers[0]]).errors.join()).toContain('duplicate ID');
    expect(validateData(realityPack, seedPack, false, policyLevers.map((l, i) => i ? l : { ...l, implementationDelayMonths: -1 })).errors.length).toBeGreaterThan(0);
  });
});

describe('platform and enacted policy isolation', () => {
  it('keeps drafts entirely inert now and after multiple monthly updates', () => {
    let original = createGame(12);
    let edited = dispatchCommand(original, { type: 'SET_PLATFORM_DRAFT', leverId: 'industry-ai.deregulation', value: 4 });
    expect(stateHash(edited)).not.toBe(stateHash(original));
    expect(stateHash(simulationFields(edited))).toBe(stateHash(simulationFields(original)));
    for (let i = 0; i < 15; i++) {
      original = dispatchCommand(original, { type: 'ADVANCE_WEEK' });
      edited = dispatchCommand(edited, { type: 'ADVANCE_WEEK' });
      expect(stateHash(simulationFields(edited))).toBe(stateHash(simulationFields(original)));
    }
    const player = edited.platforms.find(p => p.partyId === PLAYER_PARTY_ID)!;
    expect(player.positions['industry-ai.deregulation']!.publishedValue).toBeNull();
    expect(() => dispatchCommand(edited, { type: 'SET_PLATFORM_DRAFT', leverId: 'industry-ai.deregulation', value: 5 })).toThrow('0~4');
    expect(() => dispatchCommand(edited, { type: 'PUBLISH_PLATFORM', leverId: 'not-a-lever' })).toThrow();
  });
  it('never allows any party platform, including government promises, to enact itself', () => {
    const initial = createGame(31);
    const published = initial.platforms.map(platform => publishPlatform(editDraft(platform, 'housing.public-housing', 4), 'housing.public-housing', initial.date));
    const changed = { ...initial, platforms: published };
    const a = dispatchCommand(initial, { type: 'ADVANCE_WEEK' });
    const b = dispatchCommand(changed, { type: 'ADVANCE_WEEK' });
    expect(b.issues).toEqual(a.issues);
    expect(b.governmentPolicy).toEqual(a.governmentPolicy);
    expect(Object.values(initial.governmentPolicy.levers).every(l => l.value === 2 && l.history.length === 0)).toBe(true);
    expect(() => enactPolicy(initial.governmentPolicy, PLAYER_PARTY_ID, 'housing.public-housing', 4, initial.date)).toThrow('집권당');
  });
  it('retains reversal memory across status quo and decays it over months', () => {
    let p = createGame(7).platforms.find(p => p.partyId === PLAYER_PARTY_ID)!;
    const id = 'housing.rent-support';
    p = publishPlatform(editDraft(p, id, 4), id, '2026-10-19');
    p = publishPlatform(editDraft(p, id, 2), id, '2026-11-02');
    p = publishPlatform(editDraft(p, id, 0), id, '2026-11-09');
    expect(p.positions[id]!.reversalPenalty).toBe(2500);
    const republished = publishPlatform(p, id, '2026-11-16');
    expect(republished).toBe(p);
    p = decayConsistency(p);
    expect(p.positions[id]!.reversalPenalty).toBe(2100);
    for (let i = 0; i < 6; i++) p = decayConsistency(p);
    expect(p.positions[id]!.reversalPenalty).toBe(0);
    p = publishPlatform(editDraft(p, id, 4), id, '2027-10-19');
    expect(p.positions[id]!.reversalPenalty).toBe(0);
  });
  it('applies implemented policy only after its full calendar-month delay, including replacements', () => {
    const game = createGame(17), lever = policyLevers.find(l => l.id === 'housing.private-supply')!;
    let government = enactPolicy(game.governmentPolicy, game.governmentPolicy.partyId, lever.id, 4, game.date);
    expect(lever.implementationDelayMonths).toBe(36);
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    const update = (date: string, policy = government) => updateIssues(game.issues, policy, policyLevers, seedPack.issueConfigs, game.seed, date, {});
    expect(update('2029-10-18').issues).toEqual(update('2029-10-18', game.governmentPolicy).issues);
    expect(update('2029-10-19').issues).not.toEqual(update('2029-10-19', game.governmentPolicy).issues);
    expect(effectiveValue(government, lever, '2029-10-19')).toBe(4);
    government = enactPolicy(government, government.partyId, lever.id, 0, '2027-10-19');
    expect(effectiveValue(government, lever, '2029-10-19')).toBe(4);
    expect(effectiveValue(government, lever, '2030-10-19')).toBe(0);
  });
});

describe('monthly issues and data safeguards', () => {
  it('updates once per month and keeps every issue/driver bounded for 20 complete seasons', () => {
    const realityHash = stateHash(realityPack), seedHash = stateHash(seedPack);
    for (let seed = 0; seed < 20; seed++) {
      let state = createGame(seed), months = 0;
      for (let week = 0; week < 77; week++) {
        const before = state;
        state = dispatchCommand(state, { type: 'ADVANCE_WEEK' });
        if (before.issues !== state.issues) months++;
        expect(state.issues).toHaveLength(6);
        for (const issue of state.issues) {
          for (const value of [issue.severity, issue.salience, ...Object.values(issue.drivers)]) {
            expect(Number.isSafeInteger(value) && value >= 0 && value <= 10000).toBe(true);
          }
          expect(issue.trend).toBeGreaterThanOrEqual(-10000);
          expect(issue.trend).toBeLessThanOrEqual(10000);
          expect(issue.lastUpdated <= state.date).toBe(true);
        }
      }
      expect(months).toBe(18);
      expect(stateHash(replay(seed, state.commandLog))).toBe(stateHash(state));
      expect(state.issues.some(i => i.severity !== i.salience)).toBe(true);
    }
    expect(stateHash(realityPack)).toBe(realityHash);
    expect(stateHash(seedPack)).toBe(seedHash);
  }, 120000);
  it('rejects seed/save leakage and every forbidden real polling/media name in data', () => {
    expect(validateData({ ...realityPack, severity: 7100 }, seedPack).errors.length).toBeGreaterThan(0);
    expect(validateData({ ...realityPack, parties: realityPack.parties.map((p, i) => i ? p : { ...p, awareness: 5000 }) }, seedPack).errors.length).toBeGreaterThan(0);
    for (const name of FORBIDDEN_POLL_MEDIA_NAMES) {
      expect(validateData(realityPack, { ...seedPack, seedLabel: name }).errors.join()).toContain('Forbidden');
    }
    expect(validateData(realityPack, seedPack, true).errors.every(e => e.includes('UNVERIFIED_ASSUMPTION'))).toBe(true);
    const bad = { ...realityPack, parties: realityPack.parties.map((p, i) => i ? p : { ...p, platformTags: { ...p.platformTags!, source: undefined } }) };
    expect(validateData(bad, seedPack).errors.join()).toContain('REAL_FACT needs source');
  });
});
