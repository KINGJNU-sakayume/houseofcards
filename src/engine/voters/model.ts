import { partyManagement } from '../../data/seeds/party-management';
import { PLAYER_PARTY_ID } from '../../types/party';
import { policyLevers } from '../../data/reality';
import { politicalModel as model } from '../../data/seeds/political-model';
import type { GameState } from '../../types/game';
import { CORE_VALUES, DOMAIN_IDS, type Cohort, type CoreValue, type IssueState, type LeverDefinition, type PartyPlatform } from '../../types/simulation';
import { NONE_ID, type IdentityVector, type PartyPerception, type SupportAnalysis, type SupportVector } from '../../types/politics';
import { fixedExp, fixedMultiply, roundDiv, SCALE } from '../simulation/math';
import { normalizeMasses } from './cohorts';

export function policyFit(cohort: Cohort, platform: PartyPlatform, issues: readonly IssueState[], levers: readonly LeverDefinition[] = policyLevers): number {
  let weighted = 0, total = 0;
  for (const domain of DOMAIN_IDS) {
    const domainLevers = levers.filter(l => l.domain === domain);
    if (!domainLevers.length) continue;
    const fit = roundDiv(domainLevers.reduce((sum, lever) => {
      const value = platform.positions[lever.id]?.publishedValue;
      return sum + (value === null || value === undefined ? SCALE / 2 : SCALE - Math.abs(value - cohort.preferences[lever.id]!) * (SCALE / 4));
    }, 0), domainLevers.length);
    const salience = cohort.salience[domain] * (issues.find(i => i.id === domain)?.salience ?? 0);
    weighted += salience * fit; total += salience;
  }
  return total ? roundDiv(weighted, total) : SCALE / 2;
}
export function platformIdentity(platform: PartyPlatform, declaredValues: readonly CoreValue[] = []): IdentityVector {
  return Object.fromEntries(CORE_VALUES.map(tag => {
    let total = declaredValues.includes(tag) ? 1 : 0;
    let sum = total * 750000;
    for (const lever of policyLevers) {
      const value = platform.positions[lever.id]?.publishedValue, weight = lever.valueTags[tag] ?? 0;
      if (value === null || value === undefined || !weight) continue;
      total += weight; sum += value * (SCALE / 4) * weight;
    }
    return [tag, total ? roundDiv(sum, total) : SCALE / 2];
  })) as IdentityVector;
}
export function cohortIdentity(cohort: Cohort): IdentityVector {
  return Object.fromEntries(CORE_VALUES.map(tag => {
    let sum = 0, total = 0;
    for (const lever of policyLevers) {
      const weight = lever.valueTags[tag] ?? 0;
      sum += cohort.preferences[lever.id]! * (SCALE / 4) * weight; total += weight;
    }
    return [tag, total ? roundDiv(sum, total) : SCALE / 2];
  })) as IdentityVector;
}
export function consistency(platform: PartyPlatform, domain?: string): number {
  const positions = policyLevers.filter(l => (!domain || l.domain === domain) && platform.positions[l.id]!.publishedValue !== null).map(l => platform.positions[l.id]!);
  return SCALE - (positions.length ? roundDiv(positions.reduce((sum, p) => sum + p.reversalPenalty * 100, 0), positions.length) : 0);
}
export function fiscalCredibility(platform: PartyPlatform): number {
  let burden = 0, capacity = 0;
  for (const lever of policyLevers) {
    const value = platform.positions[lever.id]!.publishedValue;
    if (value !== null) burden += (value - 2) * lever.fiscalImplication.costPerStep;
    capacity += 2 * Math.abs(lever.fiscalImplication.costPerStep);
  }
  return SCALE - Math.min(750000, Math.max(0, roundDiv(burden * 750000, Math.max(1, capacity))));
}
export function trust(cohort: Cohort, platform: PartyPlatform, party: PartyPerception, issues: readonly IssueState[]): number {
  let sum = 0, total = 0;
  for (const domain of DOMAIN_IDS) {
    const weight = cohort.salience[domain] * issues.find(i => i.id === domain)!.salience;
    sum += weight * fixedMultiply(party.ownership[domain], consistency(platform, domain)); total += weight;
  }
  return fixedMultiply(total ? roundDiv(sum, total) : 0, fiscalCredibility(platform));
}
export function governmentTerm(cohortSensitivity: number, approval: number, partyId: string, governingId: string, partyIds: readonly string[] = Object.keys(model.parties)): number {
  if (approval === 0 || cohortSensitivity === 0) return 0;
  if (partyId === governingId) return fixedMultiply(cohortSensitivity, approval);
  const alignment = (id: string) => id === PLAYER_PARTY_ID ? partyManagement.newParty.oppositionAlignment : model.parties[id]?.oppositionAlignment ?? 0;
  const total = partyIds.filter(id => id !== governingId).reduce((sum, id) => sum + alignment(id), 0);
  const weight = alignment(partyId);
  return -roundDiv(fixedMultiply(cohortSensitivity, approval) * weight, Math.max(1, total));
}
export interface UtilityInputs { fit: number; identity: number; trust: number; loyalty: number; government: number; viability: number }
export function utility(input: UtilityInputs): number {
  return roundDiv(input.fit * model.utility.fit + input.identity * model.utility.identity + input.trust * model.utility.trust +
    input.loyalty * model.utility.loyalty + input.government * model.utility.government + input.viability * model.utility.viability, SCALE);
}
// Enumerate every consideration set, analytically. No sampled voters or Monte Carlo.
// Fixed-point splitting preserves total subset probability; final largest-remainder
// normalization removes only Q6 rounding residue (including the model-derived none).
export function considerationShares(ids: readonly string[], utilities: readonly number[], awareness: readonly number[], noneUtility = model.utility.none): SupportVector {
  if (!ids.length || ids.length > 6 || new Set(ids).size !== ids.length || ids.includes(NONE_ID) || utilities.length !== ids.length || awareness.length !== ids.length ||
    awareness.some(a => !Number.isInteger(a) || a < 0 || a > SCALE)) throw new Error('Invalid consideration set inputs');
  const maximum = Math.max(noneUtility, ...utilities);
  const exp = utilities.map(u => fixedExp(u - maximum));
  const noneExp = fixedExp(noneUtility - maximum);
  let probabilities = [SCALE];
  for (let p = 0; p < ids.length; p++) {
    const next = new Array<number>(probabilities.length * 2).fill(0);
    for (let mask = 0; mask < probabilities.length; mask++) {
      const included = fixedMultiply(probabilities[mask]!, awareness[p]!);
      next[mask] = probabilities[mask]! - included;
      next[mask + probabilities.length] = included;
    }
    probabilities = next;
  }
  const totals = new Array<number>(ids.length + 1).fill(0);
  for (let mask = 0; mask < probabilities.length; mask++) {
    const probability = probabilities[mask]!;
    if (!probability) continue;
    let denominator = noneExp;
    for (let p = 0; p < ids.length; p++) if (mask & (1 << p)) denominator += exp[p]!;
    totals[ids.length]! += roundDiv(probability * noneExp, denominator);
    for (let p = 0; p < ids.length; p++) if (mask & (1 << p)) totals[p]! += roundDiv(probability * exp[p]!, denominator);
  }
  return normalizeMasses([...ids, NONE_ID].map((id, i) => ({ id, mass: totals[i]! })));
}
interface PreparedCohort { cohort: Cohort; inputs: UtilityInputs[]; utilities: number[]; awareness: number[]; weight: number; shares: SupportVector }
export function evaluateSupport(state: GameState) {
  const ids = state.platforms.map(p => p.partyId).sort();
  const prepared: PreparedCohort[] = [];
  const groupTotals: Record<string, SupportVector> = {};
  const groupMass: Record<string, number> = {};
  for (const cohort of state.cohorts) {
    const identity = cohortIdentity(cohort);
    const inputs = ids.map(id => {
      const platform = state.platforms.find(p => p.partyId === id)!;
      const party = state.politics.parties.find(p => p.partyId === id)!;
      const perception = state.politics.perceptions[cohort.id]![id]!;
      return { fit: policyFit(cohort, platform, state.issues), identity: SCALE - roundDiv(CORE_VALUES.reduce((sum, tag) => sum + Math.abs(identity[tag] - party.identity[tag]), 0), CORE_VALUES.length),
        trust: trust(cohort, platform, party, state.issues), loyalty: perception.loyalty,
        government: governmentTerm(cohort.governmentEvaluationSensitivity * 100, state.politics.governmentApproval, id, state.governmentPolicy.partyId, ids), viability: state.politics.viability[id]!,
      };
    });
    const utilities = inputs.map(utility), awareness = ids.map(id => state.politics.perceptions[cohort.id]![id]!.awareness);
    const shares = considerationShares(ids, utilities, awareness);
    const weight = fixedMultiply(cohort.weight, cohort.turnoutTendency * 100);
    prepared.push({ cohort, inputs, utilities, awareness, weight, shares });
    for (const group of ['national', `age:${cohort.ageBand}`, `region:${cohort.regionId}`]) {
      groupMass[group] = (groupMass[group] ?? 0) + weight;
      const totals = groupTotals[group] ??= Object.fromEntries([...ids, NONE_ID].map(id => [id, 0]));
      for (const id of [...ids, NONE_ID]) totals[id]! += shares[id]! * weight;
    }
  }
  const aggregated = Object.fromEntries(Object.keys(groupTotals).sort().map(group => [group, normalizeMasses(Object.entries(groupTotals[group]!).map(([id, mass]) => ({ id, mass })))]));
  return { ids, prepared, aggregated, groupMass };
}
export function neutralViability(current: SupportVector, viability: SupportVector): number {
  const leaders = Object.keys(viability).sort((a, b) => current[b]! - current[a]! || (a < b ? -1 : 1)).slice(0, 2);
  return roundDiv(leaders.reduce((sum, id) => sum + viability[id]!, 0), leaders.length);
}
export function computeAnalysis(state: GameState, playerId: string | null = state.playerParty?.id ?? null): SupportAnalysis {
  const { ids, prepared, aggregated, groupMass } = evaluateSupport(state);
  const current = aggregated.national!, neutral = neutralViability(current, state.politics.viability);
  const counterfactual = (targetId: string, overrides: { awareness?: boolean; viability?: boolean; loyalty?: boolean; fit?: boolean; trust?: boolean; allBarriers?: boolean }) => {
    const index = ids.indexOf(targetId);
    let sum = 0, total = 0;
    for (const row of prepared) {
      const inputs = row.inputs.map((input, i) => ({ ...input,
        ...(overrides.loyalty ? { loyalty: 0 } : {}),
        ...(overrides.allBarriers ? { viability: neutral } : {}),
        ...(i === index ? { ...(overrides.viability ? { viability: neutral } : {}), ...(overrides.fit ? { fit: SCALE } : {}), ...(overrides.trust ? { trust: SCALE } : {}) } : {}),
      }));
      const awareness = row.awareness.map((a, i) => overrides.allBarriers || (i === index && overrides.awareness) ? SCALE : a);
      const share = considerationShares(ids, inputs.map(utility), awareness)[targetId]!;
      sum += share * row.weight; total += row.weight;
    }
    return roundDiv(sum, total);
  };
  const potentialFlags = { allBarriers: true }; // User confirmed Slice Spec: remove barriers for every party.
  const potentialSupport = normalizeMasses([...ids, NONE_ID].map(id => ({ id, mass: counterfactual(id, potentialFlags) })));
  const player = playerId;
  return { date: state.date, playerPartyId: player, currentSupport: current, potentialSupport,
    byAge: Object.fromEntries(Object.entries(aggregated).filter(([key]) => key.startsWith('age:')).map(([key, value]) => [key.slice(4), value])),
    byRegion: Object.fromEntries(Object.entries(aggregated).filter(([key]) => key.startsWith('region:')).map(([key, value]) => [key.slice(7), value])),
    groupMass, neutralViability: neutral,
    barriers: player === null ? null : { awareness: counterfactual(player, { awareness: true }) - current[player]!, viability: counterfactual(player, { viability: true }) - current[player]!,
      priorLoyalty: counterfactual(player, { ...potentialFlags, loyalty: true }) - potentialSupport[player]!,
      policyMismatch: counterfactual(player, { fit: true }) - current[player]!, ownership: counterfactual(player, { trust: true }) - current[player]!,
    },
  };
}
