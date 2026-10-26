import { electionModel as em } from '../../data/seeds/election';
import { districtPack } from '../../data/reality/districts';
import type { DistrictResult, ElectionResult, GameState } from '../../types/game';
import { PLAYER_PARTY_ID } from '../../types/party';
import { NONE_ID, type SupportVector } from '../../types/politics';
import { postMessage, recordMoney } from '../parties/management';
import { deriveStream, randomInt } from '../simulation/rng';
import { fixedMultiply, roundDiv, SCALE } from '../simulation/math';
import { allocateList, districtWinner, hareLargestRemainder, totalSeats } from './allocation';
import { districtInputs, nominationsDecide, projectDistricts, regionBaselines, sincereShares } from './districts';
import { districtDeposit, listDeposit } from './nominations';

// D4 election (Slice §27), computed once on the last weekly tick for the
// scheduled election date. Pure: the same state always gives the same result.
// Election-day variation comes only from the named stream 'election'.
export const ELECTION_STREAM = 'election';

interface Draws { national: SupportVector; district: Record<string, SupportVector>; lottery: string[] }
function electionDraws(state: GameState, partyIds: readonly string[]): Draws {
  let rng = deriveStream(state.seed, ELECTION_STREAM, state.electionRuleset.electionDate);
  const draw = (bound: number) => { const r = randomInt(rng, 2 * bound + 1); rng = r.state; return r.value - bound; };
  const national = Object.fromEntries(partyIds.map(id => [id, draw(em.electionDay.nationalSwing)]));
  const district = Object.fromEntries(districtPack.districts.map(d => [d.id, Object.fromEntries(partyIds.map(id => [id, draw(em.electionDay.districtSwing)]))]));
  // Lottery order for equal list remainders (currentLaw.listRemainderTieBreak).
  const lottery = partyIds.map(id => ({ id, key: draw(SCALE) })).sort((a, b) => a.key - b.key || (a.id < b.id ? -1 : 1)).map(x => x.id);
  return { national, district, lottery };
}
const add = (a: SupportVector, b: SupportVector) => Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].sort().map(id => [id, (a[id] ?? 0) + (b[id] ?? 0)]));
// Integer votes from Q6 shares for a district's voters (2024 turnout as the electorate size, GAME ASSUMPTION).
const votesOf = (shares: SupportVector, voters: number) => hareLargestRemainder(voters, Object.fromEntries(Object.entries(shares).filter(([id]) => id !== NONE_ID)));

