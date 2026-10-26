import { z } from 'zod';
import data from './districts-2024.json' with { type: 'json' };
import { REGION_IDS } from './schema';
import { AGE_BANDS, PROFILE_IDS } from '../../types/simulation';
import { deepFreeze } from '../../engine/simulation/determinism';

// 2024 National Assembly districts (Light records, REAL-WORLD BASELINE) derived in
// DD2/DD3 from NEC and MOIS data; party-level only, no candidate names.
const q = z.number().int().min(0).max(1_000_000);
const shares = z.record(z.string(), q);
export const CELL_IDS = AGE_BANDS.flatMap(age => PROFILE_IDS.map(profile => `${age}/${profile}`));
export const districtSchema = z.strictObject({
  id: z.string().regex(/^kr2024-\d{3}$/), sido: z.string().min(1), name: z.string().min(1), regionId: z.enum(REGION_IDS), active: z.boolean(),
  electors2024: z.number().int().positive(), turnout2024: z.number().int().positive(),
  cohortComposition: z.record(z.string(), q),
  baseline2024: z.strictObject({ districtShare: shares, listShare: shares, winnerGameParty: z.string(), marginShare: q }),
});
export const districtPackSchema = z.strictObject({
  packId: z.string(), source: z.string(), label: z.string(), quotas: z.record(z.enum(REGION_IDS), z.number().int().min(0)),
  active30Criteria: z.string(), districts: z.array(districtSchema),
});
export type District = z.infer<typeof districtSchema>;
export const districtPack = deepFreeze(districtPackSchema.parse(data));
// Structural checks run by `npm run validate:data` and the tests.
export function validateDistricts(pack: unknown, realityPackId: string, districtSeats: number, partyIds: readonly string[]): string[] {
  const parsed = districtPackSchema.safeParse(pack);
  if (!parsed.success) return parsed.error.issues.map(i => `districts.${i.path.join('.')}: ${i.message}`);
  const p = parsed.data, errors: string[] = [];
  const allowed = new Set([...partyIds, 'independent']);
  if (p.packId !== realityPackId) errors.push(`districts: packId ${p.packId} ≠ reality pack ${realityPackId}`);
  if (p.districts.length !== districtSeats) errors.push(`districts: ${p.districts.length} records ≠ ruleset district seats ${districtSeats}`);
  if (new Set(p.districts.map(d => d.id)).size !== p.districts.length) errors.push('districts: duplicate id');
  for (const d of p.districts) {
    const cells = Object.keys(d.cohortComposition).sort();
    if (cells.join() !== [...CELL_IDS].sort().join() || Object.values(d.cohortComposition).reduce((a, b) => a + b, 0) !== 1_000_000) errors.push(`${d.id}: composition must be the 12 cells summing to 1,000,000`);
    for (const key of ['districtShare', 'listShare'] as const) {
      const v = d.baseline2024[key];
      if (Object.values(v).reduce((a, b) => a + b, 0) !== 1_000_000 || Object.keys(v).some(id => !allowed.has(id))) errors.push(`${d.id}: ${key} must sum to 1,000,000 over game parties`);
    }
    if (!allowed.has(d.baseline2024.winnerGameParty)) errors.push(`${d.id}: unknown winner party`);
  }
  for (const region of REGION_IDS) {
    const active = p.districts.filter(d => d.regionId === region && d.active).length;
    if (active !== (p.quotas[region] ?? 0)) errors.push(`districts: ${region} active ${active} ≠ quota ${p.quotas[region]}`);
    if (!p.districts.some(d => d.regionId === region)) errors.push(`districts: no district in ${region}`);
  }
  if (p.districts.filter(d => d.active).length !== 30) errors.push('districts: Active must be 30');
  return errors;
}
