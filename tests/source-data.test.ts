import { describe, expect, it } from 'vitest';
import election from '../docs/data/election-2026-06-03.json' with { type: 'json' };
import polls from '../docs/data/polls-2026-10-13.json' with { type: 'json' };
import audit from '../docs/data/verification-2026-10-18.json' with { type: 'json' };
import population from '../docs/data/population-2026-09.json' with { type: 'json' };
import { realityPack, seedPack } from '../src/data/reality';
import { politicalModel } from '../src/data/seeds/political-model';
import { createGame } from '../src/engine/simulation/engine';
import { validateData } from '../src/data/reality/validate';

describe('2026-10-18 source verification', () => {
  it('reproduces regional shares from votes, without counting the Honam subtotal twice', () => {
    expect(election.rows).toHaveLength(17);
    const mapped = Object.values(election.regions).flat().sort();
    expect(mapped).toEqual(election.rows.map(row => row.province).sort());
    expect(new Set(mapped).size).toBe(17);
    for (const row of election.rows) {
      expect(row.validVotes + row.invalidVotes).toBe(row.ballots);
      expect(row.dp + row.ppp).toBeLessThanOrEqual(row.validVotes);
    }
    for (const [region, provinces] of Object.entries(election.regions)) {
      const rows = election.rows.filter(row => provinces.includes(row.province));
      const denominator = rows.reduce((sum, row) => sum + row.validVotes, 0);
      for (const party of ['dp', 'ppp'] as const) {
        const votes = rows.reduce((sum, row) => sum + row[party], 0);
        const target = realityPack.calibrationTargets!.find(row => row.regionId === region && row.partyId === party)!;
        expect(target.target.status).toBe('REAL_FACT');
        expect(target.target.value).toBe(Math.round(votes * 1_000_000 / denominator));
        expect(target.target.asOf).toBe(election.asOf);
      }
    }
  });
  it('reproduces the nine-survey mean and uses actual party IDs', () => {
    expect(polls.polls).toHaveLength(9);
    expect(new Set(polls.polls.map(row => row.registrationId)).size).toBe(9);
    const targets = realityPack.calibrationTargets!.filter(row => row.kind === 'recent-poll-aggregate');
    expect(targets).toHaveLength(4);
    for (const party of ['dp', 'ppp', 'rkp', 'reform'] as const) {
      // Use integer tenths of a percentage point to avoid early rounding.
      const sumTenths = polls.polls.reduce((sum, row) => sum + Math.round(row[party] * 10), 0);
      expect(targets.find(row => row.partyId === party)!.target.value).toBe(Math.round(sumTenths * 1000 / polls.polls.length));
    }
    expect(targets.some(row => row.partyId === 'all')).toBe(false);
  });
  it('uses a measured approval percentage and removes the obsolete fallback', () => {
    const approval = realityPack.facts.find(row => row.id === 'government-approval')!;
    expect(approval).toMatchObject({ status: 'REAL_FACT', value: 39, asOf: '2026-10-15' });
    expect(politicalModel.governmentApprovalFallback).toBeNull();
    expect(createGame(1).politics).toMatchObject({ governmentApprovalBaseline: -220000, governmentApprovalStatus: 'REAL_FACT' });
  });
  it('reproduces all 32 population cells and national counts with no double counting', () => {
    expect(population.rows).toHaveLength(16);
    expect(new Set(population.rows.map(row => row.code)).size).toBe(16);
    expect(population.national.total).toBe(51_082_431);
    const regions = population.regionByCode as Record<string, string>;
    expect(population.rows.map(row => row.code).sort()).toEqual(Object.keys(regions).sort());
    for (let age = 0; age <= 100; age++) {
      expect(population.rows.reduce((sum, row) => sum + row.ages[age]!, 0)).toBe(population.national.ages[age]);
    }
    for (const row of [population.national, ...population.rows]) {
      expect(row.ages).toHaveLength(101);
      expect(row.ages.reduce((a, b) => a + b, 0)).toBe(row.total);
      expect(row.maleTotal + row.femaleTotal).toBe(row.total);
    }
    const intervals = { '18-29': [18, 30], '30-44': [30, 45], '45-59': [45, 60], '60+': [60, 101] } as const;
    expect(realityPack.regionAgeMarginals).toHaveLength(32);
    for (const cell of realityPack.regionAgeMarginals!) {
      const [start, end] = intervals[cell.ageBand];
      const expected = population.rows.filter(row => regions[row.code] === cell.regionId)
        .reduce((sum, row) => sum + row.ages.slice(start, end).reduce((a, b) => a + b, 0), 0);
      expect(cell.mass).toMatchObject({ status: 'REAL_FACT', value: expected, asOf: '2026-09-30' });
    }
    expect(realityPack.regionAgeMarginals!.reduce((sum, cell) => sum + cell.mass.value, 0)).toBe(44_568_022);
    expect(population.national.ages.slice(18).reduce((a, b) => a + b, 0)).toBe(44_568_022);
    expect(createGame(1).cohorts.reduce((sum, cohort) => sum + cohort.weight, 0)).toBe(1_000_000);
  });
  it('records an unresolved future law and a scheduled date without claiming confirmation', () => {
    expect(realityPack.facts.find(row => row.id === 'law-transition')).toMatchObject({ status: 'REAL_FACT', resolution: 'UNRESOLVED' });
    expect(realityPack.electionLawState).toBe('UNRESOLVED');
    expect(realityPack.electionDate).toMatchObject({ status: 'REAL_FACT', value: '2028-04-12', scheduleStatus: 'SCHEDULED' });
    const missingLabel = JSON.parse(JSON.stringify(realityPack));
    delete missingLabel.electionDate.scheduleStatus;
    expect(validateData(missingLabel, seedPack, true).errors.join()).toContain('scheduleStatus');
  });
  it('accounts for all original blockers without weakening release validation', () => {
    expect(audit.items).toHaveLength(56);
    expect(new Set(audit.items.map(row => row.id)).size).toBe(56);
    expect(audit.items.filter(row => row.result === 'RESOLVED')).toHaveLength(56);
    const remaining = audit.items.filter(row => row.result === 'UNVERIFIED').map(row => `${row.id}: UNVERIFIED_ASSUMPTION`).sort();
    expect(validateData(realityPack, seedPack).warnings.sort()).toEqual(remaining);
    expect(validateData(realityPack, seedPack, true).errors.sort()).toEqual(remaining);
    expect(remaining).toEqual([]);
  });
});
