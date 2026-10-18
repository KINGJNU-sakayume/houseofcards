import type { Command, GameEvent, GameState, InboxMessage } from '../../types/game';
import { addDays, CALENDAR, isMonthlyTick } from '../calendar';
import { deepFreeze } from './determinism';
import { deriveStream, randomInt, streamKey } from './rng';

export const REALITY_PACK_ID = 'kr-foundation-2026-10-19';
export const REALITY_PACK_AS_OF = '2026-10-19';
export function createGame(seed: number): GameState {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('시드는 0~4294967295의 정수여야 합니다.');
  return deepFreeze({
    schemaVersion: 1, phase: 'A', seed, rngState: {},
    realityPackId: REALITY_PACK_ID, realityPackAsOf: REALITY_PACK_AS_OF,
    rulesetId: 'foundation_calendar_only',
    rulesetSnapshot: {
      rulesetId: 'foundation_calendar_only', kind: 'foundation',
      label: '달력 프리뷰 · 선거 배분 미구현', status: 'GAME_ASSUMPTION', calendar: { ...CALENDAR },
    },
    date: CALENDAR.startDate, tick: 1, status: 'active',
    inbox: [{ id: 'welcome', date: CALENDAR.startDate, sender: '개발 안내',
      title: '새로운 정치의 첫 페이지', priority: 'Important', read: false,
      body: 'Phase A에서는 매주 월요일로 시간을 진행하고 세이브를 저장·복원할 수 있습니다. 창당, 정책, 인재 영입과 선거 시뮬레이션은 후속 단계에 구현됩니다. 먼저 일정을 살펴보세요.',
    }],
    events: [{ id: 'event-0', date: CALENDAR.startDate, type: 'SESSION_STARTED', detail: 'Phase A 달력 프리뷰 시작' }],
    commandLog: [],
  });
}
export function dispatchCommand(state: GameState, command: Command): GameState {
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
  const senders = ['일정 담당', '기록 담당', '운영 담당'];
  const message: InboxMessage = {
    id: `week-${tick}`, date, sender: senders[draw.value]!,
    title: monthly ? '월간 처리 시점에 도착했습니다' : `${tick}주차 일정이 열렸습니다`,
    body: monthly
      ? '이번 월요일은 이달의 마지막 주간 틱입니다. 월간 이슈·여론·재정 처리는 Phase B에서 구현됩니다. 현재는 달력과 기록만 진행됩니다.'
      : '한 주가 지났습니다. 현재 프리뷰에서는 주간 날짜와 기록만 갱신됩니다. 정당 지지율이나 자원은 아직 계산하지 않습니다.',
    priority: monthly ? 'Report' : 'FYI', read: false,
  };
  const events: GameEvent[] = [...state.events, { id: `event-${state.events.length}`, date, type: 'WEEK_ADVANCED', detail: `${tick}주차` }];
  if (monthly) events.push({ id: `event-${events.length}`, date, type: 'MONTH_BOUNDARY', detail: '월간 틱 경계 (Phase B 연산 대기)' });
  return deepFreeze({ ...state, date, tick,
    status: date === state.rulesetSnapshot.calendar.lastWeeklyDate ? 'phase_complete' : 'active',
    rngState: { ...state.rngState, [key]: draw.state },
    inbox: [message, ...state.inbox].slice(0, 12), events,
    commandLog: [...state.commandLog, { ...command }],
  });
}
export function replay(seed: number, commands: readonly Command[]): GameState {
  return commands.reduce(dispatchCommand, createGame(seed));
}
