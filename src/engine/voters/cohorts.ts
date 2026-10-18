import type { RealityPack, SeedPack } from '../../data/reality/schema';
import { REGION_IDS } from '../../data/reality/schema';
import { AGE_BANDS, PROFILE_IDS, type Cohort, type LeverDefinition, type LeverValue } from '../../types/simulation';
import { roundDiv, SCALE } from '../simulation/math';
import { deriveStream, randomInt, streamKey } from '../simulation/rng';

// Largest remainder, integer arithmetic, ties resolved by stable ID.
export function normalizeMasses(rows: readonly { id: string; mass: number }[], total = SCALE): Record<string, number> {
  if (!Number.isSafeInteger(total) || total < 0 || new Set(rows.map(r => r.id)).size !== rows.length ||
    rows.some(row => !Number.isSafeInteger(row.mass) || row.mass < 0)) throw new Error('Invalid normalization inputs');
  const sum = rows.reduce((s, row) => s + BigInt(row.mass), 0n);
  if (sum === 0n) throw new Error('Cannot normalize zero mass');
  const allocations = rows.map(row => {
    const numerator = BigInt(row.mass) * BigInt(total);
    return { id: row.id, value: Number(numerator / sum), remainder: numerator % sum };
  });
  const remaining = total - allocations.reduce((s, row) => s + row.value, 0);
  allocations.sort((a, b) => a.remainder === b.remainder ? (a.id < b.id ? -1 : 1) : a.remainder > b.remainder ? -1 : 1);
  for (let i = 0; i < remaining; i++) allocations[i]!.value++;
  return Object.fromEntries(allocations.sort((a, b) => a.id < b.id ? -1 : 1).map(row => [row.id, row.value]));
}
export function buildCohorts(reality: RealityPack, seeds: SeedPack, levers: readonly LeverDefinition[], seed: number, date: string, partyIds: readonly string[]) {
  const marginals = reality.regionAgeMarginals;
  if (!marginals || marginals.length !== REGION_IDS.length * AGE_BANDS.length) throw new Error('Demographic marginals are incomplete');
  const masses = normalizeMasses(marginals.map(row => ({ id: `${row.regionId}/${row.ageBand}`, mass: row.mass.value })));
  const cohorts: Cohort[] = [];
  for (const regionId of [...REGION_IDS].sort()) for (const ageBand of [...AGE_BANDS].sort()) {
    const conditional = seeds.profileConditionals.find(row => row.regionId === regionId && row.ageBand === ageBand)!;
    const weights = normalizeMasses(PROFILE_IDS.map((id, i) => ({ id, mass: conditional.masses[i]! })), masses[`${regionId}/${ageBand}`]!);
    for (const profileId of [...PROFILE_IDS].sort()) {
      const profile = seeds.cohortProfiles.find(p => p.id === profileId)!;
      const preferences = Object.fromEntries([...levers].sort((a, b) => a.id < b.id ? -1 : 1).map(lever => {
        const tags = Object.keys(lever.valueTags).sort() as (keyof typeof lever.valueTags)[];
        const weights = tags.reduce((s, tag) => s + lever.valueTags[tag]!, 0);
        const target = roundDiv(tags.reduce((s, tag) => s + lever.valueTags[tag]! * (profile.preferenceTags[tag] ?? 2), 0), weights);
        return [lever.id, Math.max(0, Math.min(4, target)) as LeverValue];
      }));
      cohorts.push({ id: `${regionId}/${ageBand}/${profileId}`, regionId, ageBand, profileId,
        weight: weights[profileId]!, preferences, salience: { ...profile.salience }, partyAttachment: {},
        politicalAttention: profile.politicalAttention, turnoutTendency: profile.turnoutTendency,
        tacticalVotingTendency: profile.tacticalVotingTendency, governmentEvaluationSensitivity: profile.governmentEvaluationSensitivity,
      });
    }
  }
  const key = streamKey('cohort-calibration', date);
  let rng = deriveStream(seed, 'cohort-calibration', date);
  for (const cohort of cohorts.sort((a, b) => a.id < b.id ? -1 : 1)) {
    const attachment = [...partyIds].sort().map(id => {
      const draw = randomInt(rng, 1000); rng = draw.state;
      return { id, mass: (draw.value + 1) * seeds.partyAttachmentMasses[id]! };
    });
    cohort.partyAttachment = normalizeMasses(attachment);
  }
  return { cohorts, rngState: { [key]: rng } };
}
