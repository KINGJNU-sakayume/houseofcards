import type { GameState } from '../../types/game';
import { NONE_ID } from '../../types/politics';
import { roundDiv } from '../simulation/math';
import { evaluateSupport } from './model';

// Vote Flow (Slice §28): estimated movement from each cohort's prior loyalty
// (party attachment carried from the previous election) to its current choice.
// Minimum-movement estimate per cohort: each party keeps min(prior, now); its
// losses go to the parties that gained, in proportion to their gains. Weighted
// by cohort size × turnout. Q6 shares of the national electorate, from → to.
export type VoteFlow = Record<string, Record<string, number>>;
export function voteFlow(state: GameState): VoteFlow {
  const { ids, prepared } = evaluateSupport(state);
  const targets = [...ids, NONE_ID];
  const sums: Record<string, Record<string, number>> = Object.fromEntries(ids.map(p => [p, Object.fromEntries(targets.map(q => [q, 0]))]));
  let weight = 0;
  for (const row of prepared) {
    const prior = Object.fromEntries(ids.map(p => [p, row.cohort.partyAttachment[p] ?? 0]));
    const now = Object.fromEntries(targets.map(q => [q, row.shares[q] ?? 0]));
    const kept = Object.fromEntries(ids.map(p => [p, Math.min(prior[p]!, now[p]!)]));
    const gains = Object.fromEntries(targets.map(q => [q, now[q]! - (kept[q] ?? 0)]));
    const totalGain = targets.reduce((s, q) => s + gains[q]!, 0);
    for (const p of ids) {
      const loss = prior[p]! - kept[p]!;
      sums[p]![p]! += kept[p]! * row.weight;
      if (!loss || !totalGain) continue;
      for (const q of targets) if (q !== p && gains[q]) sums[p]![q]! += roundDiv(loss * gains[q]!, totalGain) * row.weight;
    }
    weight += row.weight;
  }
  return Object.fromEntries(ids.map(p => [p, Object.fromEntries(targets.map(q => [q, roundDiv(sums[p]![q]!, Math.max(1, weight))]))]));
}
