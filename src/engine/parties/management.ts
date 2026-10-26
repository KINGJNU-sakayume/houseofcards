import { voteFlow } from '../voters/voteFlow';
import { partyManagement as data } from '../../data/seeds/party-management';
import { politicalModel } from '../../data/seeds/political-model';
import { policyLevers, realityPack } from '../../data/reality';
import { REGION_IDS } from '../../data/reality/schema';
import type { Command, GameState, InboxMessage } from '../../types/game';
import { CORE_VALUES, DOMAIN_IDS, DOMAIN_LABELS, type DomainId } from '../../types/simulation';
import { PLAYER_PARTY_ID, type Finance, type Resources } from '../../types/party';
import { forbiddenNamesIn } from '../../validation/forbidden-names';
import { createPlatform, publishPlatform, isPublicationReversal } from '../policy';
import { deriveStream, randomInt, streamKey } from '../simulation/rng';
import { fixedMultiply, roundDiv, SCALE } from '../simulation/math';
import { computeAnalysis, platformIdentity } from '../voters/model';
import { quarterKey } from '../voters/dynamics';
import { normalizeMasses } from '../voters/cohorts';
import { addDays, isMonthlyTick } from '../calendar';
import { generatePoliticians } from '../people/generator';
import { politicianModel } from '../../data/seeds/politicians';
import { organizationModel } from '../../data/seeds/organization';

