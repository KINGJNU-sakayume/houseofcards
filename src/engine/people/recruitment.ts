import { politicianModel } from '../../data/seeds/politicians';
import { policyLevers } from '../../data/reality';
import type { Command, GameEvent, GameState } from '../../types/game';
import { PLAYER_PARTY_ID } from '../../types/party';
import { PROMISE_TYPES, ROLE_IDS, type PartyPromise, type Politician, type PromiseType, type RoleId } from '../../types/people';
import { DOMAIN_IDS, type CoreValue } from '../../types/simulation';
import { addDays, daysBetween } from '../calendar';
import { postMessage, shortage, spend } from '../parties/management';
import { deriveStream, randomInt, streamKey } from '../simulation/rng';
import { fixedMultiply, roundDiv, SCALE } from '../simulation/math';
import { platformIdentity } from '../voters/model';

const config = () => politicianModel.recruitment;
export const RECRUITMENT_STREAM = 'recruitment';
export const ROLE_LABELS: Record<RoleId, string> = { member: '일반 당원', policy_chair: '정책위원장', secretary_general: '사무총장' };
export const PROMISE_LABELS: Record<PromiseType, string> = { primary_guarantee: '총선 경선 보장', policy_chair: '정책위원장 임명', regional_priority: '지역 우선공천' };
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const event = (state: GameState, type: GameEvent['type'], detail: string): GameState =>
  ({ ...state, events: [...state.events, { id: `event-${state.events.length}`, date: state.date, type, detail }] });
const updatePerson = (state: GameState, id: string, change: (p: Politician) => Politician): GameState =>
  ({ ...state, politicians: state.politicians.map(p => p.id === id ? change(p) : p) });

