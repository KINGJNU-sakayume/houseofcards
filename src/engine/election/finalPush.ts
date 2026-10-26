import { electionModel as em } from '../../data/seeds/election';
import { addDays } from '../calendar';
import { policyLevers } from '../../data/reality';
import type { Command, FinalPush, GameEvent, GameState } from '../../types/game';
import type { Resources } from '../../types/party';
import { DOMAIN_IDS, DOMAIN_LABELS, type DomainId } from '../../types/simulation';
import { PLAYER_PARTY_ID } from '../../types/party';
import { postMessage, shortage, spend } from '../parties/management';
import { fixedMultiply, SCALE } from '../simulation/math';

// D4 Final Push (Slice §26): one national and up to two secondary messages, a
// leadership focus district and per-candidate campaign intensity, allocated
// weekly from 2028-01-17. Messages act only through the player's exposure
// (awareness); campaign effort acts only through the nominee's district terms.
const fp = () => em.finalPush;
export const emptyFinalPush = (): FinalPush => ({ nationalMessage: null, secondaryMessages: [], leaderFocus: null, campaign: {}, effort: {}, spent: {} });
export const finalPushOpen = (state: GameState) => state.date >= fp().start && !state.election;
const gate = (state: GameState) => state.election ? '선거가 끝났습니다.' : state.date < fp().start ? `막판 총력전은 ${fp().start}부터입니다.` : null;
const published = (state: GameState, domain: DomainId) => {
  const platform = state.platforms.find(p => p.partyId === PLAYER_PARTY_ID)!;
  return policyLevers.some(l => l.domain === domain && platform.positions[l.id]!.publishedValue !== null);
};

export function campaignRefusal(state: GameState, districtId: string, intensity: number): string | null {
  const g = gate(state); if (g) return g;
  if (!state.nominations.districts[districtId]) return '우리 후보를 공천한 지역구에만 유세 자원을 배분할 수 있습니다.';
  if (!Number.isInteger(intensity) || intensity < 0 || intensity > fp().maxIntensity) return `유세 강도는 0~${fp().maxIntensity}입니다.`;
  return null;
}
export function messagesRefusal(state: GameState, national: DomainId | null, secondary: readonly DomainId[]): string | null {
  const g = gate(state); if (g) return g;
  const all = [...(national ? [national] : []), ...secondary];
  if (!Array.isArray(secondary) || secondary.length > fp().maxSecondaryMessages) return `보조 메시지는 최대 ${fp().maxSecondaryMessages}개입니다.`;
  if (all.some(d => !DOMAIN_IDS.includes(d)) || new Set(all).size !== all.length) return '메시지 영역은 서로 달라야 합니다.';
  const missing = all.find(d => !published(state, d));
  if (missing) return `${DOMAIN_LABELS[missing]} 영역에 공표한 공약이 없어 메시지로 쓸 수 없습니다.`;
  return shortage(state, { agendaSlots: fp().messageAgendaSlots });
}
export function leaderRefusal(state: GameState, districtId: string | null): string | null {
  const g = gate(state); if (g) return g;
  return districtId === null || state.nominations.districts[districtId] ? null : '지도부 집중 지역은 우리 후보가 있는 지역구여야 합니다.';
}
// Weekly cost of the current allocation.
export function weeklyCost(state: GameState): Partial<Resources> {
  const c = fp();
  const total = Object.entries(state.finalPush.campaign).filter(([id]) => state.nominations.districts[id]).reduce((s, [, i]) => s + i, 0);
  return { money: total * c.weeklyMoneyPerIntensity, staffCapacity: total * c.weeklyStaffPerIntensity + (state.finalPush.leaderFocus ? c.leaderStaff : 0) };
}
// Player exposure added by Final Push messages for a cohort (Q6), read by the monthly perception update.
export function messageExposure(state: GameState, salience: Record<DomainId, number>): number {
  const f = state.finalPush, c = fp();
  let exposure = f.nationalMessage ? fixedMultiply(c.nationalExposure, salience[f.nationalMessage] * 100) : 0;
  for (const d of f.secondaryMessages) exposure += fixedMultiply(c.secondaryExposure, salience[d] * 100);
  return exposure;
}
const setPush = (state: GameState, change: (f: FinalPush) => FinalPush): GameState => ({ ...state, finalPush: change(state.finalPush) });
const sortKeys = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).sort(([a], [b]) => a < b ? -1 : 1));
// Withdrawn nominations take their allocation with them.
export function clearDistrict(state: GameState, districtId: string): GameState {
  const drop = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).filter(([id]) => id !== districtId));
  return setPush(state, f => ({ ...f, campaign: drop(f.campaign), effort: drop(f.effort), spent: drop(f.spent), leaderFocus: f.leaderFocus === districtId ? null : f.leaderFocus }));
}

