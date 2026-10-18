import type { Command, GameEvent, GameState, InboxMessage } from '../../types/game';
import { addDays, CALENDAR, isMonthlyTick } from '../calendar';
import { deepFreeze } from './determinism';
import { deriveStream, randomInt, streamKey } from './rng';
import { initializeSimulation, PLAYER_PARTY_ID } from './initialize';
import { policyLevers, realityPack, seedPack } from '../../data/reality';
import { decayConsistency, editDraft, publishPlatform, publishedPlatform } from '../policy';
import { updateIssues } from '../issues';
import { DOMAIN_LABELS } from '../../types/simulation';

export const REALITY_PACK_ID = realityPack.id;
export const REALITY_PACK_AS_OF = realityPack.asOf;
export const MAX_COMMANDS = 1000;
export function createGame(seed: number): GameState {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('시드는 0~4294967295의 정수여야 합니다.');
  return deepFreeze({
    ...initializeSimulation(seed, CALENDAR.startDate),
    schemaVersion: 2, phase: 'B1', seed, simulationStartDate: CALENDAR.startDate,
    realityPackId: REALITY_PACK_ID, realityPackAsOf: REALITY_PACK_AS_OF,
    rulesetId: 'foundation_calendar_only',
    rulesetSnapshot: {
      rulesetId: 'foundation_calendar_only', kind: 'foundation',
      label: '달력 프리뷰 · 선거 배분 미구현', status: 'GAME_ASSUMPTION', calendar: { ...CALENDAR },
    },
    date: CALENDAR.startDate, tick: 1, status: 'active',
    inbox: [{ id: 'welcome', date: CALENDAR.startDate, sender: '개발 안내',
      title: '새로운 정치의 첫 페이지', priority: 'Important', read: false,
      body: 'B1에서는 매월 마지막 월요일에 여섯 사회 이슈의 게임 모델 지수를 갱신합니다. 96개 코호트와 공약·정부 정책 계층이 준비되었습니다. 지지율·AI 전략·여론조사와 정책 편집 화면은 B2, 창당·자원은 Phase C입니다. 현실 스냅샷은 2026-10-18까지이며 이후는 SAVE SIMULATION입니다.',
    }],
    events: [{ id: 'event-0', date: CALENDAR.startDate, type: 'SESSION_STARTED', detail: 'B1 시뮬레이션 기반 프리뷰 시작' }],
    commandLog: [],
  });
}
export function dispatchCommand(state: GameState, command: Command): GameState {
  if (state.commandLog.length >= MAX_COMMANDS) throw new Error('프리뷰 명령 기록 한도(1000개)에 도달했습니다. JSON을 보관한 뒤 새 프리뷰를 시작하세요.');
  if (command.type === 'SET_PLATFORM_DRAFT' || command.type === 'PUBLISH_PLATFORM') {
    if (state.status !== 'active') throw new Error('완료된 프리뷰는 공약을 변경할 수 없습니다.');
    const platform = state.platforms.find(p => p.partyId === PLAYER_PARTY_ID)!;
    const next = command.type === 'SET_PLATFORM_DRAFT'
      ? editDraft(platform, command.leverId, command.value)
      : publishPlatform(platform, command.leverId, state.date);
    if (next === platform) return state;
    return deepFreeze({ ...state, platforms: state.platforms.map(p => p.partyId === PLAYER_PARTY_ID ? next : p),
      events: [...state.events, { id: `event-${state.events.length}`, date: state.date,
        type: command.type === 'SET_PLATFORM_DRAFT' ? 'PLATFORM_DRAFTED' : 'PLATFORM_PUBLISHED', detail: command.leverId }],
      commandLog: [...state.commandLog, { ...command }],
    });
  }
  if (command.type === 'RESPOND_INBOX') {
    const message = state.inbox.find(item => item.id === command.messageId);
    if (!message) throw new Error('받은 편지를 찾을 수 없습니다.');
    if (message.read) return state;
    return deepFreeze({ ...state,
      inbox: state.inbox.map(item => item.id === message.id ? { ...item, read: true } : item),
      events: [...state.events, { id: `event-${state.events.length}`, date: state.date, type: 'INBOX_READ', detail: message.id }],
      commandLog: [...state.commandLog, { ...command }],
    });
  }
  if (command.type !== 'ADVANCE_WEEK') throw new Error('이 단계에서 지원하지 않는 명령입니다.');
  if (state.status === 'phase_complete') return state;
  const date = addDays(state.date, 7);
  if (date > state.rulesetSnapshot.calendar.lastWeeklyDate) return state;
  const tick = state.tick + 1;
  const monthly = isMonthlyTick(date);
  const key = streamKey('calendar-reports', date);
  const draw = randomInt(state.rngState[key] ?? deriveStream(state.seed, 'calendar-reports', date), 3);
  const simulation = monthly ? updateIssues(state.issues, state.governmentPolicy, policyLevers, seedPack.issueConfigs, state.seed, date, state.rngState)
    : { issues: state.issues, rngState: state.rngState };
  const senders = ['일정 담당', '기록 담당', '운영 담당'];
  const message: InboxMessage = {
    id: `week-${tick}`, date, sender: senders[draw.value]!,
    title: monthly ? '월간 사회 이슈 보고' : `${tick}주차 일정이 열렸습니다`,
    body: monthly
      ? `SAVE SIMULATION · 게임 모델 지수 (현실 통계 아님). ${simulation.issues.map(issue => `${DOMAIN_LABELS[issue.id]}: 심각도 ${issue.severity / 100}, 관심도 ${issue.salience / 100}`).join(' / ')}. 여론조사와 정당 AI는 B2에 구현됩니다.`
      : '한 주가 지났습니다. 사회 이슈는 매월 마지막 월요일에 갱신됩니다. 지지율·여론조사·자원은 아직 계산하지 않습니다.',
    priority: monthly ? 'Report' : 'FYI', read: false,
  };
  const events: GameEvent[] = [...state.events, { id: `event-${state.events.length}`, date, type: 'WEEK_ADVANCED', detail: `${tick}주차` }];
  if (monthly) events.push({ id: `event-${events.length}`, date, type: 'MONTH_BOUNDARY', detail: '여섯 사회 이슈 갱신 · 게임 모델 지수' });
  return deepFreeze({ ...state, date, tick,
    status: date === state.rulesetSnapshot.calendar.lastWeeklyDate ? 'phase_complete' : 'active',
    issues: simulation.issues, platforms: monthly ? state.platforms.map(decayConsistency) : state.platforms,
    rngState: { ...simulation.rngState, [key]: draw.state },
    inbox: [message, ...state.inbox].slice(0, 12), events,
    commandLog: [...state.commandLog, { ...command }],
  });
}
export function simulationFields(state: GameState) {
  return { date: state.date, issues: state.issues, cohorts: state.cohorts, governmentPolicy: state.governmentPolicy,
    platforms: state.platforms.map(platform => ({ partyId: platform.partyId, positions: publishedPlatform(platform) })), rngState: state.rngState };
}
export function replay(seed: number, commands: readonly Command[]): GameState {
  return commands.reduce(dispatchCommand, createGame(seed));
}
