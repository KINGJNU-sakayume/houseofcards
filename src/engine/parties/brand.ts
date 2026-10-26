import { partyManagement } from '../../data/seeds/party-management';
import type { GameState } from '../../types/game';
import { PLAYER_PARTY_ID } from '../../types/party';
import type { CoreValue } from '../../types/simulation';
import { fixedMultiply, roundDiv, SCALE } from '../simulation/math';
import { platformIdentity } from '../voters/model';
import { postMessage } from './management';
import { policyLevers } from '../../data/reality';

// Brand consistency (phase_c §16, moved to E2): does what the party publishes
// and who it recruits match the three values it declared? Contradiction slowly
// builds an inconsistency (Q6) that scales the player's trust; AI parties are
// never affected. Unproven values (nothing published, no recruit leaning) are
// neutral, not contradictions.
const b = () => partyManagement.brand;
export interface ValueAlignment { value: CoreValue; platform: number | null; recruits: number | null; gap: number }
export function brandAlignment(state: GameState): ValueAlignment[] {
  if (!state.playerParty) return [];
  const platform = state.platforms.find(p => p.partyId === PLAYER_PARTY_ID)!;
  const published = platformIdentity(platform, []);
  const recruits = state.politicians.filter(p => p.status === 'recruited');
  return [...state.playerParty.values].map(value => {
    // Platform evidence only from published levers that carry this value tag.
    const tagged = policyLevers.some(l => (l.valueTags[value] ?? 0) > 0 && platform.positions[l.id]?.publishedValue !== null && platform.positions[l.id]?.publishedValue !== undefined);
    const leans = recruits.map(p => p.valueLean[value]).filter((x): x is number => x !== undefined);
    const platformValue = tagged ? published[value] : null;
    const recruitMean = leans.length ? roundDiv(leans.reduce((a, c) => a + c, 0), leans.length) : null;
    const against = (x: number | null) => x === null ? 0 : Math.max(0, SCALE / 2 - x) * 2;
    const gap = fixedMultiply(against(platformValue), b().platformWeight) + fixedMultiply(against(recruitMean), b().recruitWeight);
    return { value, platform: platformValue, recruits: recruitMean, gap };
  });
}
export function brandTarget(state: GameState): number {
  const rows = brandAlignment(state);
  return rows.length ? roundDiv(rows.reduce((s, r) => s + r.gap, 0), rows.length) : 0;
}
// Factor applied to the player's trust input (SCALE = no effect).
export const brandTrustFactor = (state: GameState) => SCALE - fixedMultiply(state.brandInconsistency, b().maxTrustPenalty);
// Monthly: move slowly toward the current target; warn once when crossing the warning level upward.
export function monthlyBrand(state: GameState): GameState {
  if (!state.playerParty) return state;
  const before = state.brandInconsistency;
  const after = before + fixedMultiply(brandTarget(state) - before, b().monthlyRate);
  let next: GameState = { ...state, brandInconsistency: Math.max(0, Math.min(SCALE, after)) };
  if (before < b().warning && next.brandInconsistency >= b().warning)
    next = postMessage(next, '공약·인재가 내세운 가치와 어긋납니다', '공표한 공약의 방향이나 영입한 인재의 성향이 창당 때 내세운 핵심가치와 반대로 기울고 있습니다. 유권자의 신뢰 평가가 서서히 낮아지며, 일관되게 바로잡으면 서서히 회복합니다. 득표를 직접 빼지는 않습니다.', 'Important', '정책위원장');
  return next;
}
