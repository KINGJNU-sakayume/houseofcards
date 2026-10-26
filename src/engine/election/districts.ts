import { districtPack, type District } from '../../data/reality/districts';
import { districtModel } from '../../data/seeds/district-model';
import type { GameState } from '../../types/game';
import { NONE_ID, type SupportVector } from '../../types/politics';
import { fixedMultiply, roundDiv, SCALE } from '../simulation/math';
import { normalizeMasses } from '../voters/cohorts';
import { considerationShares, evaluateSupport } from '../voters/model';
import { smoothViability } from '../voters/dynamics';
import { nominationModel } from '../../data/seeds/nomination';
import { PLAYER_PARTY_ID } from '../../types/party';
import { candidateQuality } from './nominations';

// D2/D3 district projection (Slice §17–19, §26). Pure and recomputed on demand;
// nothing is stored in the save. From the nomination stage the player stands
// only where it has a nominee; the nominee's quality enters the district
// utility and Recognition plus regional organization set an awareness floor.
export interface CandidateEffect { politicianId: string; quality: number; utilityTerm: number; awarenessFloor: number }
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
  playerStanding: boolean;
  candidate: CandidateEffect | null;
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
  return { id: district.id, sincere, viability, leakage, final, winner, tacticalTendency, playerStanding: partyIds.includes(PLAYER_PARTY_ID), candidate: null };
}

// Before the nomination stage the player is shown as a party everywhere (pre-nomination estimate).
export const nominationsDecide = (state: GameState) => state.playerParty !== null && state.date >= nominationModel.gates.nominations;
export function candidateEffect(state: GameState, district: District): CandidateEffect | null {
  const nomination = state.nominations.districts[district.id];
  if (!nomination) return null;
  const person = state.politicians.find(p => p.id === nomination.politicianId)!, c = nominationModel.candidate;
  const quality = candidateQuality(person, district);
  const level = state.regionalOrganization[district.regionId]?.level ?? 0;
  return { politicianId: person.id, quality, utilityTerm: fixedMultiply(quality - SCALE / 2, c.utilityWeight),
    awarenessFloor: Math.min(SCALE, fixedMultiply(person.attributes.recognition * 10000, c.awarenessFromRecognition) + fixedMultiply(level * 10000, c.awarenessFromOrganization)) };
}
export function projectDistricts(state: GameState, districts: readonly District[] = districtPack.districts): DistrictProjection[] {
  const { ids, prepared } = evaluateSupport(state);
  const row = (shares: SupportVector, cohort: typeof prepared[number]['cohort']) => ({ shares, turnout: cohort.turnoutTendency * 100, tactical: cohort.tacticalVotingTendency * 100 });
  const cohortShares = Object.fromEntries(prepared.map(r => [r.cohort.id, row(r.shares, r.cohort)]));
  const baselines = regionBaselines(districts);
  if (!nominationsDecide(state)) return districts.map(d => projectDistrict(d, cohortShares, ids, baselines));
  const player = ids.indexOf(PLAYER_PARTY_ID), others = ids.filter(id => id !== PLAYER_PARTY_ID);
  // Without a player nominee the cohort chooses among the other parties.
  const without = Object.fromEntries(prepared.map(r => [r.cohort.id, row(considerationShares(others, r.utilities.filter((_, i) => i !== player), r.awareness.filter((_, i) => i !== player)), r.cohort)]));
  return districts.map(d => {
    const effect = candidateEffect(state, d);
    if (!effect) return projectDistrict(d, without, others, baselines);
    const local = Object.fromEntries(prepared.filter(r => r.cohort.regionId === d.regionId).map(r => [r.cohort.id, row(considerationShares(ids,
      r.utilities.map((u, i) => i === player ? u + effect.utilityTerm : u), r.awareness.map((a, i) => i === player ? Math.max(a, effect.awarenessFloor) : a)), r.cohort)]));
    return { ...projectDistrict(d, { ...cohortShares, ...local }, ids, baselines), candidate: effect };
  });
}