export function finalPushCommand(state: GameState, command: Command): { state: GameState; event: GameEvent['type']; detail: string } | null {
  if (command.type === 'SET_CAMPAIGN') {
    const reason = campaignRefusal(state, command.districtId, command.intensity);
    if (reason) throw new Error(reason);
    const campaign = { ...state.finalPush.campaign };
    if (command.intensity) campaign[command.districtId] = command.intensity; else delete campaign[command.districtId];
    return { state: setPush(state, f => ({ ...f, campaign: sortKeys(campaign) })), event: 'CAMPAIGN_SET', detail: `${command.districtId}:${command.intensity}` };
  }
  if (command.type === 'SET_MESSAGES') {
    const reason = messagesRefusal(state, command.national, command.secondary);
    if (reason) throw new Error(reason);
    const next = spend(state, { agendaSlots: fp().messageAgendaSlots }, 'campaign', 'messages');
    return { state: setPush(next, f => ({ ...f, nationalMessage: command.national, secondaryMessages: [...command.secondary] })), event: 'MESSAGES_SET', detail: [command.national ?? '-', ...command.secondary].join('|') };
  }
  if (command.type === 'SET_LEADER_FOCUS') {
    const reason = leaderRefusal(state, command.districtId);
    if (reason) throw new Error(reason);
    return { state: setPush(state, f => ({ ...f, leaderFocus: command.districtId })), event: 'LEADER_FOCUS_SET', detail: command.districtId ?? '-' };
  }
  return null;
}

// Weekly: the week that just ended was inside the Final Push, so its allocation is paid and worked.
export function weeklyFinalPush(state: GameState): GameState {
  if (!state.playerParty || state.date <= fp().start || state.election) return state;
  const c = fp(), f = state.finalPush;
  let next = state;
  if (state.date === addDays(fp().start, 7)) next = postMessage(next, '막판 총력전 첫 주', '전국 메시지, 지도부 집중 지역, 후보별 유세 강도를 매주 배분합니다. 법정 공식 선거운동 기간(13일)과는 다른 게임 개념입니다.', 'Report', '사무총장', { route: '/election', label: '막판 총력전 배분' });
  const cost = weeklyCost(state);
  if (!cost.money && !cost.staffCapacity) return next;
  const reason = shortage(next, cost);
  if (reason) return postMessage(next, '이번 주 유세를 하지 못했습니다', `${reason}. 배분은 유지되며 다음 주에 다시 시도합니다.`, 'Important', '사무총장', { route: '/election', label: '유세 배분 확인' });
  next = spend(next, cost, 'campaign', `week:${state.date}`);
  const effort = { ...f.effort }, spent = { ...f.spent };
  for (const [id, n] of Object.entries(state.nominations.districts).sort(([a], [b]) => a < b ? -1 : 1)) {
    const intensity = (f.campaign[id] ?? 0) + (f.leaderFocus === id ? c.leaderIntensity : 0);
    if (!intensity) continue;
    const organization = state.politicians.find(p => p.id === n.politicianId)!.attributes.organization;
    const rate = c.organizationBase + organization * c.organizationPerPoint;
    effort[id] = Math.min(SCALE, (effort[id] ?? 0) + fixedMultiply(intensity * c.effortPerIntensityWeek, rate));
    if (f.campaign[id]) spent[id] = (spent[id] ?? 0) + f.campaign[id]! * c.weeklyMoneyPerIntensity;
  }
  return setPush(next, x => ({ ...x, effort: sortKeys(effort), spent: sortKeys(spent) }));
}
// Concave use of effort: e(2 − e) in Q6.
export const campaignStrength = (effort: number) => fixedMultiply(effort, 2 * SCALE - effort);
