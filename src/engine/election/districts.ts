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
import { campaignStrength } from './finalPush';
import { electionModel } from '../../data/seeds/election';

// D2/D3 district projection (Slice §17–19, §26). Pure and recomputed on demand;
// nothing is stored in the save. From the nomination stage the player stands
// only where it has a nominee; the nominee's quality enters the district
// utility and Recognition plus regional organization set an awareness floor.
export interface CandidateEffect { politicianId: string; quality: number; campaign: number; utilityTerm: number; awarenessFloor: number }
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

// Region baseline: turnout-weighted mean of 2024 shares for one ballot.
export function regionBaselines(districts: readonly District[] = districtPack.districts, ballot: 'districtShare' | 'listShare' = 'districtShare'): Record<string, SupportVector> {
  const sums: Record<string, Record<string, number>> = {}, weights: Record<string, number> = {};
  for (const d of districts) {
    const s = sums[d.regionId] ??= {};
    weights[d.regionId] = (weights[d.regionId] ?? 0) + d.turnout2024;
    for (const [party, share] of Object.entries(d.baseline2024[ballot])) s[party] = (s[party] ?? 0) + share * d.turnout2024;
  }
  return Object.fromEntries(Object.entries(sums).map(([region, s]) => [region, Object.fromEntries(Object.entries(s).map(([p, v]) => [p, roundDiv(v, weights[region]!)]))]));
}

function viabilityOf(share: number): number {
  const { low, high } = districtModel.viability;
  return smoothViability(share, roundDiv(low + high, 2), roundDiv(high - low, 2));
}

type CohortShares = Record<string, { shares: SupportVector; turnout: number; tactical: number }>;
// Party masses among voters choosing a party: regional cohort choice × composition
// plus the district's 2024 residual for the chosen ballot, plus an optional swing (D4 election day).
export function sincereShares(district: District, cohortShares: CohortShares, partyIds: readonly string[], baselines: Record<string, SupportVector>, ballot: 'districtShare' | 'listShare' = 'districtShare', swing: SupportVector = {}): { sincere: SupportVector; tacticalTendency: number } {
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
    const residual = (district.baseline2024[ballot][id] ?? 0) - (base[id] ?? 0);
    return { id, mass: Math.max(0, regional + residual + (swing[id] ?? 0)) };
  });
  const sincere = normalizeMasses(masses.some(m => m.mass > 0) ? masses : masses.map(m => ({ ...m, mass: 1 })));
  return { sincere, tacticalTendency: fixedMultiply(roundDiv(tactical, Math.max(1, weight)), districtModel.tacticalScale) };
}
export function projectDistrict(district: District, cohortShares: CohortShares, partyIds: readonly string[], baselines = regionBaselines(), swing: SupportVector = {}): DistrictProjection {
  const { sincere, tacticalTendency } = sincereShares(district, cohortShares, partyIds, baselines, 'districtShare', swing);
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
  // D4 Final Push effort (concave) adds to the same two terms.
  const campaign = campaignStrength(state.finalPush.effort[district.id] ?? 0), push = electionModel.finalPush;
  return { politicianId: person.id, quality, campaign, utilityTerm: fixedMultiply(quality - SCALE / 2, c.utilityWeight) + fixedMultiply(campaign, push.campaignUtility),
    awarenessFloor: Math.min(SCALE, fixedMultiply(person.attributes.recognition * 10000, c.awarenessFromRecognition) + fixedMultiply(level * 10000, c.awarenessFromOrganization) + fixedMultiply(campaign, push.campaignAwareness)) };
}
// Cohort choice sets for the projection: everyone, without the player, and with
// the player's nominee terms in one district's region.
export function districtInputs(state: GameState) {
  const { ids, prepared } = evaluateSupport(state);
  const row = (shares: SupportVector, cohort: typeof prepared[number]['cohort']) => ({ shares, turnout: cohort.turnoutTendency * 100, tactical: cohort.tacticalVotingTendency * 100 });
  const all: CohortShares = Object.fromEntries(prepared.map(r => [r.cohort.id, row(r.shares, r.cohort)]));
  const player = ids.indexOf(PLAYER_PARTY_ID), others = ids.filter(id => id !== PLAYER_PARTY_ID);
  let cachedWithout: CohortShares | null = null;
  const without = () => cachedWithout ??= player < 0 ? all : Object.fromEntries(prepared.map(r => [r.cohort.id, row(considerationShares(others, r.utilities.filter((_, i) => i !== player), r.awareness.filter((_, i) => i !== player)), r.cohort)]));
  const withNominee = (d: District, effect: CandidateEffect): CohortShares => ({ ...all, ...Object.fromEntries(prepared.filter(r => r.cohort.regionId === d.regionId).map(r => [r.cohort.id, row(considerationShares(ids,
    r.utilities.map((u, i) => i === player ? u + effect.utilityTerm : u), r.awareness.map((a, i) => i === player ? Math.max(a, effect.awarenessFloor) : a)), r.cohort)])) });
  return { ids, others, prepared, all, without, withNominee };
}
export function projectDistricts(state: GameState, districts: readonly District[] = districtPack.districts, swing: (districtId: string) => SupportVector = () => ({})): DistrictProjection[] {
  const inputs = districtInputs(state), baselines = regionBaselines(districts);
  if (!nominationsDecide(state)) return districts.map(d => projectDistrict(d, inputs.all, inputs.ids, baselines, swing(d.id)));
  return districts.map(d => {
    const effect = candidateEffect(state, d);
    if (!effect) return projectDistrict(d, inputs.without(), inputs.others, baselines, swing(d.id));
    return { ...projectDistrict(d, inputs.withNominee(d, effect), inputs.ids, baselines, swing(d.id)), candidate: effect };
  });
}
