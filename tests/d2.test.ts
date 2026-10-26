import { describe, expect, it } from 'vitest';
import legacyCal from './fixtures/phase-cal-v8.json' with { type: 'json' };
import districtData from '../src/data/reality/districts-2024.json' with { type: 'json' };
import { districtPack, validateDistricts, CELL_IDS } from '../src/data/reality/districts';
import { realityPack } from '../src/data/reality';
import { projectDistrict, projectDistricts, regionBaselines } from '../src/engine/election/districts';
import { createGame } from '../src/engine/simulation/engine';
import { createFoundedGame } from './helpers';
import { stateHash } from '../src/engine/simulation/determinism';
import { deserializeSave, serializeSave } from '../src/persistence/codec';

const parties = [...realityPack.parties.map(p => p.id), 'minor-bloc'];
const sum = (v: Record<string, number>) => Object.values(v).reduce((a, b) => a + b, 0);

describe('D2 district data in the Reality pack', () => {
  it('has 254 validated 2024 districts, Active 30 by quota, under the new pack id', () => {
    expect(realityPack.id).toBe('kr-d2-2026-10-18-r4');
    expect(validateDistricts(districtData, realityPack.id, 254, parties)).toEqual([]);
    expect(districtPack.districts).toHaveLength(254);
    expect(districtPack.districts.filter(d => d.active)).toHaveLength(30);
    const broken = structuredClone(districtData); broken.districts.pop();
    expect(validateDistricts(broken, realityPack.id, 254, parties).join()).toContain('253 records');
    const badCell = structuredClone(districtData); (badCell.districts[0]!.cohortComposition as Record<string, number>)[CELL_IDS[0]!]! += 1;
    expect(validateDistricts(badCell, realityPack.id, 254, parties).join()).toContain('composition');
    expect(validateDistricts(districtData, 'other-pack', 254, parties).join()).toContain('packId');
    expect(JSON.stringify(districtData)).not.toMatch(/후보|candidateName/);
  });
});

describe('D2 district projection', () => {
  it('is pure, sums exactly, keeps the top two viable and is not stored in the save', () => {
    const state = createGame(42), before = stateHash(state);
    const a = projectDistricts(state), b = projectDistricts(state);
    expect(a).toEqual(b); expect(stateHash(state)).toBe(before);
    for (const p of a) {
      expect(sum(p.sincere)).toBe(1_000_000); expect(sum(p.final)).toBe(1_000_000);
      const top = Object.keys(p.sincere).sort((x, y) => p.sincere[y]! - p.sincere[x]! || (x < y ? -1 : 1)).slice(0, 2);
      for (const id of top) { expect(p.viability[id]).toBe(1_000_000); expect(p.leakage[id]).toBe(0); expect(p.final[id]!).toBeGreaterThanOrEqual(p.sincere[id]!); }
      expect(Object.keys(p.final)).not.toContain('player');
    }
    const winners = new Set(a.map(p => p.winner));
    expect(winners.has('dp') && winners.has('ppp')).toBe(true);
  });
  it('tactical leakage falls non-linearly as a third party grows (Slice §19: 10% vs 26%)', () => {
    const d = districtPack.districts[0]!;
    const run = (third: number) => {
      const shares = { dp: 500000 - third / 2, ppp: 500000 - third / 2 - 50000, reform: third, rkp: 25000, 'minor-bloc': 25000, none: 0 };
      const cohorts = Object.fromEntries(CELL_IDS.map(cell => [`${d.regionId}/${cell}`, { shares, turnout: 600000, tactical: 500000 }]));
      const p = projectDistrict(d, cohorts, parties, { [d.regionId]: d.baseline2024.districtShare });
      return p.leakage.reform! / p.sincere.reform!;
    };
    const at10 = run(100000), at26 = run(260000), at35 = run(350000);
    expect(at10).toBeGreaterThan(at26 * 2); expect(at26).toBeGreaterThanOrEqual(at35);
  });
  it('includes the founded player with no 2024 residual, and the district residual sums to about zero per region', () => {
    const founded = createFoundedGame(42), p = projectDistricts(founded);
    for (const x of p) expect(x.sincere.player).toBeDefined();
    const base = regionBaselines();
    for (const [region, v] of Object.entries(base)) {
      const ds = districtPack.districts.filter(d => d.regionId === region);
      const w = ds.reduce((s, d) => s + d.turnout2024, 0);
      for (const party of Object.keys(v)) {
        const residual = ds.reduce((s, d) => s + ((d.baseline2024.districtShare[party] ?? 0) - v[party]!) * d.turnout2024, 0) / w;
        expect(Math.abs(residual)).toBeLessThan(2);
      }
    }
  });
  it('rejects real CAL saves (old Reality pack) with Korean keep-JSON guidance', () => {
    expect(legacyCal.state.realityPackId).toBe('kr-b2-2026-10-18-r3');
    // Schema 8 is now rejected first (D3); the pack-id check still guards same-schema saves.
    expect(() => deserializeSave(JSON.stringify(legacyCal))).toThrow('스키마 8');
    const repacked = JSON.parse(serializeSave(createGame(42))); repacked.state.realityPackId = 'kr-b2-2026-10-18-r3'; repacked.checksum = stateHash(repacked.state);
    expect(() => deserializeSave(JSON.stringify(repacked))).toThrow('현실 데이터 기준이 다른 개발 프리뷰 세이브입니다. 기존 JSON을 보관');
  });
});
