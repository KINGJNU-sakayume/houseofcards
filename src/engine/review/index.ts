import { districtPack } from '../../data/reality/districts';
import { policyLevers } from '../../data/reality';
import type { ElectionResult, GameState } from '../../types/game';
import { PLAYER_PARTY_ID } from '../../types/party';
import { DOMAIN_IDS, type DomainId } from '../../types/simulation';
import { deriveStream, randomInt } from '../simulation/rng';
import { roundDiv, SCALE } from '../simulation/math';
import { replay } from '../simulation/engine';
import { evaluateSupport } from '../voters/model';

// E1 Election Night and Season Review (Slice §27). Pure views over the saved
// election result and the save's own history; nothing here is stored.
export const EXIT_POLL_STREAM = 'exit-poll';
export const EXIT_POLL_ERROR = 20000; // ±2pp per party, a separate error from the count (GAME_MODEL)
const total = (v: Record<string, number>) => Object.values(v).reduce((a, b) => a + b, 0);
export const listShare = (e: ElectionResult, id: string) => roundDiv((e.listVotes[id] ?? 0) * SCALE, Math.max(1, total(e.listVotes)));

// Exit poll: list-vote estimate with its own deterministic error, shown before the count.
export function exitPoll(state: GameState, e: ElectionResult): Record<string, { point: number; low: number; high: number }> {
  let rng = deriveStream(state.seed, EXIT_POLL_STREAM, e.date);
  return Object.fromEntries(Object.keys(e.listVotes).sort().map(id => {
    const r = randomInt(rng, 2 * EXIT_POLL_ERROR + 1); rng = r.state;
    const point = Math.max(0, listShare(e, id) + r.value - EXIT_POLL_ERROR);
    return [id, { point, low: Math.max(0, point - EXIT_POLL_ERROR), high: point + EXIT_POLL_ERROR }];
  }));
}
// Count order: districts are "called" from the widest margin to the narrowest.
export function marginOf(votes: Record<string, number>): number {
  const sorted = Object.values(votes).sort((a, b) => b - a);
  return roundDiv(((sorted[0] ?? 0) - (sorted[1] ?? 0)) * SCALE, Math.max(1, total(votes)));
}
export function callOrder(e: ElectionResult): string[] {
  return [...e.districts].sort((a, b) => marginOf(b.votes) - marginOf(a.votes) || (a.id < b.id ? -1 : 1)).map(r => r.id);
}