export const normalizePartyName = (name: string) => name.normalize('NFKC').trim().toLowerCase();
export function validatePartyName(name: string, min: number, max: number): string {
  if (typeof name !== 'string' || /\p{Cc}|\p{Cf}/u.test(name)) throw new Error('정당 이름에는 제어 문자를 사용할 수 없습니다.');
  const normalized = name.normalize('NFKC').trim();
  if ([...normalized].length < min || [...normalized].length > max) throw new Error(`정당 이름은 ${min}~${max}자여야 합니다.`);
  const names = [...realityPack.parties.flatMap(p => [p.name.value, p.shortName.value]), 'minor-bloc', '기타 세력 묶음'];
  if (names.some(n => normalizePartyName(n) === normalizePartyName(normalized))) throw new Error('기존 정당 이름·약칭과 같은 이름은 사용할 수 없습니다.');
  if (forbiddenNamesIn(normalized).length) throw new Error('실제 조사기관·방송 이름은 사용할 수 없습니다.');
  return normalized;
}
export function postMessage(state: GameState, title: string, body: string, priority: InboxMessage['priority'] = 'Report', sender = '사무총장'): GameState {
  const id = `message-${state.date}-${state.commandLog.length}-${state.inbox.length}-${title}`;
  return { ...state, inbox: [{ id, date: state.date, sender, title, body, priority, read: false }, ...state.inbox].slice(0, 60) };
}
export function recordMoney(state: GameState, kind: Finance['ledger'][number]['kind'], amount: number, ref: string): GameState {
  const resources = { ...state.resources!, money: state.resources!.money + amount };
  if (!Number.isSafeInteger(resources.money) || resources.money < 0) throw new Error('Money 잔액이 올바르지 않습니다.');
  const ledger = [...state.finance!.ledger, { date: state.date, kind, amount, balanceAfter: resources.money, ref }];
  const dropped = ledger.splice(0, Math.max(0, ledger.length - 100));
  return { ...state, resources, finance: { ...state.finance!, ledger,
    ledgerTruncatedSum: state.finance!.ledgerTruncatedSum + dropped.reduce((s, e) => s + e.amount, 0) } };
}
export function shortage(state: GameState, cost: Partial<Resources>): string | null {
  if (!state.resources) return '먼저 정당을 창당하세요.';
  for (const [key, label] of [['money', 'Money'], ['staffCapacity', 'Staff Capacity'], ['agendaSlots', 'Agenda Slots']] as const) {
    const needed = cost[key] ?? 0;
    if (state.resources[key] < needed) return `${label}가 부족합니다 (필요 ${needed}, 보유 ${state.resources[key]})`;
  }
  return null;
}
export function spend(state: GameState, cost: Partial<Resources>, kind: Finance['ledger'][number]['kind'], ref: string): GameState {
  const reason = shortage(state, cost);
  if (reason) throw new Error(reason);
  let next = cost.money ? recordMoney(state, kind, -cost.money, ref) : state;
  next = { ...next, resources: { ...next.resources!, staffCapacity: next.resources!.staffCapacity - (cost.staffCapacity ?? 0), agendaSlots: next.resources!.agendaSlots - (cost.agendaSlots ?? 0) } };
  return next;
}
export function foundParty(state: GameState, command: Extract<Command, { type: 'CREATE_PARTY' }>): GameState {
  if (state.playerParty || state.status !== 'founding') throw new Error('창당은 한 번만 할 수 있습니다.');
  const name = validatePartyName(command.name, 2, 20), shortName = validatePartyName(command.shortName, 1, 6);
  if (!Array.isArray(command.values) || command.values.length !== 3 || new Set(command.values).size !== 3 || command.values.some(v => !CORE_VALUES.includes(v))) throw new Error('서로 다른 핵심가치 정확히 3개를 선택하세요.');
  if (!data.palette.includes(command.color)) throw new Error('제공된 정당 색상 중 하나를 선택하세요.');
  const key = streamKey('party-founding', state.date);
  let rng = deriveStream(state.seed, 'party-founding', state.date);
  const draw = (max: number) => { const r = randomInt(rng, max); rng = r.state; return r.value; };
  const members = data.newParty.membersMin + draw(data.newParty.membersMax - data.newParty.membersMin + 1);
  const regionMass = normalizeMasses(REGION_IDS.map(id => ({ id, mass: state.cohorts.filter(c => c.regionId === id).reduce((s, c) => s + c.weight, 0) })), members);
  const regionalOrganization = Object.fromEntries(REGION_IDS.map(id => [id, { members: regionMass[id]!, level: data.newParty.regionalLevelMin + draw(data.newParty.regionalLevelMax - data.newParty.regionalLevelMin + 1), office: false, investments: [], lastActivity: state.date, scouting: null, forum: null }]));
  const platform = createPlatform(PLAYER_PARTY_ID, policyLevers);
  const party = { partyId: PLAYER_PARTY_ID, declaredValues: [...command.values], identity: platformIdentity(platform, command.values),
    expertise: { ...data.newParty.expertise }, ownership: Object.fromEntries(DOMAIN_IDS.map(d => [d, data.newParty.ownership])) as typeof data.newParty.expertise,
    prior: Object.fromEntries(policyLevers.map(l => [l.id, 2])), ai: { month: state.date.slice(0, 7), quarter: quarterKey(state.date), changesThisMonth: 0, changesThisQuarter: 0 } };
  const perceptions = Object.fromEntries(state.cohorts.map(c => [c.id, { ...state.politics.perceptions[c.id], [PLAYER_PARTY_ID]: {
    awareness: fixedMultiply(data.newParty.awareness, c.politicalAttention * 100) + draw(10001), loyalty: 0,
  } }]));
  const houseKey = streamKey('poll-house-effect-player', state.date);
  let houseRng = deriveStream(state.seed, 'poll-house-effect-player', state.date);
  const pollHouses = state.politics.pollHouses.map(house => {
    const r = randomInt(houseRng, politicalModel.polling.houseEffectBound * 2 + 1); houseRng = r.state;
    return { ...house, effects: { ...house.effects, [PLAYER_PARTY_ID]: r.value - politicalModel.polling.houseEffectBound } };
  });
  let next: GameState = { ...state, status: 'active', playerParty: { id: PLAYER_PARTY_ID, name, shortName, color: command.color, values: [...command.values], foundedAt: state.date },
    resources: { money: data.newParty.money, staffCapacity: data.newParty.staffCapacity, agendaSlots: data.newParty.agendaSlots },
    finance: { members, initialMoney: data.newParty.money, ledger: [], ledgerTruncatedSum: 0, arrears: 0, staffLevel: 0 }, regionalOrganization,
    platforms: [...state.platforms, platform].sort((a, b) => a.partyId < b.partyId ? -1 : 1),
    cohorts: state.cohorts.map(c => ({ ...c, partyAttachment: { ...c.partyAttachment, [PLAYER_PARTY_ID]: 0 } })),
    rngState: { ...state.rngState, [key]: rng, [houseKey]: houseRng },
    politics: { ...state.politics, parties: [...state.politics.parties, party].sort((a, b) => a.partyId < b.partyId ? -1 : 1), perceptions, pollHouses,
      viability: { ...state.politics.viability, [PLAYER_PARTY_ID]: data.newParty.viability } } };
  next = { ...next, politics: { ...next.politics, analysis: computeAnalysis(next) } };
  next = { ...generatePoliticians(next, politicianModel.generator.initial), recruitmentReputation: politicianModel.recruitment.reputationStart };
  next = postMessage(next, `가상 인재 후보 ${next.politicians.length}명이 등장했습니다`, '가상 인물입니다. 실존 인물과 무관하며 이름이 우연히 같을 수 있습니다. 인재 페이지에서 영입과 약속을 검토하세요.', 'FYI', '영입 책임자');
  next = postMessage(next, `${shortName} 창당을 환영합니다`, `선언한 핵심가치: ${command.values.join(', ')}. 핵심가치는 득표 보너스가 아니며 연구 우선순위와 정체성에 반영됩니다.`, 'Important', '정책위원장');
  next = postMessage(next, '첫 공약과 내부조사를 준비하세요', '초안을 검토하고 자원을 확인해 공표하세요. 내부조사를 의뢰하면 잠재·현재 지지와 장벽의 시점별 추정을 확인할 수 있습니다.', 'Action Required', '데이터 책임자');
  return next;
}
export function publicationCost(state: GameState, leverId: string): Partial<Resources> {
  const platform = state.platforms.find(p => p.partyId === PLAYER_PARTY_ID);
  const position = platform?.positions[leverId];
  if (!platform || !position) throw new Error('공약 레버를 찾을 수 없습니다.');
  const next = publishPlatform(platform, leverId, state.date);
  if (next === platform) return { staffCapacity: 0, agendaSlots: 0 };
  const reversal = isPublicationReversal(position, state.date);
  return { agendaSlots: data.publication.agendaSlots, staffCapacity: data.publication.baseStaff + Math.abs(position.draftValue - (position.publishedValue ?? 2)) + (reversal ? data.publication.reversalStaff : 0) };
}
export function applyPublicationCost(state: GameState, leverId: string): GameState {
  return spend(state, publicationCost(state, leverId), 'research', `publication:${leverId}`);
}
export function growExpertise(state: GameState, domain: DomainId, rate: number): GameState {
  return { ...state, politics: { ...state.politics, parties: state.politics.parties.map(p => p.partyId !== PLAYER_PARTY_ID ? p : {
    ...p, expertise: { ...p.expertise, [domain]: p.expertise[domain] + fixedMultiply(Math.max(0, data.research.expertiseCap - p.expertise[domain]), rate) },
  }) } };
}
export function researchCost(state: GameState, domain: DomainId): Partial<Resources> {
  const matched = state.playerParty!.values.some(v => data.valueDomainAffinity[v].includes(domain));
  return { money: data.research.money, staffCapacity: roundDiv(data.research.staffCapacity * (matched ? SCALE - data.research.affinityDiscount : SCALE), SCALE) };
}
export function staffCap(state: GameState): number {
  const offices = Object.values(state.regionalOrganization).filter(r => r.office).length;
  const cap = data.finance.baseStaffCapacity + data.staffLevels[state.finance!.staffLevel]!.capacity + offices * organizationModel.officeStaff;
  return state.finance!.arrears > 0 ? Math.floor(cap / 2) : cap;
}
export function nextRefillDate(date: string): string {
  let next = addDays(date, 7);
  while (!isMonthlyTick(next)) next = addDays(next, 7);
  return next;
}
export function weeklyFinance(state: GameState): { income: number; expenses: number } {
  return { income: roundDiv(state.finance!.members * data.finance.payingRate * data.finance.monthlyDues * 12, SCALE * 52), expenses: data.staffLevels[state.finance!.staffLevel]!.weeklyPayroll + Object.values(state.regionalOrganization).filter(r => r.office).length * organizationModel.officeRent };
}
// F2: supporters' donations, booked once a month from last month's current support (GAME_MODEL).
export function monthlyDonations(state: GameState): number {
  return roundDiv((state.politics.analysis.currentSupport[PLAYER_PARTY_ID] ?? 0) * data.donations.monthlyPerSupport, SCALE);
}
export function settleWeek(state: GameState, monthly: boolean): GameState {
  const { income, expenses } = weeklyFinance(state);
  let next = recordMoney(state, 'dues', income, 'weekly-dues');
  const donations = monthly ? monthlyDonations(next) : 0;
  if (donations) next = recordMoney(next, 'donations', donations, 'monthly-donations');
  const due = expenses + next.finance!.arrears;
  const paid = Math.min(next.resources!.money, due);
  next = recordMoney(next, 'payroll', -paid, 'weekly-payroll-rent-and-arrears');
  next = { ...next, finance: { ...next.finance!, arrears: due - paid } };
  if (due > paid) next = postMessage(next, '급여 미지급금이 발생했습니다', `미지급금 ${due - paid}만원. 잔액은 음수가 되지 않으며 미지급금이 남으면 다음 Staff Capacity 충전은 절반입니다.`, 'Critical');
  if (monthly) next = { ...next, resources: { ...next.resources!, staffCapacity: staffCap(next), agendaSlots: data.finance.agendaCap } };
  const completed = next.research.filter(r => r.completesAt <= state.date);
  for (const r of completed) {
    next = growExpertise(next, r.domain, data.research.gain);
    next = postMessage(next, `${DOMAIN_LABELS[r.domain]} 정책 연구 완료`, '정책 전문성이 성장했습니다. 전문성은 이슈 소유 인식에 서서히 전달되며 직접 지지를 더하지 않습니다.', 'Important', '정책위원장');
    next = { ...next, events: [...next.events, { id: `event-${next.events.length}`, date: next.date, type: 'RESEARCH_COMPLETED', detail: r.domain }] };
  }
  return { ...next, research: next.research.filter(r => r.completesAt > state.date) };
}
export function managementCommand(state: GameState, command: Command): { state: GameState; event: 'STAFF_CHANGED' | 'RESEARCH_STARTED' | 'SURVEY_COMMISSIONED' } | null {
  if (command.type === 'SET_STAFF_LEVEL') {
    const target = data.staffLevels.find(s => s.level === command.level);
    if (!target) throw new Error('유효한 직원 수준을 선택하세요.');
    if (command.level === state.finance!.staffLevel) return { state, event: 'STAFF_CHANGED' };
    const current = data.staffLevels[state.finance!.staffLevel]!;
    const next = spend(state, { money: Math.max(0, target.hiringCost - current.hiringCost) }, 'hiring', `staff-level:${command.level}`);
    return { state: { ...next, finance: { ...next.finance!, staffLevel: command.level } }, event: 'STAFF_CHANGED' };
  }
  if (command.type === 'START_POLICY_RESEARCH') {
    if (!DOMAIN_IDS.includes(command.domain)) throw new Error('정책 영역을 찾을 수 없습니다.');
    if (state.research.some(r => r.domain === command.domain)) throw new Error('이 영역은 이미 연구 중입니다.');
    const next = spend(state, researchCost(state, command.domain), 'research', command.domain);
    return { state: { ...next, research: [...next.research, { domain: command.domain, startedAt: state.date, completesAt: addDays(state.date, data.research.weeks * 7) }].sort((a, b) => a.domain < b.domain ? -1 : 1) }, event: 'RESEARCH_STARTED' };
  }
  if (command.type === 'COMMISSION_INTERNAL_SURVEY') {
    let next = spend(state, data.survey, 'survey', 'internal-survey');
    // Separate frozen snapshot; never fed into public polling or AI.
    const analysis = computeAnalysis(state);
    next = { ...next, internalSurveys: [...state.internalSurveys, { date: state.date, margin: data.survey.margin, analysis, voteFlow: voteFlow(state) }].slice(-12) };
    next = postMessage(next, '내부조사 결과 도착', '데이터 허브에서 조사일 기준 잠재·현재 지지와 장벽을 확인하세요. 표시 범위는 통계적 신뢰구간이 아닌 세이브 모형 추정입니다.', 'Report', '데이터 책임자');
    return { state: next, event: 'SURVEY_COMMISSIONED' };
  }
  return null;
}
