import { organizationModel as org } from '../../data/seeds/organization';
import { partyManagement } from '../../data/seeds/party-management';
import { REGION_IDS } from '../../data/reality/schema';
import { REGION_LABELS } from '../../data/content/labels';
import type { Command, GameEvent, GameState } from '../../types/game';
import { INVESTMENT_KINDS, PLAYER_PARTY_ID, type InvestmentKind, type RegionOrganization, type Resources } from '../../types/party';
import { addDays, daysBetween } from '../calendar';
import { postMessage, shortage, spend } from '../parties/management';
import { fixedMultiply } from '../simulation/math';
import { recruitExpertiseTargets } from './channels';

export const INVESTMENT_LABELS: Record<InvestmentKind, string> = { member_drive: '당원모집', local_office: '지역사무소', candidate_scouting: '후보발굴', policy_forum: '정책간담회' };
export const INVESTMENT_EFFECTS: Record<InvestmentKind, string> = {
  member_drive: '완료 시 그 권역 당원과 조직 수준이 늘어납니다. 당원은 당비(자금)에만 쓰입니다.',
  local_office: `완료 시 사무소가 생겨 매주 임대료 ${org.officeRent}만원이 들고, 월 실무 인력이 ${org.officeStaff} 늘며, 조직 감쇠가 줄어듭니다.`,
  candidate_scouting: `완료 후 ${org.boostWeeks}주 동안 그 권역 출신 인재 후보가 나올 확률 가중치가 오릅니다(인원 상한은 그대로).`,
  policy_forum: `완료 후 ${org.boostWeeks}주 동안 그 권역 유권자에게 공약이 전달되는 노출이 늘어 인지도가 서서히 오릅니다.`,
};
export function newRegion(members: number, level: number, date: string): RegionOrganization {
  return { members, level, office: false, investments: [], lastActivity: date, scouting: null, forum: null };
}
export const offices = (state: GameState) => Object.values(state.regionalOrganization).filter(r => r.office).length;
export function investmentCost(kind: InvestmentKind, intensity: number): Partial<Resources> {
  const k = org.kinds[kind];
  return { money: k.money * intensity, staffCapacity: k.staffCapacity * intensity };
}
export function investmentRefusal(state: GameState, regionId: string, kind: InvestmentKind, intensity: number): string | null {
  const region = state.regionalOrganization[regionId];
  if (!region) return '권역을 찾을 수 없습니다.';
  if (!INVESTMENT_KINDS.includes(kind)) return '투자 종류를 찾을 수 없습니다.';
  if (!Number.isInteger(intensity) || intensity < 1 || intensity > org.kinds[kind].maxIntensity) return `강도는 1~${org.kinds[kind].maxIntensity} 사이여야 합니다.`;
  if (region.investments.some(i => i.kind === kind)) return `이 권역에서 ${INVESTMENT_LABELS[kind]}이(가) 이미 진행 중입니다.`;
  if (kind === 'local_office' && region.office) return '이 권역에는 이미 지역사무소가 있습니다.';
  return shortage(state, investmentCost(kind, intensity));
}
const updateRegion = (state: GameState, id: string, change: (r: RegionOrganization) => RegionOrganization): GameState =>
  ({ ...state, regionalOrganization: { ...state.regionalOrganization, [id]: change(state.regionalOrganization[id]!) } });
const event = (state: GameState, type: GameEvent['type'], detail: string): GameState =>
  ({ ...state, events: [...state.events, { id: `event-${state.events.length}`, date: state.date, type, detail }] });