export interface ReviewCard { id: 'best_policy' | 'strongest_region' | 'best_recruitment' | 'biggest_miss' | 'voter_growth' | 'lost_opportunity'; title: string; value: string | null; detail: string }
export interface SeasonReview {
  partyName: string; listShare: number; districtSeats: number; listSeats: number; totalSeats: number;
  cards: ReviewCard[];
  regionSupport: Record<string, number>;
  cohortGrowth: { cohortId: string; from: number; to: number }[];
  ruleset: { listSeats: number; quota: number; seatsByQuota: number; remainder: number; effectiveThreshold: number };
  preview: string[];
}
const domainOf = (leverId: string) => policyLevers.find(l => l.id === leverId)!.domain;
// Player support per cohort right after founding, from the save's own first command.
export function foundingSupport(state: GameState): Record<string, number> {
  const founded = replay(state.seed, state.commandLog.slice(0, 1), state.rulesetId);
  return Object.fromEntries(evaluateSupport(founded).prepared.map(r => [r.cohort.id, r.shares[PLAYER_PARTY_ID] ?? 0]));
}
export function seasonReview(state: GameState, labels: { region: (id: string) => string; domain: (id: DomainId) => string; cohort: (id: string) => string }): SeasonReview | null {
  const e = state.election;
  if (!e || !state.playerParty) return null;
  const share = listShare(e, PLAYER_PARTY_ID);
  // Region support: cohort-weighted election-day support.
  const mass: Record<string, number> = {}, weight: Record<string, number> = {};
  for (const c of state.cohorts) { mass[c.regionId] = (mass[c.regionId] ?? 0) + c.weight * (e.cohortSupport[c.id] ?? 0); weight[c.regionId] = (weight[c.regionId] ?? 0) + c.weight; }
  const regionSupport = Object.fromEntries(Object.keys(mass).sort().map(r => [r, roundDiv(mass[r]!, Math.max(1, weight[r]!))]));
  const regions = Object.keys(regionSupport).sort((a, b) => regionSupport[b]! - regionSupport[a]! || (a < b ? -1 : 1));
  const player = state.politics.parties.find(p => p.partyId === PLAYER_PARTY_ID)!;
  const platform = state.platforms.find(p => p.partyId === PLAYER_PARTY_ID)!;
  const publishedDomains = DOMAIN_IDS.filter(d => Object.entries(platform.positions).some(([id, pos]) => pos.publishedValue !== null && domainOf(id) === d));
  const bestDomain = [...publishedDomains].sort((a, b) => player.ownership[b] - player.ownership[a] || (a < b ? -1 : 1))[0];
  const results = Object.fromEntries(e.districts.map(r => [r.id, r]));
  const nominees = Object.entries(state.nominations.districts).map(([id, n]) => {
    const r = results[id]!, valid = total(r.votes), mine = r.votes[PLAYER_PARTY_ID] ?? 0;
    const best = Math.max(...Object.entries(r.votes).filter(([p]) => p !== PLAYER_PARTY_ID).map(([, v]) => v));
    return { id, politicianId: n.politicianId, share: roundDiv(mine * SCALE, Math.max(1, valid)), gap: roundDiv((best - mine) * SCALE, Math.max(1, valid)), won: r.winner === PLAYER_PARTY_ID };
  });
  const elected = [...e.playerDistrictElected.map(id => state.nominations.districts[id]!.politicianId), ...e.playerListElected];
  const recruits = state.politicians.filter(p => p.status === 'recruited');
  const bestNominee = [...nominees].sort((a, b) => b.share - a.share || (a.id < b.id ? -1 : 1))[0];
  const person = (id: string) => state.politicians.find(p => p.id === id)!;
  const district = (id: string) => districtPack.districts.find(d => d.id === id)!;
  const bestRecruit = elected[0] ? person(elected[0]) : bestNominee ? person(bestNominee.politicianId)
    : [...recruits].sort((a, b) => b.attributes.recognition - a.attributes.recognition || (a.id < b.id ? -1 : 1))[0];
  // Biggest miss: the region with the most voters per point of missing organization.
  const miss = Object.entries(state.regionalOrganization).map(([id, r]) => ({ id, score: (weight[id] ?? 0) * (100 - r.level) })).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))[0];
  const start = foundingSupport(state);
  const cohortGrowth = state.cohorts.map(c => ({ cohortId: c.id, from: start[c.id] ?? 0, to: e.cohortSupport[c.id] ?? 0 })).sort((a, b) => (b.to - b.from) - (a.to - a.from) || (a.cohortId < b.cohortId ? -1 : 1));
  const lost = nominees.filter(n => !n.won).sort((a, b) => a.gap - b.gap || (a.id < b.id ? -1 : 1))[0];
  const pct = (q: number) => `${(q / 10000).toFixed(1)}%`;
  const cards: ReviewCard[] = [
    { id: 'best_policy', title: 'Best Policy', value: bestDomain ? labels.domain(bestDomain) : null, detail: bestDomain ? `공표한 영역 중 유권자가 우리 정당과 가장 많이 연결한 영역(이슈 소유 ${pct(player.ownership[bestDomain])}).` : '공표한 공약이 없습니다.' },
    { id: 'strongest_region', title: 'Strongest Region', value: regions[0] ? labels.region(regions[0]) : null, detail: regions[0] ? `선거일 모형 지지 ${pct(regionSupport[regions[0]]!)}.` : '' },
    { id: 'best_recruitment', title: 'Best Recruitment', value: bestRecruit?.name ?? null, detail: !bestRecruit ? '영입한 인재가 없습니다.' : elected.includes(bestRecruit.id) ? '당선되었습니다. 가상 인물입니다.'
      : bestNominee ? `${district(bestNominee.id).name}에서 ${pct(bestNominee.share)} 득표. 가상 인물입니다.` : '공천받지 않았습니다. 가상 인물입니다.' },
    { id: 'biggest_miss', title: 'Biggest Miss', value: miss ? `${labels.region(miss.id)} 조직` : null, detail: miss ? `유권자 비중에 비해 조직 수준이 가장 낮았습니다(수준 ${state.regionalOrganization[miss.id]!.level}).` : '' },
    { id: 'voter_growth', title: 'Voter Growth', value: cohortGrowth[0] ? labels.cohort(cohortGrowth[0].cohortId) : null, detail: cohortGrowth[0] ? `창당 직후 ${pct(cohortGrowth[0].from)} → 선거일 ${pct(cohortGrowth[0].to)}.` : '' },
    { id: 'lost_opportunity', title: 'Lost Opportunity', value: lost ? district(lost.id).name : null, detail: lost ? `${pct(lost.gap)}p 차이로 졌습니다.` : nominees.length ? '공천한 지역구에서 모두 이겼습니다.' : '지역구 후보를 내지 않았습니다.' },
  ];
  const listSeats = state.electionRuleset.listSeats;
  const quotaQ6 = share * listSeats; // seats × share in Q6
  const preview = e.outcome === 'in_parliament'
    ? ['국회 상임위원회 활동', '독자 법안 공동발의 협상', '원내대표 선출', '국회 Inbox']
    : ['원외 정당으로 정당 유지(현행법상 등록취소 없음)', '보궐선거', '지방선거', '조직 재건'];
  return {
    partyName: state.playerParty.name, listShare: share, districtSeats: e.districtSeats[PLAYER_PARTY_ID] ?? 0, listSeats: e.listSeats[PLAYER_PARTY_ID] ?? 0, totalSeats: e.totalSeats[PLAYER_PARTY_ID] ?? 0,
    cards, regionSupport, cohortGrowth: cohortGrowth.slice(0, 5),
    ruleset: { listSeats, quota: quotaQ6, seatsByQuota: Math.floor(quotaQ6 / SCALE), remainder: quotaQ6 % SCALE, effectiveThreshold: roundDiv(SCALE, listSeats) },
    preview,
  };
}
