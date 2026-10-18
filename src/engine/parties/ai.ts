import { PLAYER_PARTY_ID } from '../../types/party';
import { policyLevers } from '../../data/reality';
import { politicalModel as model } from '../../data/seeds/political-model';
import type { GameState } from '../../types/game';
import type { PartyPlatform } from '../../types/simulation';
import { editDraft, enactPolicy, publishPlatform } from '../policy';
import { roundDiv, SCALE, fixedMultiply } from '../simulation/math';
import { deriveStream, randomInt, streamKey } from '../simulation/rng';
import { quarterKey } from '../voters/dynamics';
import { fiscalCredibility } from '../voters/model';

export function platformDiversity(platforms: readonly PartyPlatform[]): number {
  const parties = platforms.filter(p => p.partyId !== PLAYER_PARTY_ID);
  let distance = 0, pairs = 0;
  for (let a = 0; a < parties.length; a++) for (let b = a + 1; b < parties.length; b++) {
    for (const lever of policyLevers) distance += Math.abs((parties[a]!.positions[lever.id]!.publishedValue ?? 2) - (parties[b]!.positions[lever.id]!.publishedValue ?? 2));
    pairs++;
  }
  return pairs ? roundDiv(distance * SCALE, pairs * policyLevers.length * 4) : 0;
}
export function updatePartyAI(state: GameState): { state: GameState; changes: string[] } {
  const key = streamKey('party-ai', state.date);
  let rng = state.rngState[key] ?? deriveStream(state.seed, 'party-ai', state.date);
  let platforms = state.platforms;
  const changes: string[] = [];
  const parties = [...state.politics.parties].sort((a, b) => a.partyId < b.partyId ? -1 : 1).map(party => {
    const quarter = quarterKey(state.date), month = state.date.slice(0, 7);
    let ai = { month, quarter, changesThisMonth: party.ai.month === month ? party.ai.changesThisMonth : 0, changesThisQuarter: party.ai.quarter === quarter ? party.ai.changesThisQuarter : 0 };
    if (party.partyId === PLAYER_PARTY_ID || ai.changesThisMonth >= model.ai.monthlyCap || ai.changesThisQuarter >= model.ai.quarterlyCap) return { ...party, ai };
    const draw = randomInt(rng, SCALE); rng = draw.state;
    const latestPoll = state.politics.polls[state.politics.polls.length - 1]!;
    const midpoint = (result: { low: number; high: number }) => roundDiv(result.low + result.high, 2);
    const support = midpoint(latestPoll.national.results[party.partyId]!);
    const chance = Math.min(SCALE, model.ai.changeChance + fixedMultiply(SCALE - support, 100000));
    if (draw.value >= chance) return { ...party, ai };
    const platform = platforms.find(p => p.partyId === party.partyId)!;
    const credibility = fiscalCredibility(platform);
    // Public poll ranges and shared life-condition priors only. Never inspect
    // hidden consideration sets, awareness, loyalty, or exact current support.
    const cohortWeights = state.cohorts.map(c => {
      const opportunity = SCALE - roundDiv(midpoint(latestPoll.byAge[c.ageBand]!.results[party.partyId]!) + midpoint(latestPoll.byRegion[c.regionId]!.results[party.partyId]!), 2);
      return { cohort: c, weight: c.weight + fixedMultiply(c.weight, opportunity) };
    });
    const candidates = policyLevers.map(lever => {
      let numerator = 0, denominator = 0;
      for (const { cohort, weight } of cohortWeights) {
        const mass = weight * cohort.salience[lever.domain];
        numerator += cohort.preferences[lever.id]! * mass; denominator += mass;
      }
      const target = roundDiv(numerator, Math.max(1, denominator));
      const current = platform.positions[lever.id]!.publishedValue ?? 2;
      const next = current + Math.sign(target - current);
      const prior = party.prior[lever.id]!;
      const priorCost = Math.max(0, Math.abs(next - prior) - 1) * model.ai.priorPenalty;
      const reversalCost = (current - 2) * (next - 2) < 0 ? 250000 : 0;
      const fiscalCost = Math.max(0, lever.fiscalImplication.costPerStep * (next - current)) * roundDiv(SCALE - credibility, 5);
      const issue = state.issues.find(i => i.id === lever.domain)!;
      const opportunity = fixedMultiply(SCALE - support, issue.salience * 100);
      const governingPressure = party.partyId === state.governmentPolicy.partyId ? issue.severity * 10 : 0;
      return { lever, next, score: target === current ? -SCALE : opportunity + governingPressure - priorCost - reversalCost - fiscalCost };
    }).filter(c => c.next >= 0 && c.next <= 4 && c.score > 0).sort((a, b) => b.score - a.score || (a.lever.id < b.lever.id ? -1 : 1));
    for (const candidate of candidates) {
      const next = publishPlatform(editDraft(platform, candidate.lever.id, candidate.next), candidate.lever.id, state.date);
      const proposed = platforms.map(p => p.partyId === party.partyId ? next : p);
      if (platformDiversity(proposed) < model.ai.diversityFloor) continue;
      platforms = proposed;
      ai = { ...ai, changesThisMonth: ai.changesThisMonth + 1, changesThisQuarter: ai.changesThisQuarter + 1 };
      changes.push(`${party.partyId}:${candidate.lever.id}`);
      break; // At most one small lever change per month, also bounded per quarter.
    }
    return { ...party, ai };
  });
  return { state: { ...state, platforms, rngState: { ...state.rngState, [key]: rng }, politics: { ...state.politics, parties } }, changes };
}
export function updateGovernmentAI(state: GameState): { state: GameState; changes: string[] } {
  if (Number(state.date.slice(5, 7)) % 3 !== 0) return { state, changes: [] };
  const quarter = quarterKey(state.date);
  const alreadyChanged = Object.values(state.governmentPolicy.levers).reduce((sum, lever) => sum + lever.history.filter(h => quarterKey(h.enactedAt) === quarter).length, 0);
  if (alreadyChanged >= model.ai.governmentQuarterlyCap) return { state, changes: [] };
  const platform = state.platforms.find(p => p.partyId === state.governmentPolicy.partyId)!;
  const credibility = fiscalCredibility(platform);
  const candidates = policyLevers.map(lever => {
    const current = state.governmentPolicy.levers[lever.id]!.value, target = platform.positions[lever.id]!.publishedValue ?? 2;
    const next = current + Math.sign(target - current);
    const issue = state.issues.find(i => i.id === lever.domain)!;
    const fiscalCost = Math.max(0, lever.fiscalImplication.costPerStep * (next - current));
    const score = target === current || (credibility < 400000 && fiscalCost > 0) ? -1 : roundDiv((issue.severity + issue.structuralPressure * 5) * Math.abs(target - current), 1 + fiscalCost);
    return { lever, next, score };
  }).filter(c => c.score > 0).sort((a, b) => b.score - a.score || (a.lever.id < b.lever.id ? -1 : 1));
  const selected = candidates[0];
  if (!selected) return { state, changes: [] };
  const governmentPolicy = enactPolicy(state.governmentPolicy, state.governmentPolicy.partyId, selected.lever.id, selected.next, state.date);
  return { state: { ...state, governmentPolicy }, changes: [selected.lever.id] };
}
