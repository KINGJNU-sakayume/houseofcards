import { applyPublicationCost, foundParty, growExpertise, managementCommand, postMessage, settleWeek } from '../parties/management';
import { partyManagement } from '../../data/seeds/party-management';
import type { Command, GameEvent, GameState, InboxMessage } from '../../types/game';
import { addDays, CALENDAR, isMonthlyTick } from '../calendar';
import { deepFreeze } from './determinism';
import { deriveStream, randomInt, streamKey } from './rng';
import { initializeSimulation, PLAYER_PARTY_ID } from './initialize';
import { policyLevers, realityPack, seedPack } from '../../data/reality';
import { politicalModel as model } from '../../data/seeds/political-model';
import { decayConsistency, editDraft, publishPlatform, publishedPlatform, isPublicationReversal } from '../policy';
import { updateIssues } from '../issues';
import { DOMAIN_LABELS } from '../../types/simulation';
import { initializePolitics, evolvePerceptions } from '../voters/dynamics';
import { computeAnalysis } from '../voters/model';
import { updateGovernmentAI, updatePartyAI } from '../parties/ai';
import { makePoll } from '../polling';
import { updatePoolStatus, monthlySupply } from '../people/generator';
import { recruitmentCommand, weeklyPromises, monthlyReputation } from '../people/recruitment';

