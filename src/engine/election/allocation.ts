import type { RulesetPreset } from '../../data/rulesets';

// Pure seat allocation (Slice §7.5). Integer/BigInt arithmetic only; every
// seat count comes from Ruleset data. Ties that the law settles by lottery or
// by the older candidate are resolved by an explicit order supplied by the caller.
export type Votes = Readonly<Record<string, number>>;
const big = (n: number) => {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('득표·의석 입력은 0 이상의 정수여야 합니다.');
  return BigInt(n);
};
const rank = (order: readonly string[], id: string) => { const i = order.indexOf(id); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };

// Hare quota with largest remainders: whole seats first, then the remaining
// seats by remainder; equal remainders follow `tieOrder` (the lottery result).
export function hareLargestRemainder(seats: number, weights: Votes, tieOrder: readonly string[] = []): Record<string, number> {
  const ids = Object.keys(weights).sort();
  const total = ids.reduce((sum, id) => sum + big(weights[id]!), 0n), s = big(seats);
  const result: Record<string, number> = Object.fromEntries(ids.map(id => [id, 0]));
  if (total === 0n || seats === 0) return result;
  const remainders = ids.map(id => {
    const product = s * big(weights[id]!);
    result[id] = Number(product / total);
    return { id, remainder: product % total };
  });
  let left = seats - ids.reduce((sum, id) => sum + result[id]!, 0);
  remainders.sort((a, b) => a.remainder === b.remainder ? rank(tieOrder, a.id) - rank(tieOrder, b.id) || (a.id < b.id ? -1 : 1) : a.remainder > b.remainder ? -1 : 1);
  for (const row of remainders) { if (left <= 0) break; if (row.remainder > 0n || weights[row.id]! > 0) { result[row.id]!++; left--; } }
  return result;
}
// Parties that may receive list seats: positive list votes and, when the ruleset
// has a legal threshold, a vote share at least the threshold or enough district seats.
export function eligibleParties(preset: RulesetPreset, votes: Votes, districtWins: Votes): string[] {
  const total = Object.values(votes).reduce((sum, v) => sum + big(v), 0n);
  return Object.keys(votes).filter(id => {
    if (!votes[id]) return false;
    const t = preset.legalThreshold;
    if (!t) return true;
    return big(votes[id]!) * 1_000_000n >= big(t.voteShare) * total || (districtWins[id] ?? 0) >= t.orDistrictSeats;
  }).sort();
}
export interface ListAllocation {
  eligible: string[];
  list: Record<string, number>;
  // Semi-compensatory detail (empty for parallel).
  compensatory: Record<string, number>;
  parallel: Record<string, number>;
}
// Round half up at the first decimal for a non-negative rational n/d.
const roundHalfUp = (n: bigint, d: bigint) => (2n * n + d) / (2n * d);
export function allocateList(preset: RulesetPreset, votes: Votes, districtWins: Votes, tieOrder: readonly string[] = []): ListAllocation {
  const eligible = eligibleParties(preset, votes, districtWins);
  const eligibleVotes = Object.fromEntries(eligible.map(id => [id, votes[id]!]));
  if (preset.listMethod === 'parallel') {
    const list = hareLargestRemainder(preset.listSeats, eligibleVotes, tieOrder);
    return { eligible, list, compensatory: {}, parallel: list };
  }
  const semi = preset.semiCompensatory!;
  const V = eligible.reduce((sum, id) => sum + big(votes[id]!), 0n);
  if (V === 0n) return { eligible, list: {}, compensatory: {}, parallel: {} };
  // Seats available to eligible parties: the whole house minus district seats
  // won by ineligible parties and independents.
  const othersWon = Object.keys(districtWins).filter(id => !eligible.includes(id)).reduce((sum, id) => sum + (districtWins[id] ?? 0), 0);
  const N = big(preset.districtSeats + preset.listSeats - othersWon);
  const raw = Object.fromEntries(eligible.map(id => {
    const x = N * big(votes[id]!) - big(districtWins[id] ?? 0) * V; // (N × share − d) scaled by V
    if (x <= 0n) return [id, 0];
    const seats = Number(roundHalfUp(x * big(semi.coupling), V * 1_000_000n));
    return [id, seats < 1 ? 0 : seats];
  })) as Record<string, number>;
  const sum = Object.values(raw).reduce((a, b) => a + b, 0);
  let compensatory: Record<string, number>;
  if (sum <= semi.cap) {
    const residual = hareLargestRemainder(semi.cap - sum, eligibleVotes, tieOrder);
    compensatory = Object.fromEntries(eligible.map(id => [id, raw[id]! + residual[id]!]));
  } else compensatory = hareLargestRemainder(semi.cap, raw, tieOrder);
  const parallel = hareLargestRemainder(preset.listSeats - semi.cap, eligibleVotes, tieOrder);
  const list = Object.fromEntries(eligible.map(id => [id, (compensatory[id] ?? 0) + (parallel[id] ?? 0)]));
  return { eligible, list, compensatory, parallel };
}
// Plurality in a single-member district; equal top votes go to the candidate
// listed first in `olderFirst` (공직선거법 §188①: the older candidate).
export function districtWinner(votes: Votes, olderFirst: readonly string[]): string | null {
  const ids = Object.keys(votes).filter(id => votes[id]! > 0);
  if (!ids.length) return null;
  return ids.sort((a, b) => votes[b]! - votes[a]! || rank(olderFirst, a) - rank(olderFirst, b) || (a < b ? -1 : 1))[0]!;
}
export function totalSeats(districtWins: Votes, list: Votes): Record<string, number> {
  const ids = [...new Set([...Object.keys(districtWins), ...Object.keys(list)])].sort();
  return Object.fromEntries(ids.map(id => [id, (districtWins[id] ?? 0) + (list[id] ?? 0)]));
}