export function organizationCommand(state: GameState, command: Command): { state: GameState; event: GameEvent['type']; detail: string } | null {
  if (command.type !== 'INVEST_REGION') return null;
  const reason = investmentRefusal(state, command.regionId, command.kind, command.intensity);
  if (reason) throw new Error(reason);
  let next = spend(state, investmentCost(command.kind, command.intensity), 'organization', `${command.regionId}:${command.kind}`);
  next = updateRegion(next, command.regionId, r => ({ ...r, investments: [...r.investments, { kind: command.kind, intensity: command.intensity, startedAt: state.date, completesAt: addDays(state.date, org.kinds[command.kind].weeks * 7) }]
    .sort((a, b) => a.kind < b.kind ? -1 : 1) }));
  return { state: next, event: 'INVESTMENT_STARTED', detail: `${command.regionId}:${command.kind}` };
}
// Weekly: complete due investments and clear expired boosts.
export function weeklyOrganization(state: GameState): GameState {
  if (!state.playerParty) return state;
  let next = state;
  for (const id of REGION_IDS) {
    const region = next.regionalOrganization[id]!;
    for (const investment of region.investments.filter(i => i.completesAt <= next.date)) {
      const k = org.kinds[investment.kind];
      const members = k.members * investment.intensity;
      next = updateRegion(next, id, r => ({ ...r, members: r.members + members, level: Math.min(100, r.level + k.level * investment.intensity), lastActivity: next.date,
        office: r.office || investment.kind === 'local_office',
        scouting: investment.kind === 'candidate_scouting' ? { until: addDays(next.date, org.boostWeeks * 7), intensity: investment.intensity } : r.scouting,
        forum: investment.kind === 'policy_forum' ? { until: addDays(next.date, org.boostWeeks * 7), intensity: investment.intensity } : r.forum,
        investments: r.investments.filter(i => i !== investment) }));
      if (members) next = { ...next, finance: { ...next.finance!, members: next.finance!.members + members } };
      next = postMessage(next, `${REGION_LABELS[id]} ${INVESTMENT_LABELS[investment.kind]} 완료`, `${INVESTMENT_EFFECTS[investment.kind]} 조직은 지지를 직접 더하지 않으며 후보의 지역구 인지도와 막판 총력전 유세 효율에 쓰입니다.`, 'Report', '사무총장', { route: '/organization', label: '지역조직 보기' });
      next = event(next, 'INVESTMENT_COMPLETED', `${id}:${investment.kind}`);
    }
    const r = next.regionalOrganization[id]!;
    if ((r.scouting && r.scouting.until < next.date) || (r.forum && r.forum.until < next.date))
      next = updateRegion(next, id, x => ({ ...x, scouting: x.scouting && x.scouting.until < next.date ? null : x.scouting, forum: x.forum && x.forum.until < next.date ? null : x.forum }));
  }
  return next;
}
// Monthly: levels decay slowly without upkeep (an office slows decay).
export function monthlyOrganization(state: GameState): GameState {
  if (!state.playerParty) return state;
  let next = state;
  const decayed: string[] = [];
  for (const id of REGION_IDS) {
    const r = next.regionalOrganization[id]!;
    if (r.investments.length || daysBetween(r.lastActivity, next.date) <= org.decayGraceDays || r.level === 0) continue;
    next = updateRegion(next, id, x => ({ ...x, level: Math.max(0, x.level - (x.office ? org.officeDecayPerMonth : org.decayPerMonth)) }));
    decayed.push(id);
  }
  if (!decayed.length) return next;
  next = postMessage(next, '지역조직이 약해지고 있습니다', `${decayed.map(id => REGION_LABELS[id]).join(', ')}: ${org.decayGraceDays}일 넘게 조직 활동이 없어 조직 수준이 낮아졌습니다. 지역사무소가 있으면 감쇠가 느려집니다.`, 'Important', '사무총장', { route: '/organization', label: '지역조직 보기' });
  return event(next, 'ORGANIZATION_DECAYED', decayed.join('|'));
}
// Monthly: recruits' expertise channel into the player's expertise (→ ownership → trust).
export function recruitExpertise(state: GameState): GameState {
  if (!state.playerParty) return state;
  const targets = recruitExpertiseTargets(state, partyManagement.research.expertiseCap);
  return { ...state, politics: { ...state.politics, parties: state.politics.parties.map(p => p.partyId !== PLAYER_PARTY_ID ? p : {
    ...p, expertise: Object.fromEntries(Object.entries(p.expertise).map(([d, value]) => [d, targets[d]! > value ? value + fixedMultiply(targets[d]! - value, org.recruitExpertiseRate) : value])) as typeof p.expertise,
  }) } };
}