export function computeElection(state: GameState): ElectionResult {
  const ruleset = state.electionRuleset, law = ruleset.currentLaw;
  if (ruleset.partyRevocation !== null) throw new Error('v1.0 presets keep partyRevocation null (user decision 2026-10-26).');
  const inputs = districtInputs(state);
  const draws = electionDraws(state, inputs.ids);
  const swing = (id: string) => add(draws.national, draws.district[id]!);
  const projections = projectDistricts(state, districtPack.districts, swing);
  const nominees = state.nominations.districts;
  const districts: DistrictResult[] = districtPack.districts.map((d, i) => {
    const votes = votesOf(projections[i]!.final, d.turnout2024);
    // Ties would go to the older candidate (§188①), but AI candidates are party-level records without an age, so exact ties fall back to party id order (GAME ASSUMPTION).
    const order = Object.keys(votes).sort();
    return { id: d.id, votes, winner: districtWinner(votes, order) ?? order[0]!, playerCandidate: nominees[d.id]?.politicianId ?? null };
  });
  // List ballot: everywhere, no tactical voting; the player is on it only with a registered list.
  const playerList = state.nominations.list.length > 0;
  const listIds = playerList ? inputs.ids : inputs.others;
  const listCohorts = playerList || !nominationsDecide(state) ? inputs.all : inputs.without();
  const baselines = regionBaselines(districtPack.districts, 'listShare');
  const listVotes: Record<string, number> = Object.fromEntries(listIds.map(id => [id, 0]));
  for (const d of districtPack.districts) {
    const { sincere } = sincereShares(d, listCohorts, listIds, baselines, 'listShare', swing(d.id));
    for (const [id, v] of Object.entries(votesOf(sincere, d.turnout2024))) listVotes[id] = (listVotes[id] ?? 0) + v;
  }
  const districtSeats: Record<string, number> = Object.fromEntries(inputs.ids.map(id => [id, 0]));
  for (const r of districts) districtSeats[r.winner] = (districtSeats[r.winner] ?? 0) + 1;
  const allocation = allocateList(ruleset, listVotes, districtSeats, draws.lottery);
  const listSeats = Object.fromEntries(inputs.ids.map(id => [id, allocation.list[id] ?? 0]));
  const seats = totalSeats(districtSeats, listSeats);
  const won = listSeats[PLAYER_PARTY_ID] ?? 0;
  // Deposits and reimbursement (공직선거법 §57①, §122의2①): district by the candidate's vote share, list if any list candidate is elected.
  let refunded = 0, reimbursement = 0;
  for (const r of districts) {
    if (!r.playerCandidate) continue;
    const valid = Object.values(r.votes).reduce((a, b) => a + b, 0);
    const share = roundDiv((r.votes[PLAYER_PARTY_ID] ?? 0) * SCALE, Math.max(1, valid));
    const part = share >= law.deposit.refundFullAbove ? SCALE : share >= law.deposit.refundHalfAbove ? SCALE / 2 : 0;
    refunded += fixedMultiply(districtDeposit(state), part);
    const costPart = share >= law.campaignCostReimbursement.fullAbove ? SCALE : share >= law.campaignCostReimbursement.halfAbove ? SCALE / 2 : 0;
    reimbursement += fixedMultiply(state.finalPush.spent[r.id] ?? 0, costPart);
  }
  if (law.deposit.listRefundIfAnyElected && won > 0) refunded += state.nominations.list.length * listDeposit(state);
  const paid = Object.keys(nominees).length * districtDeposit(state) + state.nominations.list.length * listDeposit(state);
  const cohortSupport = Object.fromEntries(inputs.prepared.map(r => [r.cohort.id, r.shares[PLAYER_PARTY_ID] ?? 0]));
  const result: ElectionResult = {
    date: ruleset.electionDate, rulesetId: ruleset.rulesetId, nationalSwing: draws.national, districts,
    listVotes, eligible: allocation.eligible, listSeats, districtSeats, totalSeats: Object.fromEntries(Object.entries(seats).sort()),
    playerListElected: state.nominations.list.slice(0, won), playerDistrictElected: districts.filter(r => r.winner === PLAYER_PARTY_ID).map(r => r.id),
    cohortSupport, deposits: { paid, refunded }, reimbursement,
    outcome: (seats[PLAYER_PARTY_ID] ?? 0) > 0 ? 'in_parliament' : 'extra_parliamentary',
  };
  return result;
}

// Applies the result: refunds and reimbursement are booked and the result is saved.
export function holdElection(state: GameState): GameState {
  if (!state.playerParty || state.election) return state;
  const result = computeElection(state);
  let next: GameState = { ...state, election: result };
  if (result.deposits.refunded) next = recordMoney(next, 'deposit', result.deposits.refunded, 'election:refund');
  if (result.reimbursement) next = recordMoney(next, 'reimbursement', result.reimbursement, 'election:reimbursement');
  const seats = result.totalSeats[PLAYER_PARTY_ID] ?? 0;
  const listTotal = Object.values(result.listVotes).reduce((a, b) => a + b, 0);
  const share = roundDiv((result.listVotes[PLAYER_PARTY_ID] ?? 0) * 1000, Math.max(1, listTotal)) / 10;
  next = postMessage(next, `${result.date} 총선 결과: ${seats}석`, `SAVE SIMULATION · 정당득표 ${share}%, 지역구 ${result.districtSeats[PLAYER_PARTY_ID] ?? 0}석, 비례 ${result.listSeats[PLAYER_PARTY_ID] ?? 0}석. ${result.outcome === 'in_parliament' ? '원내에 진입했습니다.' : '의석은 없지만 현행법상 등록취소 없이 원외 정당으로 존속합니다(정당법 §44①3 위헌 결정, 대체 조항 없음).'} 실제 선거 결과나 예측이 아닙니다.`, 'Critical', '선거대책위원장');
  return { ...next, events: [...next.events, { id: `event-${next.events.length}`, date: next.date, type: 'ELECTION_HELD', detail: `${seats}` }] };
}
