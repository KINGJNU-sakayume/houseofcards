import { describe, expect, it } from 'vitest';
import legacyC2c from './fixtures/phase-c2c-v6.json' with { type: 'json' };
import legacyD1 from './fixtures/phase-d1-v7.json' with { type: 'json' };
import lawReview from '../docs/data/law-review-phase-d.json' with { type: 'json' };
import rulesetData from '../src/data/rulesets/rulesets.json' with { type: 'json' };
import { rulesetPreset, rulesets } from '../src/data/rulesets';
import { validateRulesets } from '../src/data/rulesets/validate';
import { allocateList, districtWinner, eligibleParties, hareLargestRemainder, totalSeats } from '../src/engine/election/allocation';
import { createGame, dispatchCommand, replay } from '../src/engine/simulation/engine';
import { stateHash } from '../src/engine/simulation/determinism';
import { deriveStream, randomInt } from '../src/engine/simulation/rng';
import { deserializeSave, serializeSave } from '../src/persistence/codec';
import { viabilityTarget } from '../src/engine/voters/dynamics';
import { foundingCommand } from './helpers';

const parallel = rulesetPreset('parallel_46_open'), threshold = rulesetPreset('parallel_46_threshold_3'), semi = rulesetPreset('semi_compensatory_30');
const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

describe('D1 ruleset data', () => {
  it('has the three Slice presets, takes every seat number from data and matches the DD1 law review', () => {
    expect(rulesets.presets.map(p => p.rulesetId)).toEqual(['parallel_46_open', 'parallel_46_threshold_3', 'semi_compensatory_30']);
    expect(rulesets.defaultRulesetId).toBe('parallel_46_open');
    expect(semi.uiEnabled).toBe(false); expect(semi.semiCompensatory!.satelliteMode).toBe('none');
    for (const p of rulesets.presets) expect(p.partyRevocation).toBeNull();
    expect(validateRulesets(rulesetData, lawReview)).toEqual([]);
    const tampered = structuredClone(rulesetData); tampered.currentLaw.deposit.perDistrictCandidateKrw = 50000000;
    expect(validateRulesets(tampered, lawReview).join()).toContain('district deposit');
    expect(validateRulesets(rulesetData, { ...lawReview, unverified: ['x'] }).join()).toContain('unverified');
    expect(() => rulesetPreset('bogus')).toThrow('알 수 없는');
  });
});

describe('D1 seat allocation (hand-calculated)', () => {
  const votes = { A: 40000, B: 34000, C: 16000, D: 10000 }, wins = { A: 130, B: 110, C: 10, D: 4 };
  it('parallel Hare largest remainder: 46 × shares, remainders .64 and .60 win', () => {
    // 18.4 / 15.64 / 7.36 / 4.6 → floors 18/15/7/4 (44) → B (.64), D (.60)
    expect(allocateList(parallel, { A: 40000, B: 34000, C: 16000, D: 10000 }, wins).list).toEqual({ A: 18, B: 16, C: 7, D: 5 });
  });
  it('threshold 3%: below-threshold parties are excluded unless they won 5 districts', () => {
    const v = { A: 50000, B: 40000, C: 7000, E: 2500, F: 500 }, w = { A: 150, B: 98, F: 6 };
    expect(eligibleParties(threshold, v, w)).toEqual(['A', 'B', 'C', 'F']);
    expect(eligibleParties(parallel, v, w)).toEqual(['A', 'B', 'C', 'E', 'F']);
    // Eligible total 97,500: 23.59 / 18.87 / 3.30 / 0.24 → 23/18/3/0 (44) → B (.87), A (.59)
    expect(allocateList(threshold, v, w).list).toEqual({ A: 24, B: 19, C: 3, F: 0 });
  });
  it('semi-compensatory cap 30: (300×share − districts)/2 rounded, scaled to the cap, plus 16 parallel', () => {
    const r = allocateList(semi, votes, wins);
    // raw: A (120−130)/2 → 0, B (102−110)/2 → 0, C (48−10)/2 = 19, D (30−4)/2 = 13; sum 32 > 30
    // scaled: C 17.81, D 12.19 → 17/12 (29) → C (.81) ⇒ C 18, D 12
    expect(r.compensatory).toEqual({ A: 0, B: 0, C: 18, D: 12 });
    // 16 parallel: 6.4 / 5.44 / 2.56 / 1.6 → 6/5/2/1 (14) → D (.6), C (.56)
    expect(r.parallel).toEqual({ A: 6, B: 5, C: 3, D: 2 });
    expect(r.list).toEqual({ A: 6, B: 5, C: 21, D: 14 });
    expect(sum(totalSeats(wins, r.list))).toBe(semi.districtSeats + semi.listSeats);
  });
  it('semi-compensatory below the cap distributes the residual by share', () => {
    const r = allocateList(semi, { A: 45000, B: 45000, C: 6000, D: 4000 }, { A: 125, B: 125, C: 3, D: 1 });
    // raw: A (135−125)/2 = 5, B 5, C (18−3)/2 = 7.5 → 8, D (12−1)/2 = 5.5 → 6; sum 24 → residual 6 by share
    expect(r.compensatory).toEqual({ A: 5 + 3, B: 5 + 3, C: 8, D: 6 });
  });
  it('equal remainders follow the lottery order; district ties go to the older candidate', () => {
    expect(hareLargestRemainder(1, { X: 1, Y: 1 }, ['Y', 'X'])).toEqual({ X: 0, Y: 1 });
    expect(hareLargestRemainder(1, { X: 1, Y: 1 }, ['X', 'Y'])).toEqual({ X: 1, Y: 0 });
    expect(districtWinner({ x: 100, y: 100, z: 50 }, ['y', 'x'])).toBe('y');
    expect(districtWinner({ x: 100, y: 99 }, ['y', 'x'])).toBe('x');
    expect(districtWinner({ x: 0 }, [])).toBeNull();
    expect(() => hareLargestRemainder(3, { X: -1 })).toThrow();
  });
});

