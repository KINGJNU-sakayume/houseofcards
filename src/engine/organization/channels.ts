import { organizationModel as org } from '../../data/seeds/organization';
import type { GameState } from '../../types/game';
import { DOMAIN_IDS } from '../../types/simulation';
import { fixedMultiply, roundDiv, SCALE } from '../simulation/math';

// §16 effect channels (player only). Pure helpers with no command or inbox
// dependencies so the voter dynamics can import them without cycles.
export function recruits(state: GameState) {
  return state.politicians.filter(p => p.status === 'recruited');
}
// Recruits' Recognition and Media: capped, diminishing party-profile term that
// is added inside the awareness exposure term, never to support.
export function partyProfile(state: GameState): number {
  const scores = recruits(state).map(p => roundDiv((p.attributes.recognition + p.attributes.media) * SCALE, 200)).sort((a, b) => b - a);
  const raw = scores.reduce((sum, score, i) => sum + roundDiv(score, i + 1), 0);
  return Math.min(org.profileCap, fixedMultiply(raw, org.profileScale));
}
export function scoutingActive(state: GameState, regionId: string) {
  const s = state.regionalOrganization[regionId]?.scouting;
  return s && s.until >= state.date ? s : null;
}
export function forumActive(state: GameState, regionId: string) {
  const f = state.regionalOrganization[regionId]?.forum;
  return f && f.until >= state.date ? f : null;
}
// Regional level and an active policy forum scale exposure for that region's cohorts.
export function regionExposureMultiplier(state: GameState, regionId: string): number {
  const region = state.regionalOrganization[regionId];
  if (!region) return SCALE;
  return SCALE + region.level * org.levelExposure + (forumActive(state, regionId)?.intensity ?? 0) * org.forumExposure;
}
export function playerExposure(state: GameState, regionId: string, leverExposure: number, profile = partyProfile(state)): number {
  return Math.min(SCALE, fixedMultiply(leverExposure + profile, regionExposureMultiplier(state, regionId)));
}
// Candidate scouting raises probability weights of prospects from that region only.
export function scoutingWeight(state: GameState, regionId: string): number {
  return 1 + (scoutingActive(state, regionId)?.intensity ?? 0) * org.scoutingWeightPerIntensity;
}
// Recruits' PolicyExpertise (policy chair counts extra) pull player expertise
// slowly toward a capped target; it never falls because of this channel.
export function recruitExpertiseTargets(state: GameState, cap: number): Record<string, number> {
  return Object.fromEntries(DOMAIN_IDS.map(domain => {
    const best = recruits(state).reduce((max, p) => Math.max(max, p.policyExpertise[domain] * 10000 + (p.role === 'policy_chair' ? org.chairExpertiseBonus : 0)), 0);
    return [domain, Math.min(cap, fixedMultiply(best, org.recruitExpertiseScale))];
  }));
}
