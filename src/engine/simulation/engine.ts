import type { Command, GameEvent, GameState, InboxMessage } from '../../types/game';
import { addDays, CALENDAR, isMonthlyTick } from '../calendar';
import { deepFreeze } from './determinism';
import { deriveStream, randomInt, streamKey } from './rng';
import { initializeSimulation, PLAYER_PARTY_ID } from './initialize';
import { policyLevers, realityPack, seedPack } from '../../data/reality';
import { politicalModel as model } from '../../data/seeds/political-model';
import { decayConsistency, editDraft, publishPlatform, publishedPlatform } from '../policy';
import { updateIssues } from '../issues';
import { DOMAIN_LABELS } from '../../types/simulation';
import { initializePolitics, evolvePerceptions } from '../voters/dynamics';
import { computeAnalysis } from '../voters/model';
import { updateGovernmentAI, updatePartyAI } from '../parties/ai';
import { makePoll } from '../polling';

export const REALITY_PACK_ID = realityPack.id;
export const REALITY_PACK_AS_OF = realityPack.asOf;
export const MAX_COMMANDS = 1000;
export function createGame(seed: number): GameState {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('시드는 0~4294967295의 정수여야 합니다.');
  const state = initializePolitics({
    ...initializeSimulation(seed, CALENDAR.startDate),
    schemaVersion: 2, phase: 'B2', seed, simulationStartDate: CALENDAR.startDate,
    realityPackId: REALITY_PACK_ID, realityPackAsOf: REALITY_PACK_AS_OF,
    rulesetId: model.scenario.rulesetId,
    rulesetSnapshot: { ...model.scenario, kind: 'opinion_only', status: 'GAME_ASSUMPTION', calendar: { ...CALENDAR } },
    date: CALENDAR.startDate, tick: 1, status: 'active',
    inbox: [{ id: 'welcome', date: CALENDAR.startDate, sender: '개발 안내',
      title: '공약이 지지로 전달되기까지', priority: 'Important', read: false,
      body: '개발 프리뷰 정당의 공약을 편집·공표하고 월간 보고를 확인하세요. 인지도·신뢰·기존 충성·생존가능성이 현재 지지와 잠재 지지 사이의 장벽을 만듭니다. 모든 여론조사는 가상 시뮬레이션이며 현실 예측이 아닙니다. 현실 스냅샷은 2026-10-18까지, 이후는 SAVE SIMULATION입니다. 창당·영입·조직·자원·선거 계산은 아직 구현하지 않았습니다.',
    }],
    events: [{ id: 'event-0', date: CALENDAR.startDate, type: 'SESSION_STARTED', detail: 'B2 전국 지지·가상 여론조사 개발 프리뷰 시작' }], commandLog: [],
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
  if (state.commandLog.length >= MAX_COMMANDS) throw new Error('프리뷰 명령 기록 한도(1000개)에 도달했습니다. JSON을 보관한 뒤 새 프리뷰를 시작하세요.');
  if (command.type === 'SET_PLATFORM_DRAFT' || command.type === 'PUBLISH_PLATFORM') {
    if (state.status !== 'active') throw new Error('완료된 프리뷰는 공약을 변경할 수 없습니다.');
    const platform = state.platforms.find(p => p.partyId === PLAYER_PARTY_ID)!;
    const next = command.type === 'SET_PLATFORM_DRAFT' ? editDraft(platform, command.leverId, command.value) : publishPlatform(platform, command.leverId, state.date);
    if (next === platform) return state;
    const warning = next.positions[command.leverId]!.reversalPenalty > platform.positions[command.leverId]!.reversalPenalty;
    const inbox = warning ? [{ id: `consistency-${state.commandLog.length}`, date: state.date, sender: '정책팀', title: '최근 공약의 방향이 바뀌었습니다',
      body: 'SAVE SIMULATION · 최근 방향성 공표와 반대되는 입장을 발표했습니다. 일관성 부담이 신뢰 모형에 반영되며 매월 감소합니다. 정책 변경이 직접 득표를 더하거나 빼지는 않습니다.', priority: 'Important' as const, read: false }, ...state.inbox].slice(0, 12) : state.inbox;
    return deepFreeze({ ...state, platforms: state.platforms.map(p => p.partyId === PLAYER_PARTY_ID ? next : p), inbox,
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
  let next: GameState = { ...state, date, tick };
  const update = monthly ? monthlyUpdate(next) : null;
  if (update) next = update.state;
  const messages: InboxMessage[] = [];
  const events: GameEvent[] = [...state.events, { id: `event-${state.events.length}`, date, type: 'WEEK_ADVANCED', detail: `${tick}주차` }];
  const event = (type: GameEvent['type'], detail: string) => events.push({ id: `event-${events.length}`, date, type, detail });
  if (update) {
    messages.push({ id: `issues-${tick}`, date, sender: '사회 이슈팀', title: '월간 사회 이슈 보고', priority: 'Report', read: false,
      body: `SAVE SIMULATION · 게임 모델 지수 (현실 통계 아님). ${next.issues.map(issue => `${DOMAIN_LABELS[issue.id]}: 심각도 ${issue.severity / 100}, 관심도 ${issue.salience / 100}`).join(' / ')}.` });
    const result = update.poll.national.results[PLAYER_PARTY_ID]!;
    messages.push({ id: `poll-${tick}`, date, sender: '조사 분석팀', title: '가상 전국 지지 조사 발표', priority: 'Report', read: false,
      body: `가상 시뮬레이션 · ${update.poll.houseName}, 표본 ${update.poll.national.sampleSize}명. 개발 프리뷰 정당 전국 지지 ${result.low / 10000}~${result.high / 10000}%. 현실 여론조사나 선거 예측이 아닙니다. 잠재 지지는 별도의 내부 분석입니다.` });
    if (update.aiChanges.length) messages.push({ id: `ai-${tick}`, date, sender: '정책 동향팀', title: '비플레이어 정당 공약 변화', priority: 'Report', read: false,
      body: `SAVE SIMULATION · ${update.aiChanges.map(change => { const [id, lever] = change.split(':'); return `${realityPack.parties.find(p => p.id === id)?.shortName.value ?? '기타 세력 묶음'}: ${policyLevers.find(l => l.id === lever)!.name}`; }).join(' / ')}. 공식 입장 발표가 아닌 게임 모델의 선택입니다.` });
    if (update.governmentChanges.length) messages.push({ id: `government-${tick}`, date, sender: '사회 이슈팀', title: '정부 정책 집행과 효과 시차', priority: 'Report', read: false,
      body: `SAVE SIMULATION · ${update.governmentChanges.map(id => policyLevers.find(l => l.id === id)!.name).join(', ')} 집행이 결정되었습니다. 각 정책의 구현 시차가 지난 뒤 사회 이슈에 반영됩니다.` });
    event('MONTH_BOUNDARY', '이슈·인식·AI·전국 지지 갱신');
    event('POLL_PUBLISHED', update.poll.id);
    if (update.aiChanges.length) event('AI_PLATFORM_SHIFT', update.aiChanges.join('|'));
    if (update.governmentChanges.length) event('GOVERNMENT_ENACTED', update.governmentChanges.join('|'));
  } else {
    let reportDate = date;
    while (!isMonthlyTick(reportDate)) reportDate = addDays(reportDate, 7);
    messages.push({ id: `week-${tick}`, date, sender: ['일정 담당', '기록 담당', '운영 담당'][draw.value]!, title: `${tick}주차 공약 검토`, priority: 'FYI', read: false,
      body: `다음 월간 보고는 ${reportDate}입니다. 공약 초안은 자유롭게 검토할 수 있으며 공표 전에는 시뮬레이션에 영향을 주지 않습니다. 공표한 입장의 전달과 인식 변화는 월간 보고에서 확인하세요.` });
  }
  return deepFreeze({ ...next, status: date === state.rulesetSnapshot.calendar.lastWeeklyDate ? 'phase_complete' : 'active',
    rngState: { ...next.rngState, [key]: draw.state }, inbox: [...messages, ...next.inbox].slice(0, 12), events, commandLog: [...state.commandLog, { ...command }],
  });
}
export function simulationFields(state: GameState) {
  return { date: state.date, issues: state.issues, cohorts: state.cohorts, governmentPolicy: state.governmentPolicy, politics: state.politics,
    platforms: state.platforms.map(platform => ({ partyId: platform.partyId, positions: publishedPlatform(platform) })), rngState: state.rngState };
}
export function replay(seed: number, commands: readonly Command[]): GameState { return commands.reduce(dispatchCommand, createGame(seed)); }
