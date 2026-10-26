import { applyPublicationCost, foundParty, growExpertise, managementCommand, postMessage, settleWeek } from '../parties/management';
import { partyManagement } from '../../data/seeds/party-management';
import type { Command, GameEvent, GameState, InboxMessage } from '../../types/game';
import { addDays, CALENDAR, isMonthlyTick } from '../calendar';
import { deepFreeze } from './determinism';
import { deriveStream, randomInt, streamKey } from './rng';
import { initializeSimulation, PLAYER_PARTY_ID } from './initialize';
import { policyLevers, realityPack, seedPack } from '../../data/reality';
import { politicalModel as model } from '../../data/seeds/political-model';
import { rulesetPreset, rulesets } from '../../data/rulesets';
import type { SeedPack } from '../../data/reality/schema';
import { decayConsistency, editDraft, publishPlatform, publishedPlatform, isPublicationReversal } from '../policy';
import { updateIssues } from '../issues';
import { DOMAIN_LABELS } from '../../types/simulation';
import { initializePolitics, evolvePerceptions } from '../voters/dynamics';
import { computeAnalysis } from '../voters/model';
import { updateGovernmentAI, updatePartyAI } from '../parties/ai';
import { makePoll } from '../polling';
import { updatePoolStatus, monthlySupply } from '../people/generator';
import { recruitmentCommand, weeklyPromises, monthlyReputation } from '../people/recruitment';
import { monthlyOrganization, organizationCommand, recruitExpertise, weeklyOrganization } from '../organization';
import { scoutingWeight } from '../organization/channels';
import { emptyNominations, nominationCommand, weeklyNominations } from '../election/nominations';
import { emptyFinalPush, finalPushCommand, weeklyFinalPush } from '../election/finalPush';
import { holdElection } from '../election/election';
import { monthlyBrand } from '../parties/brand';

