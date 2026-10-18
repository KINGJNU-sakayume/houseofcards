import { policyLevers, realityPack, seedPack } from '../../data/reality';
import { politicalModel as model } from '../../data/seeds/political-model';
import type { GameState } from '../../types/game';
import { CORE_VALUES, DOMAIN_IDS } from '../../types/simulation';
import { NONE_ID, type IdentityVector, type PartyPerception, type PoliticsState, type SupportAnalysis, type SupportVector } from '../../types/politics';
import { daysBetween } from '../calendar';
import { initializePollHouses, makePoll } from '../polling';
import { deriveStream, randomInt, streamKey } from '../simulation/rng';
import { fixedMultiply, roundDiv, SCALE } from '../simulation/math';
import { consistency, platformIdentity, policyFit, computeAnalysis } from './model';

const clamp = (n: number, low = 0, high = SCALE) => Math.max(low, Math.min(high, n));
export const quarterKey = (date: string) => `${date.slice(0, 4)}-Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`;
const emptyAnalysis = (date: string): SupportAnalysis => ({ date, currentSupport: {}, potentialSupport: {}, byAge: {}, byRegion: {}, groupMass: {}, neutralViability: 0, playerPartyId: null,
  barriers: null });

export function initializePolitics(base: Omit<GameState, 'politics'>): GameState {
  const parties: PartyPerception[] = base.platforms.map(platform => {
    const seed = model.parties[platform.partyId]!;
    const declaredValues: PartyPerception['declaredValues'] = [];
    return { partyId: platform.partyId, declaredValues, identity: platformIdentity(platform, declaredValues),
      expertise: Object.fromEntries(DOMAIN_IDS.map(d => [d, seed.expertise])) as PartyPerception['expertise'],
      ownership: Object.fromEntries(DOMAIN_IDS.map(d => [d, seed.ownership])) as PartyPerception['ownership'],
      prior: Object.fromEntries(Object.keys(platform.positions).sort().map(id => [id, platform.positions[id]!.publishedValue ?? 2])),
      ai: { month: base.date.slice(0, 7), quarter: quarterKey(base.date), changesThisMonth: 0, changesThisQuarter: 0 },
    };
  });
  const calibrationKey = streamKey('cohort-calibration', base.date);
  let rng = base.rngState[calibrationKey] ?? deriveStream(base.seed, 'cohort-calibration', base.date);
  const perceptions = Object.fromEntries(base.cohorts.map(cohort => [cohort.id, Object.fromEntries(parties.map(party => {
    const draw = randomInt(rng, 20001); rng = draw.state;
    const awareness = clamp(fixedMultiply(model.parties[party.partyId]!.awareness, 800000 + cohort.politicalAttention * 20) + draw.value - 10000);
    return [party.partyId, { awareness, loyalty: cohort.partyAttachment[party.partyId]! }];
  }))]));
  const approval = realityPack.facts.find(f => f.id === 'government-approval');
  const verified = approval?.status === 'REAL_FACT' && typeof approval.value === 'number';
  const fallback = model.governmentApprovalFallback;
  if (!verified && !fallback) throw new Error('검증된 국정평가 또는 명시적인 개발 가정이 필요합니다.');
  const approvalBaseline = verified ? clamp((approval.value as number) * 20000 - SCALE, -SCALE, SCALE) : fallback!.value;
  const { houses, rngState } = initializePollHouses(base.seed, base.date, [...parties.map(p => p.partyId), NONE_ID]);
  const politics: PoliticsState = { parties, perceptions,
    governmentApproval: approvalBaseline,
    governmentApprovalBaseline: approvalBaseline,
    governmentApprovalStatus: verified ? 'REAL_FACT' : 'UNVERIFIED_ASSUMPTION',
    viability: Object.fromEntries(parties.map(p => [p.partyId, model.parties[p.partyId]!.viability])),
    viabilityInput: { asOf: null, shares: {} }, pollHouses: houses, polls: [], analysis: emptyAnalysis(base.date),
  };
  const state: GameState = { ...base, rngState: { ...base.rngState, ...rngState, [calibrationKey]: rng }, politics };
  state.politics.analysis = computeAnalysis(state);
  const initialPoll = makePoll(state.politics.analysis, houses[0]!, base.seed, base.date, state.rngState, 0);
  return { ...state, rngState: initialPoll.rngState, politics: { ...state.politics, polls: [initialPoll.poll] } };
}
// Cubic smoothstep has a bounded S shape, no native transcendental functions.
export function smoothViability(share: number, knee: number, width: number): number {
  const x = clamp(roundDiv((share - knee + width) * SCALE, width * 2));
  return fixedMultiply(fixedMultiply(x, x), 3 * SCALE - 2 * x);
}
export function viabilityTarget(share: number, rules: GameState['rulesetSnapshot']): number {
  const threshold = Math.max(roundDiv(SCALE, rules.listSeats), rules.legalThresholdVoteShare);
  return fixedMultiply(smoothViability(share, threshold, model.viability.thresholdWidth), model.viability.thresholdWeight) +
    fixedMultiply(smoothViability(share, rules.electabilityKnee, model.viability.electabilityWidth), SCALE - model.viability.thresholdWeight);
}
export function updateViability(state: GameState) {
  const polls = state.politics.polls.filter(p => p.date < state.date).slice(-2);
  if (!polls.length) return { viability: state.politics.viability, viabilityInput: state.politics.viabilityInput };
  const shares: SupportVector = {};
  const viability: SupportVector = {};
  for (const id of Object.keys(state.politics.viability).sort()) {
    const containing = state.politics.polls.filter(p => p.date < state.date && p.national.results[id] !== undefined).slice(-2);
    if (!containing.length) { viability[id] = state.politics.viability[id]!; continue; }
    shares[id] = roundDiv(containing.reduce((sum, poll) => sum + poll.national.results[id]!.point, 0), containing.length);
    const current = state.politics.viability[id]!;
    viability[id] = current + clamp(viabilityTarget(shares[id]!, state.rulesetSnapshot) - current, -model.viability.monthlyCap, model.viability.monthlyCap);
  }
  return { viability, viabilityInput: { asOf: polls[polls.length - 1]!.date, shares } };
}
export function evolvePerceptions(state: GameState): GameState {
  const parties = state.politics.parties.map(party => {
    const platform = state.platforms.find(p => p.partyId === party.partyId)!;
    const targetIdentity = platformIdentity(platform, party.declaredValues);
    const identity = Object.fromEntries(CORE_VALUES.map(tag => [tag, party.identity[tag] + fixedMultiply(targetIdentity[tag] - party.identity[tag], model.dynamics.identityRate)])) as IdentityVector;
    const ownership = Object.fromEntries(DOMAIN_IDS.map(domain => {
      const levers = policyLevers.filter(l => l.domain === domain);
      const coverage = roundDiv(levers.filter(l => platform.positions[l.id]!.publishedValue !== null).length * SCALE, levers.length);
      const roleExposure = party.partyId === state.governmentPolicy.partyId ? 50000 : 0;
      const target = fixedMultiply(fixedMultiply(party.expertise[domain], 300000 + fixedMultiply(coverage, 650000) + roleExposure), consistency(platform, domain));
      return [domain, party.ownership[domain] + fixedMultiply(target - party.ownership[domain], model.dynamics.ownershipRate)];
    })) as PartyPerception['ownership'];
    return { ...party, identity, ownership };
  });
  const perceptions = Object.fromEntries(state.cohorts.map(cohort => [cohort.id, Object.fromEntries(parties.map(party => {
    const platform = state.platforms.find(p => p.partyId === party.partyId)!;
    let exposure = 0;
    for (const lever of policyLevers) {
      const position = platform.positions[lever.id]!;
      if (position.publishedValue === null || position.publishedAt === null) continue;
      const freshness = Math.max(150000, SCALE - daysBetween(position.publishedAt, state.date) * 7000);
      const salience = fixedMultiply(cohort.salience[lever.domain] * 100, state.issues.find(i => i.id === lever.domain)!.salience * 100);
      exposure += fixedMultiply(salience, freshness);
    }
    exposure = roundDiv(exposure, policyLevers.length);
    const before = state.politics.perceptions[cohort.id]![party.partyId]!;
    const gain = fixedMultiply(fixedMultiply(fixedMultiply(model.dynamics.awarenessGrowth, exposure), cohort.politicalAttention * 100), SCALE - before.awareness);
    const decay = fixedMultiply(fixedMultiply(model.dynamics.awarenessDecay, SCALE - exposure), before.awareness);
    const awareness = clamp(before.awareness + gain - decay, 0, model.dynamics.awarenessCap);
    const dissatisfaction = Math.max(0, SCALE / 2 - policyFit(cohort, platform, state.issues));
    const loyalty = before.loyalty - fixedMultiply(fixedMultiply(before.loyalty, dissatisfaction), model.dynamics.loyaltyErosion);
    return [party.partyId, { awareness, loyalty }];
  }))]));
  const deterioration = roundDiv(state.issues.reduce((sum, issue) => sum + (issue.severity - seedPack.issueConfigs.find(c => c.id === issue.id)!.severity) * 100, 0), state.issues.length);
  const targetApproval = clamp(state.politics.governmentApprovalBaseline - deterioration, -SCALE, SCALE);
  const governmentApproval = state.politics.governmentApproval + fixedMultiply(targetApproval - state.politics.governmentApproval, model.dynamics.approvalRate);
  return { ...state, politics: { ...state.politics, parties, perceptions, governmentApproval, ...updateViability(state) } };
}