describe('D1 allocation properties over seeded random elections', () => {
  function election(seed: number) {
    let rng = deriveStream(seed, 'd1-property', '2028-04-12');
    const draw = (n: number) => { const r = randomInt(rng, n); rng = r.state; return r.value; };
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].slice(0, 2 + draw(5));
    const votes = Object.fromEntries(ids.map(id => [id, draw(4) === 0 ? draw(3000) : draw(9_000_000)]));
    const wins: Record<string, number> = Object.fromEntries(ids.map(id => [id, 0]));
    for (let d = 0; d < 254; d++) { const id = ids[draw(ids.length)]!; wins[id]!++; }
    return { ids, votes, wins };
  }
  for (const preset of [parallel, threshold, semi]) it(`${preset.rulesetId}: seats sum to the house, are non-negative, and more votes never mean fewer seats`, () => {
    let checked = 0;
    for (let seed = 0; seed < 300; seed++) {
      const { ids, votes, wins } = election(seed);
      const r = allocateList(preset, votes, wins, ids);
      if (!r.eligible.length) continue;
      const total = totalSeats(wins, r.list);
      expect(sum(r.list)).toBe(preset.listSeats);
      expect(sum(total)).toBe(preset.districtSeats + preset.listSeats);
      for (const v of Object.values(total)) expect(v).toBeGreaterThanOrEqual(0);
      for (const id of ids) {
        const more = allocateList(preset, { ...votes, [id]: votes[id]! + 1 + Math.floor(votes[id]! / 7) }, wins, ids);
        expect(more.list[id] ?? 0, `${preset.rulesetId} seed ${seed} party ${id}`).toBeGreaterThanOrEqual(r.list[id] ?? 0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });
});

describe('D1 game integration', () => {
  it('a new game stores the chosen ruleset; the opinion model reads its threshold; replay and saves keep it', () => {
    const open = createGame(5), three = createGame(5, 'parallel_46_threshold_3');
    expect(open.rulesetId).toBe('parallel_46_open'); expect(open.electionRuleset.currentLaw.deposit.perDistrictCandidateKrw).toBe(15000000);
    expect(three.rulesetSnapshot).toMatchObject({ rulesetId: 'parallel_46_threshold_3', legalThresholdVoteShare: 30000, listSeats: 46 });
    expect(three.electionRuleset.electionDate).toBe('2028-04-12');
    expect(viabilityTarget(25000, three.rulesetSnapshot)).toBeLessThan(viabilityTarget(25000, open.rulesetSnapshot));
    let s = dispatchCommand(three, foundingCommand);
    for (let i = 0; i < 6; i++) s = dispatchCommand(s, { type: 'ADVANCE_WEEK' });
    expect(stateHash(replay(5, s.commandLog, 'parallel_46_threshold_3'))).toBe(stateHash(s));
    expect(stateHash(replay(5, s.commandLog))).not.toBe(stateHash(s));
    expect(stateHash(deserializeSave(serializeSave(s)))).toBe(stateHash(s));
    const tampered = JSON.parse(serializeSave(s)); tampered.state.electionRuleset.listSeats = 47;
    expect(() => deserializeSave(JSON.stringify(tampered))).toThrow();
  });
  it('rejects real pre-calibration D1 saves (schema 7) with Korean keep-JSON guidance', () => {
    expect(legacyD1.state.schemaVersion).toBe(7); expect(legacyD1.checksum).toBe(stateHash(legacyD1.state));
    expect(() => deserializeSave(JSON.stringify(legacyD1))).toThrow('D1 세이브(스키마 7)는 교정된 정치 모형 B3(스키마 8)와 호환되지 않습니다. 기존 JSON을 보관');
  });
  it('rejects real C2c saves with Korean keep-JSON guidance', () => {
    expect(legacyC2c.state.schemaVersion).toBe(6); expect(legacyC2c.checksum).toBe(stateHash(legacyC2c.state));
    expect(() => deserializeSave(JSON.stringify(legacyC2c))).toThrow('C2c 세이브(스키마 6)는 현재 버전(스키마 11)과 호환되지 않습니다. 기존 JSON을 보관');
  });
});