// Value and policy match in Q6: the person's leanings against the identity the
// party currently signals (declared values + published platform), and their
// domain interests against the share of each domain the party has published.
export function recruitmentMatch(state: GameState, person: Politician): number {
  const platform = state.platforms.find(p => p.partyId === PLAYER_PARTY_ID)!;
  const identity = platformIdentity(platform, state.playerParty!.values);
  const leans = Object.entries(person.valueLean) as [CoreValue, number][];
  const valueMatch = leans.length ? roundDiv(leans.reduce((sum, [value, lean]) => sum + SCALE - Math.abs(identity[value] - lean), 0), leans.length) : SCALE / 2;
  let interest = 0, covered = 0;
  for (const domain of DOMAIN_IDS) {
    const levers = policyLevers.filter(l => l.domain === domain);
    const coverage = roundDiv(levers.filter(l => platform.positions[l.id]!.publishedValue !== null).length * SCALE, levers.length);
    interest += person.domainInterest[domain]; covered += person.domainInterest[domain] * coverage;
  }
  const domainMatch = interest ? roundDiv(covered, interest) : 0;
  return roundDiv(valueMatch + domainMatch, 2);
}
// Public momentum only: latest public poll that includes the party, plus the
// party's own mean awareness (its own state, not a rival's hidden state).
export function partyMomentum(state: GameState): number {
  const poll = [...state.politics.polls].reverse().find(p => p.national.results[PLAYER_PARTY_ID]);
  const result = poll?.national.results[PLAYER_PARTY_ID];
  const pollTerm = result ? Math.min(SCALE, roundDiv(result.low + result.high, 2) * 10) : 0;
  const awareness = roundDiv(state.cohorts.reduce((sum, c) => sum + c.weight * state.politics.perceptions[c.id]![PLAYER_PARTY_ID]!.awareness, 0), SCALE);
  return roundDiv(pollTerm + awareness, 2);
}
export interface RecruitmentInputs { match: number; momentum: number; role: RoleId; promises: readonly PromiseType[]; trust: number; reputation: number }
// Deterministic Q6 probability; monotone non-decreasing in match, momentum,
// trust, reputation and promises offered. Negotiation is not used (Phase D).
export function recruitmentProbability(input: RecruitmentInputs): number {
  const c = config();
  const p = c.base + fixedMultiply(input.match, c.matchWeight) + fixedMultiply(input.momentum, c.momentumWeight) + c.roleAppeal[input.role] +
    input.promises.reduce((sum, type) => sum + c.promiseWeight[type], 0) +
    roundDiv((input.trust - 50) * c.trustWeight, 50) + roundDiv((input.reputation - 50) * c.reputationWeight, 50);
  return clamp(p, c.minProbability, c.maxProbability);
}
export function recruitmentInputs(state: GameState, person: Politician, role: RoleId, promises: readonly PromiseType[]): RecruitmentInputs {
  return { match: recruitmentMatch(state, person), momentum: partyMomentum(state), role, promises, trust: person.trust, reputation: state.recruitmentReputation! };
}
export type RecruitmentBand = '낮음' | '보통' | '높음';
// The UI only ever sees this qualitative band, never the probability.
export function recruitmentBand(state: GameState, personId: string, role: RoleId, promises: readonly PromiseType[]): RecruitmentBand {
  const person = state.politicians.find(p => p.id === personId)!;
  const p = recruitmentProbability(recruitmentInputs(state, person, role, promises));
  return p < config().bandLow ? '낮음' : p < config().bandHigh ? '보통' : '높음';
}
export const recruitmentCost = () => ({ money: config().money, staffCapacity: config().staffCapacity });
export function roleHolder(state: GameState, role: RoleId): Politician | undefined {
  return role === 'member' ? undefined : state.politicians.find(p => p.status === 'recruited' && p.role === role);
}
// Returns a Korean reason when the attempt is not allowed, or null.
export function recruitmentRefusal(state: GameState, personId: string, role: RoleId, promises: readonly PromiseType[]): string | null {
  const person = state.politicians.find(p => p.id === personId);
  if (!person) return '인재를 찾을 수 없습니다.';
  if (person.status === 'recruited') return '이미 영입한 인재입니다.';
  if (person.status === 'declined') return `영입을 거절한 뒤 재접촉 대기 중입니다 (${person.cooldownUntil}부터).`;
  if (person.status !== 'prospect') return '더 이상 영입할 수 없는 인재입니다.';
  if (!ROLE_IDS.includes(role)) return '유효한 역할을 선택하세요.';
  if (!Array.isArray(promises) || promises.some(t => !PROMISE_TYPES.includes(t)) || new Set(promises).size !== promises.length) return '약속은 종류별로 한 번만 선택할 수 있습니다.';
  const holder = roleHolder(state, role);
  if (holder) return `${ROLE_LABELS[role]} 자리는 ${holder.name}이(가) 맡고 있습니다.`;
  if (promises.includes('policy_chair') && state.promises.some(p => p.type === 'policy_chair' && p.status === 'pending')) return '이미 다른 인재에게 정책위원장 임명을 약속했습니다.';
  return shortage(state, recruitmentCost());
}
function newPromise(state: GameState, personId: string, type: PromiseType, kept: boolean): PartyPromise {
  return { id: `promise-${String(state.promises.length + 1).padStart(3, '0')}`, politicianId: personId, type, madeAt: state.date,
    due: type === 'policy_chair' ? addDays(state.date, config().promiseWindowWeeks * 7) : 'NOMINATION', status: kept ? 'kept' : 'pending', resolvedAt: kept ? state.date : null };
}
export function breakPromise(state: GameState, promise: PartyPromise, reason: string): GameState {
  const c = config();
  let next: GameState = { ...state, promises: state.promises.map(p => p.id === promise.id ? { ...p, status: 'broken' as const, resolvedAt: state.date } : p),
    recruitmentReputation: Math.max(c.reputationFloor, state.recruitmentReputation! - c.brokenReputation) };
  const person = next.politicians.find(p => p.id === promise.politicianId)!;
  next = updatePerson(next, person.id, p => ({ ...p, trust: Math.max(0, p.trust - c.brokenTrust) }));
  next = postMessage(next, `${person.name}에게 한 약속을 지키지 못했습니다`, `${PROMISE_LABELS[promise.type]} 약속이 ${reason}. 개인 신뢰와 당의 영입 평판이 떨어졌으며 평판은 매월 조금씩 회복합니다.`, 'Important', '영입 책임자', { route: `/politicians?id=${person.id}`, label: '인재 보기' });
  return event(next, 'PROMISE_BROKEN', promise.id);
}
export function keepPromise(state: GameState, promise: PartyPromise): GameState {
  const next: GameState = { ...state, promises: state.promises.map(p => p.id === promise.id ? { ...p, status: 'kept' as const, resolvedAt: state.date } : p) };
  return event(next, 'PROMISE_KEPT', promise.id);
}
// A pending policy_chair promise is kept once the person holds the role.
function settleAppointments(state: GameState): GameState {
  let next = state;
  for (const promise of state.promises) {
    if (promise.type !== 'policy_chair' || promise.status !== 'pending') continue;
    if (next.politicians.find(p => p.id === promise.politicianId)!.role === 'policy_chair') next = keepPromise(next, promise);
  }
  return next;
}
export function weeklyPromises(state: GameState): GameState {
  if (!state.playerParty) return state;
  let next = settleAppointments(state);
  for (const promise of next.promises) {
    if (promise.type !== 'policy_chair' || promise.status !== 'pending' || promise.due === 'NOMINATION') continue;
    const person = next.politicians.find(p => p.id === promise.politicianId)!;
    if (promise.due < next.date) next = breakPromise(next, promise, '기한 안에 이행되지 않았습니다');
    else if (daysBetween(next.date, promise.due) === config().warningDays) next = postMessage(next, '정책위원장 임명 약속 기한이 다가옵니다', `${person.name}에게 약속한 정책위원장 임명 기한은 ${promise.due}입니다. 기한이 지나면 약속은 깨진 것으로 기록됩니다.`, 'Action Required', '영입 책임자', { route: `/politicians?id=${person.id}`, label: '인재 보기' });
  }
  return next;
}
export function monthlyReputation(state: GameState): GameState {
  if (state.recruitmentReputation === null) return state;
  const c = config();
  return state.recruitmentReputation >= c.reputationStart ? state : { ...state, recruitmentReputation: Math.min(c.reputationStart, state.recruitmentReputation + c.reputationRecovery) };
}
export function recruitmentCommand(state: GameState, command: Command): { state: GameState; event: GameEvent['type']; detail: string } | null {
  if (command.type === 'RECRUIT_POLITICIAN') {
    const reason = recruitmentRefusal(state, command.politicianId, command.role, command.promises);
    if (reason) throw new Error(reason);
    const c = config(), person = state.politicians.find(p => p.id === command.politicianId)!;
    const probability = recruitmentProbability(recruitmentInputs(state, person, command.role, command.promises));
    let next = spend(state, recruitmentCost(), 'recruitment', person.id);
    const key = streamKey(RECRUITMENT_STREAM, state.date);
    const draw = randomInt(state.rngState[key] ?? deriveStream(state.seed, RECRUITMENT_STREAM, state.date), SCALE);
    next = { ...next, rngState: { ...next.rngState, [key]: draw.state } };
    if (draw.value >= probability) {
      next = updatePerson(next, person.id, p => ({ ...p, status: 'declined', cooldownUntil: addDays(state.date, c.cooldownWeeks * 7), trust: Math.max(0, p.trust - c.refusalTrust) }));
      next = postMessage(next, `${person.name}이(가) 영입 제안을 거절했습니다`, `${c.cooldownWeeks}주 뒤 다시 접촉할 수 있습니다. 공표한 공약과 가치, 당의 성장세, 역할과 약속이 영입 판단에 반영됩니다. 가상 인물입니다.`, 'Report', '영입 책임자', { route: `/politicians?id=${person.id}`, label: '인재 보기' });
      return { state: next, event: 'RECRUITMENT_DECLINED', detail: person.id };
    }
    next = updatePerson(next, person.id, p => ({ ...p, status: 'recruited', role: command.role, recruitedAt: state.date, cooldownUntil: null, trust: Math.min(100, p.trust + c.acceptTrust) }));
    for (const type of [...command.promises].sort()) next = { ...next, promises: [...next.promises, newPromise(next, person.id, type, type === 'policy_chair' && command.role === 'policy_chair')] };
    next = postMessage(next, `${person.name} 영입에 성공했습니다`, `역할: ${ROLE_LABELS[command.role]}.${command.promises.length ? ` 약속: ${command.promises.map(t => PROMISE_LABELS[t]).join(', ')}. 공천 관련 약속은 후보 등록 마감에 이행 여부가 결정됩니다.` : ''} 가상 인물입니다.`, 'Important', '영입 책임자', { route: `/politicians?id=${person.id}`, label: '인재 보기' });
    return { state: settleAppointments(next), event: 'RECRUITMENT_ACCEPTED', detail: person.id };
  }
  if (command.type === 'ASSIGN_ROLE') {
    const person = state.politicians.find(p => p.id === command.politicianId);
    if (!person || person.status !== 'recruited') throw new Error('영입한 인재에게만 역할을 줄 수 있습니다.');
    if (!ROLE_IDS.includes(command.role)) throw new Error('유효한 역할을 선택하세요.');
    if (person.role === command.role) return { state, event: 'ROLE_ASSIGNED', detail: person.id };
    const holder = roleHolder(state, command.role);
    if (holder) throw new Error(`${ROLE_LABELS[command.role]} 자리는 ${holder.name}이(가) 맡고 있습니다. 먼저 역할을 바꾸세요.`);
    let next = updatePerson(state, person.id, p => ({ ...p, role: command.role }));
    // Removing a role that was promised breaks that promise.
    for (const promise of state.promises) if (promise.politicianId === person.id && promise.type === 'policy_chair' && promise.status === 'kept' && person.role === 'policy_chair')
      next = breakPromise(next, promise, '정책위원장 해임으로 깨졌습니다');
    next = postMessage(settleAppointments(next), `${person.name}의 역할이 바뀌었습니다`, `${ROLE_LABELS[person.role ?? 'member']} → ${ROLE_LABELS[command.role]}.`, 'Report', '사무총장', { route: `/politicians?id=${person.id}`, label: '인재 보기' });
    return { state: next, event: 'ROLE_ASSIGNED', detail: person.id };
  }
  return null;
}