export const REALITY_PACK_ID = realityPack.id;
export const REALITY_PACK_AS_OF = realityPack.asOf;
export const MAX_COMMANDS = 6000;
export function createGame(seed: number): GameState {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('시드는 0~4294967295의 정수여야 합니다.');
  const state = initializePolitics({
    ...initializeSimulation(seed, CALENDAR.startDate),
    schemaVersion: 5, phase: 'C2', seed, playerParty: null, resources: null, finance: null, regionalOrganization: {}, research: [], internalSurveys: [], politicians: [], promises: [], recruitmentReputation: null, simulationStartDate: CALENDAR.startDate,
    realityPackId: REALITY_PACK_ID, realityPackAsOf: REALITY_PACK_AS_OF,
    rulesetId: model.scenario.rulesetId,
    rulesetSnapshot: { ...model.scenario, kind: 'opinion_only', status: 'GAME_ASSUMPTION', calendar: { ...CALENDAR } },
    date: CALENDAR.startDate, tick: 1, status: 'founding',
    inbox: [],
    events: [{ id: 'event-0', date: CALENDAR.startDate, type: 'SESSION_STARTED', detail: 'C2 창당 전 전국 정치 세계 시작' }], commandLog: [],
  });
  return deepFreeze(state);
}
function monthlyUpdate(initial: GameState) {
  let state: GameState = { ...initial, platforms: initial.platforms.map(decayConsistency) };
  const ai = updatePartyAI(state); state = ai.state;
  const government = updateGovernmentAI(state); state = government.state;
  const issues = updateIssues(state.issues, state.governmentPolicy, policyLevers, seedPack.issueConfigs, state.seed, state.date, state.rngState);
  state = evolvePerceptions({ ...state, issues: issues.issues, rngState: issues.rngState });
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
    const inbox = warning ? [{ id: `consistency-${state.commandLog.length}`, date: state.date, sender: '정책위원장', title: '최근 공약의 방향이 바뀌었습니다',
      body: 'SAVE SIMULATION · 최근 방향성 공표와 반대되는 입장을 발표했습니다. 일관성 부담이 신뢰 모형에 반영되며 매월 감소합니다. 정책 변경이 직접 득표를 더하거나 빼지는 않습니다.', priority: 'Important' as const, read: false }, ...state.inbox].slice(0, 60) : state.inbox;
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
  let next: GameState = settleWeek({ ...state, date, tick }, monthly);
  const update = monthly ? monthlyUpdate(next) : null;
  if (update) next = update.state;
  // Own stream only: the pool never moves AI, voter or polling draws.
  next = weeklyPromises(updatePoolStatus(next));
  if (monthly) next = monthlyReputation(next);
  const supply = monthly ? monthlySupply(next) : null;
  if (supply) next = supply.state;
  const messages: InboxMessage[] = [];
  const events: GameEvent[] = [...next.events, { id: `event-${next.events.length}`, date, type: 'WEEK_ADVANCED', detail: `${tick}주차` }];
  const event = (type: GameEvent['type'], detail: string) => events.push({ id: `event-${events.length}`, date, type, detail });
  if (update) {
    messages.push({ id: `issues-${tick}`, date, sender: '정책위원장', title: '월간 사회 이슈 보고', priority: 'Report', read: false,
      body: `SAVE SIMULATION · 게임 모델 지수 (현실 통계 아님). ${next.issues.map(issue => `${DOMAIN_LABELS[issue.id]}: 심각도 ${issue.severity / 100}, 관심도 ${issue.salience / 100}`).join(' / ')}.` });
    const result = update.poll.national.results[PLAYER_PARTY_ID];
    messages.push({ id: `poll-${tick}`, date, sender: '데이터 책임자', title: '가상 전국 지지 조사 발표', priority: 'Report', read: false,
      body: `가상 시뮬레이션 · ${update.poll.houseName}, 표본 ${update.poll.national.sampleSize}명. ${state.playerParty!.shortName} 전국 지지 ${result ? `${result.low / 10000}~${result.high / 10000}%` : '첫 조사 대기'}. 현실 여론조사나 선거 예측이 아닙니다. 잠재 지지는 별도의 내부 분석입니다.` });
    if (update.aiChanges.length) messages.push({ id: `ai-${tick}`, date, sender: '정책위원장', title: '비플레이어 정당 공약 변화', priority: 'Report', read: false,
      body: `SAVE SIMULATION · ${update.aiChanges.map(change => { const [id, lever] = change.split(':'); return `${realityPack.parties.find(p => p.id === id)?.shortName.value ?? '기타 세력 묶음'}: ${policyLevers.find(l => l.id === lever)!.name}`; }).join(' / ')}. 공식 입장 발표가 아닌 게임 모델의 선택입니다.` });
    if (update.governmentChanges.length) messages.push({ id: `government-${tick}`, date, sender: '정책위원장', title: '정부 정책 집행과 효과 시차', priority: 'Report', read: false,
      body: `SAVE SIMULATION · ${update.governmentChanges.map(id => policyLevers.find(l => l.id === id)!.name).join(', ')} 집행이 결정되었습니다. 각 정책의 구현 시차가 지난 뒤 사회 이슈에 반영됩니다.` });
    if (supply!.added) messages.push({ id: `prospects-${tick}`, date, sender: '영입 책임자', title: `새 인재 후보 ${supply!.added}명`, priority: 'Report', read: false,
      body: `가상 인물입니다. 실존 인물과 무관하며 이름이 우연히 같을 수 있습니다. 누적 생성 ${next.politicians.length}명. 인재 페이지에서 영입을 검토하세요.` });
    event('MONTH_BOUNDARY', '이슈·인식·AI·전국 지지 갱신');
    event('POLL_PUBLISHED', update.poll.id);
    if (update.aiChanges.length) event('AI_PLATFORM_SHIFT', update.aiChanges.join('|'));
    if (update.governmentChanges.length) event('GOVERNMENT_ENACTED', update.governmentChanges.join('|'));
  }
  if (['2027-07-05', '2027-10-04', '2027-12-06', '2028-01-17', '2028-03-20'].includes(date)) next = postMessage(next, '후속 선거 일정 안내', '이 기능은 아직 구현되지 않았습니다. 공천·선거 기능은 Phase D에서 구현됩니다.', 'FYI');
  return deepFreeze({ ...next, status: date === state.rulesetSnapshot.calendar.lastWeeklyDate ? 'phase_complete' : 'active',
    rngState: { ...next.rngState, [key]: draw.state }, inbox: [...messages, ...next.inbox].slice(0, 60), events, commandLog: [...state.commandLog, { ...command }],
  });
}
export function simulationFields(state: GameState) {
  return { date: state.date, issues: state.issues, cohorts: state.cohorts, governmentPolicy: state.governmentPolicy, politics: state.politics,
    platforms: state.platforms.map(platform => ({ partyId: platform.partyId, positions: publishedPlatform(platform) })), rngState: state.rngState };
}
export function replay(seed: number, commands: readonly Command[]): GameState { return commands.reduce(dispatchCommand, createGame(seed)); }