export const REALITY_PACK_ID = realityPack.id;
export const REALITY_PACK_AS_OF = realityPack.asOf;
export const MAX_COMMANDS = 6000;
// `calibration` overrides seeds for the offline search only (scripts/calibrate.ts); the game never passes it.
export interface CalibrationOverride { seeds?: SeedPack; parties?: typeof model.parties }
export function createGame(seed: number, rulesetId: string = rulesets.defaultRulesetId, calibration: CalibrationOverride = {}): GameState {
  const preset = rulesetPreset(rulesetId);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('시드는 0~4294967295의 정수여야 합니다.');
  const state = initializePolitics({
    ...initializeSimulation(seed, CALENDAR.startDate, calibration.seeds),
    schemaVersion: 16, phase: 'C2', seed, playerParty: null, resources: null, finance: null, regionalOrganization: {}, research: [], internalSurveys: [], politicians: [], promises: [], recruitmentReputation: null, brandInconsistency: 0, nominations: emptyNominations(), finalPush: emptyFinalPush(), election: null, history: [], simulationStartDate: CALENDAR.startDate,
    realityPackId: REALITY_PACK_ID, realityPackAsOf: REALITY_PACK_AS_OF,
    rulesetId: preset.rulesetId,
    // The opinion model reads only these ruleset values (viability knee and threshold).
    rulesetSnapshot: { rulesetId: preset.rulesetId, label: preset.label, kind: 'opinion_only', status: 'GAME_ASSUMPTION', calendar: { ...CALENDAR },
      listSeats: preset.listSeats, legalThresholdVoteShare: preset.legalThreshold?.voteShare ?? 0, electabilityKnee: model.scenario.electabilityKnee },
    electionRuleset: { ...preset, electionDate: CALENDAR.electionDate, currentLaw: rulesets.currentLaw },
    date: CALENDAR.startDate, tick: 1, status: 'founding',
    inbox: [],
    events: [{ id: 'event-0', date: CALENDAR.startDate, type: 'SESSION_STARTED', detail: 'C2 창당 전 전국 정치 세계 시작' }], commandLog: [],
  }, calibration.parties);
  return deepFreeze(state);
}
function monthlyUpdate(initial: GameState) {
  let state: GameState = { ...initial, platforms: initial.platforms.map(decayConsistency) };
  const ai = updatePartyAI(state); state = ai.state;
  const government = updateGovernmentAI(state); state = government.state;
  const issues = updateIssues(state.issues, state.governmentPolicy, policyLevers, seedPack.issueConfigs, state.seed, state.date, state.rngState);
  state = evolvePerceptions(monthlyBrand(recruitExpertise({ ...state, issues: issues.issues, rngState: issues.rngState })));
  const analysis = computeAnalysis(state);
  const house = state.politics.pollHouses[state.politics.polls.length % state.politics.pollHouses.length]!;
  const polling = makePoll(analysis, house, state.seed, state.date, state.rngState, state.politics.polls.length);
  state = { ...state, rngState: polling.rngState, politics: { ...state.politics, analysis, polls: [...state.politics.polls, polling.poll] } };
  return { state, aiChanges: ai.changes, governmentChanges: government.changes, poll: polling.poll };
}
export function dispatchCommand(state: GameState, command: Command): GameState {
  if (state.commandLog.length >= MAX_COMMANDS) throw new Error('프리뷰 명령 기록 한도(6000개)에 도달했습니다. JSON을 보관한 뒤 새 프리뷰를 시작하세요.');
  if (state.status === 'founding' && command.type !== 'CREATE_PARTY') throw new Error('먼저 정당을 창당하세요.');
  const finish = (next: GameState, type: GameEvent['type'], detail: string): GameState => next === state ? state : deepFreeze({ ...next,
    events: [...next.events, { id: `event-${next.events.length}`, date: next.date, type, detail }], commandLog: [...state.commandLog, command.type === 'CREATE_PARTY' ? { ...command, name: next.playerParty!.name, shortName: next.playerParty!.shortName, values: [...command.values] } : { ...command }] });
  if (command.type === 'CREATE_PARTY') {
    const next = foundParty(state, command);
    return finish(next, 'PARTY_CREATED', next.playerParty!.name);
  }
  if (state.status === 'active') {
    const managed = managementCommand(state, command);
    if (managed) return finish(managed.state, managed.event, command.type);
    const recruited = recruitmentCommand(state, command);
    if (recruited) return finish(recruited.state, recruited.event, recruited.detail);
    const invested = organizationCommand(state, command);
    if (invested) return finish(invested.state, invested.event, invested.detail);
    const nominated = nominationCommand(state, command);
    if (nominated) return finish(nominated.state, nominated.event, nominated.detail);
    const pushed = finalPushCommand(state, command);
    if (pushed) return finish(pushed.state, pushed.event, pushed.detail);
  } else if (!['ADVANCE_WEEK', 'RESPOND_INBOX'].includes(command.type)) throw new Error('완료된 프리뷰는 변경할 수 없습니다.');
  if (command.type === 'SET_PLATFORM_DRAFT' || command.type === 'PUBLISH_PLATFORM') {
    if (state.status !== 'active') throw new Error('완료된 프리뷰는 공약을 변경할 수 없습니다.');
    const platform = state.platforms.find(p => p.partyId === PLAYER_PARTY_ID)!;
    const next = command.type === 'SET_PLATFORM_DRAFT' ? editDraft(platform, command.leverId, command.value) : publishPlatform(platform, command.leverId, state.date);
    if (next === platform) return state;
    const warning = command.type === 'PUBLISH_PLATFORM' && isPublicationReversal(platform.positions[command.leverId]!, state.date);
    let paid = command.type === 'PUBLISH_PLATFORM' ? applyPublicationCost(state, command.leverId) : state;
    if (command.type === 'PUBLISH_PLATFORM') {
      const domain = policyLevers.find(l => l.id === command.leverId)!.domain;
      const already = policyLevers.some(l => l.domain === domain && platform.positions[l.id]!.publishedValue !== null);
      if (already && !warning) paid = growExpertise(paid, domain, partyManagement.publication.consistentGain);
    }
    const inbox = warning ? [{ id: `consistency-${state.commandLog.length}`, date: state.date, sender: '정책위원장', title: '최근 공약의 방향이 바뀌었습니다', link: { route: '/policy', label: '정책 화면으로' },
      body: '가상 시뮬레이션 · 최근 방향성 공표와 반대되는 입장을 발표했습니다. 일관성 부담이 신뢰 모형에 반영되며 매월 감소합니다. 정책 변경이 직접 득표를 더하거나 빼지는 않습니다.', priority: 'Important' as const, read: false }, ...state.inbox].slice(0, 60) : state.inbox;
    return deepFreeze({ ...paid, platforms: state.platforms.map(p => p.partyId === PLAYER_PARTY_ID ? next : p), inbox,
      events: [...state.events, { id: `event-${state.events.length}`, date: state.date, type: command.type === 'SET_PLATFORM_DRAFT' ? 'PLATFORM_DRAFTED' : 'PLATFORM_PUBLISHED', detail: command.leverId }],
      commandLog: [...state.commandLog, { ...command }],
    });
  }
  if (command.type === 'RESPOND_INBOX') {
    const message = state.inbox.find(item => item.id === command.messageId);
    if (!message) throw new Error('받은 편지를 찾을 수 없습니다.');
    if (message.read) return state;
    return deepFreeze({ ...state, inbox: state.inbox.map(item => item.id === message.id ? { ...item, read: true } : item),
      events: [...state.events, { id: `event-${state.events.length}`, date: state.date, type: 'INBOX_READ', detail: message.id }], commandLog: [...state.commandLog, { ...command }],
    });
  }
  if (command.type !== 'ADVANCE_WEEK') throw new Error('이 단계에서 지원하지 않는 명령입니다.');
  if (state.status === 'phase_complete') return state;
  const date = addDays(state.date, 7);
  if (date > state.rulesetSnapshot.calendar.lastWeeklyDate) return state;
  const tick = state.tick + 1, monthly = isMonthlyTick(date);
  const key = streamKey('calendar-reports', date);
  const draw = randomInt(state.rngState[key] ?? deriveStream(state.seed, 'calendar-reports', date), 3);
  let next: GameState = weeklyOrganization(settleWeek({ ...state, date, tick }, monthly));
  const update = monthly ? monthlyUpdate(next) : null;
  if (update) next = update.state;
  // Own stream only: the pool never moves AI, voter or polling draws.
  next = weeklyFinalPush(weeklyNominations(weeklyPromises(updatePoolStatus(next))));
  if (monthly) next = monthlyOrganization(monthlyReputation(next));
  const pool = next;
  const supply = monthly ? monthlySupply(next, { regionWeight: id => scoutingWeight(pool, id) }) : null;
  if (supply) next = supply.state;
  // The last weekly tick computes the scheduled election (Slice §6: 2028-04-12).
  if (date === state.rulesetSnapshot.calendar.lastWeeklyDate) next = holdElection(next);
  const messages: InboxMessage[] = [];
  const events: GameEvent[] = [...next.events, { id: `event-${next.events.length}`, date, type: 'WEEK_ADVANCED', detail: `${tick}주차` }];
  const event = (type: GameEvent['type'], detail: string) => events.push({ id: `event-${events.length}`, date, type, detail });
  if (update) {
    messages.push({ id: `issues-${tick}`, date, sender: '정책위원장', title: '월간 사회 이슈 보고', priority: 'Report', read: false, link: { route: '/korea', label: '정국 브리핑 보기' },
      body: `가상 시뮬레이션 · 게임 모형 지수 (현실 통계 아님). ${next.issues.map(issue => `${DOMAIN_LABELS[issue.id]}: 심각도 ${issue.severity / 100}, 관심도 ${issue.salience / 100}`).join(' / ')}.` });
    const result = update.poll.national.results[PLAYER_PARTY_ID];
    messages.push({ id: `poll-${tick}`, date, sender: '데이터 책임자', title: '가상 전국 지지 조사 발표', priority: 'Report', read: false, link: { route: '/data', label: '조사 결과 보기' },
      body: `가상 시뮬레이션 · ${update.poll.houseName}, 표본 ${update.poll.national.sampleSize}명. ${state.playerParty!.shortName} 전국 지지 ${result ? `${result.low / 10000}~${result.high / 10000}%` : '첫 조사 대기'}. 현실 여론조사나 선거 예측이 아닙니다. 잠재 지지는 별도의 내부 분석입니다.` });
    if (update.aiChanges.length) messages.push({ id: `ai-${tick}`, date, sender: '정책위원장', title: '비플레이어 정당 공약 변화', priority: 'Report', read: false, link: { route: '/policy', label: '정당 공약 비교' },
      body: `가상 시뮬레이션 · ${update.aiChanges.map(change => { const [id, lever] = change.split(':'); return `${realityPack.parties.find(p => p.id === id)?.shortName.value ?? '기타 세력 묶음'}: ${policyLevers.find(l => l.id === lever)!.name}`; }).join(' / ')}. 공식 입장 발표가 아닌 게임 모형의 선택입니다.` });
    if (update.governmentChanges.length) messages.push({ id: `government-${tick}`, date, sender: '정책위원장', title: '정부 정책 집행과 효과 시차', priority: 'Report', read: false, link: { route: '/korea', label: '대한민국 보기' },
      body: `가상 시뮬레이션 · ${update.governmentChanges.map(id => policyLevers.find(l => l.id === id)!.name).join(', ')} 집행이 결정되었습니다. 각 정책의 구현 시차가 지난 뒤 사회 이슈에 반영됩니다.` });
    if (supply!.added) messages.push({ id: `prospects-${tick}`, date, sender: '영입 책임자', title: `새 인재 후보 ${supply!.added}명`, priority: 'Report', read: false, link: { route: '/politicians', label: '인재 명단 보기' },
      body: `가상 인물입니다. 실존 인물과 무관하며 이름이 우연히 같을 수 있습니다. 누적 생성 ${next.politicians.length}명. 인재 페이지에서 영입을 검토하세요.` });
    event('MONTH_BOUNDARY', '이슈·인식·AI·전국 지지 갱신');
    event('POLL_PUBLISHED', update.poll.id);
    if (update.aiChanges.length) event('AI_PLATFORM_SHIFT', update.aiChanges.join('|'));
    if (update.governmentChanges.length) event('GOVERNMENT_ENACTED', update.governmentChanges.join('|'));
  }
  if (date === '2028-01-17') next = postMessage(next, '막판 총력전 시작', '선거 12주 전입니다. 선거 페이지에서 전국·보조 메시지, 지도부 집중 지역, 후보별 유세 강도를 정하세요. 배분은 매주 정산됩니다.', 'Action Required', '사무총장', { route: '/election', label: '막판 총력전 배분' });

  const history = update && next.playerParty ? [...next.history, { date, money: next.resources!.money, members: next.finance!.members, support: next.politics.analysis.currentSupport[PLAYER_PARTY_ID] ?? 0,
    issues: Object.fromEntries(next.issues.map(issue => [issue.id, [issue.severity, issue.salience] as [number, number]])) }].slice(-HISTORY_MONTHS) : next.history;
  return deepFreeze({ ...next, history, status: date === state.rulesetSnapshot.calendar.lastWeeklyDate ? 'phase_complete' : 'active',
    rngState: { ...next.rngState, [key]: draw.state }, inbox: [...messages, ...next.inbox].slice(0, 60), events, commandLog: [...state.commandLog, { ...command }],
  });
}
export const HISTORY_MONTHS = 20;
export function simulationFields(state: GameState) {
  return { date: state.date, issues: state.issues, cohorts: state.cohorts, governmentPolicy: state.governmentPolicy, politics: state.politics,
    platforms: state.platforms.map(platform => ({ partyId: platform.partyId, positions: publishedPlatform(platform) })), rngState: state.rngState };
}
export function replay(seed: number, commands: readonly Command[], rulesetId: string = rulesets.defaultRulesetId): GameState { return commands.reduce(dispatchCommand, createGame(seed, rulesetId)); }
