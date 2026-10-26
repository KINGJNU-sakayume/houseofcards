import { districtPack, type District } from '../../data/reality/districts';
import { districtModel } from '../../data/seeds/district-model';
import type { GameState } from '../../types/game';
import { NONE_ID, type SupportVector } from '../../types/politics';
import { fixedMultiply, roundDiv, SCALE } from '../simulation/math';
import { normalizeMasses } from '../voters/cohorts';
import { evaluateSupport } from '../voters/model';
import { smoothViability } from '../voters/dynamics';

// D2 district projection (Slice §17–19). Pure and recomputed on demand; nothing
// is stored in the save. It is a save-model estimate before nominations
// (D3): candidate and organization terms are not part of it yet.
export interface DistrictProjection {
  id: string;
  // Party shares among voters choosing a party, before tactical voting.
  sincere: SupportVector;
  // District viability per party (Q6): top two are viable, others follow the S-curve.
  viability: SupportVector;
  // Share each non-viable party loses to the top two.
  leakage: SupportVector;
  final: SupportVector;
  winner: string;
  tacticalTendency: number;
}

// Region baseline: turnout-weighted mean of 2024 district-ballot shares.
export function regionBaselines(districts: readonly District[] = districtPack.districts): Record<string, SupportVector> {
  const sums: Record<string, Record<string, number>> = {}, weights: Record<string, number> = {};
  for (const d of districts) {
    const s = sums[d.regionId] ??= {};
    weights[d.regionId] = (weights[d.regionId] ?? 0) + d.turnout2024;
    for (const [party, share] of Object.entries(d.baseline2024.districtShare)) s[party] = (s[party] ?? 0) + share * d.turnout2024;
  }
  return Object.fromEntries(Object.entries(sums).map(([region, s]) => [region, Object.fromEntries(Object.entries(s).map(([p, v]) => [p, roundDiv(v, weights[region]!)]))]));
}

function viabilityOf(share: number): number {
  const { low, high } = districtModel.viability;
  return smoothViability(share, roundDiv(low + high, 2), roundDiv(high - low, 2));
}

export function projectDistrict(district: District, cohortShares: Record<string, { shares: SupportVector; turnout: number; tactical: number }>, partyIds: readonly string[], baselines = regionBaselines()): DistrictProjection {
  // Regional cohort choice × this district's composition, weighted by turnout.
  const totals: Record<string, number> = Object.fromEntries([...partyIds, NONE_ID].map(id => [id, 0]));
  let weight = 0, tactical = 0;
  for (const [cell, mass] of Object.entries(district.cohortComposition).sort()) {
    const cohort = cohortShares[`${district.regionId}/${cell}`];
    if (!cohort) throw new Error(`Missing cohort ${district.regionId}/${cell}`);
    const w = fixedMultiply(mass, cohort.turnout);
    weight += w; tactical += w * cohort.tactical;
    for (const id of Object.keys(totals)) totals[id]! += w * (cohort.shares[id] ?? 0);
  }
  // Plus the district's 2024 deviation from its region (residual), game parties only.
  const base = baselines[district.regionId]!;
  const masses = partyIds.map(id => {
    const regional = roundDiv(totals[id]!, Math.max(1, weight));
    const residual = (district.baseline2024.districtShare[id] ?? 0) - (base[id] ?? 0);
    return { id, mass: Math.max(0, regional + residual) };
  });
  const sincere = normalizeMasses(masses.some(m => m.mass > 0) ? masses : masses.map(m => ({ ...m, mass: 1 })));
  const tacticalTendency = fixedMultiply(roundDiv(tactical, Math.max(1, weight)), districtModel.tacticalScale);
  // Tactical voting: supporters of non-viable parties move to the top two.
  const ranked = [...partyIds].sort((a, b) => sincere[b]! - sincere[a]! || (a < b ? -1 : 1));
  const top = ranked.slice(0, 2);
  const viability: SupportVector = {}, leakage: SupportVector = {};
  let moved = 0;
  for (const id of partyIds) {
    viability[id] = top.includes(id) ? SCALE : viabilityOf(sincere[id]!);
    leakage[id] = top.includes(id) ? 0 : fixedMultiply(sincere[id]!, fixedMultiply(tacticalTendency, SCALE - viability[id]!));
    moved += leakage[id]!;
  }
  const topMass = top.reduce((s, id) => s + sincere[id]!, 0);
  const final = normalizeMasses(partyIds.map(id => ({ id, mass: top.includes(id)
    ? sincere[id]! + (topMass ? roundDiv(moved * sincere[id]!, topMass) : 0)
    : sincere[id]! - leakage[id]! })));
  const winner = [...partyIds].sort((a, b) => final[b]! - final[a]! || (a < b ? -1 : 1))[0]!;
  return { id: district.id, sincere, viability, leakage, final, winner, tacticalTendency };
}

export function projectDistricts(state: GameState, districts: readonly District[] = districtPack.districts): DistrictProjection[] {
  const { ids, prepared } = evaluateSupport(state);
  const cohortShares = Object.fromEntries(prepared.map(row => [row.cohort.id, {
    shares: row.shares, turnout: row.cohort.turnoutTendency * 100, tactical: row.cohort.tacticalVotingTendency * 100 }]));
  const baselines = regionBaselines(districts);
  return districts.map(d => projectDistrict(d, cohortShares, ids, baselines));
}
