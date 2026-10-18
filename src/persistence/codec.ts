import { z } from 'zod';
import type { GameState } from '../types/game';
import { isoDate } from '../data/reality/schema';
import { deepFreeze, stateHash } from '../engine/simulation/determinism';
import { replay } from '../engine/simulation/engine';

export const MAX_SAVE_BYTES = 2_000_000;
const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ADVANCE_WEEK') }),
  z.strictObject({ type: z.literal('RESPOND_INBOX'), messageId: z.string().max(100) }),
]);
const stateSchema = z.strictObject({
  schemaVersion: z.literal(1), phase: z.literal('A'), seed: z.number().int().min(0).max(0xffffffff),
  rngState: z.record(z.string(), z.number().int().min(1).max(0xffffffff)),
  realityPackId: z.string(), realityPackAsOf: isoDate,
  rulesetId: z.literal('foundation_calendar_only'),
  rulesetSnapshot: z.strictObject({
    rulesetId: z.literal('foundation_calendar_only'), kind: z.literal('foundation'), label: z.string(),
    status: z.literal('GAME_ASSUMPTION'),
    calendar: z.strictObject({ startDate: isoDate, lastWeeklyDate: isoDate, electionDate: isoDate }),
  }),
  date: isoDate, tick: z.number().int().min(1).max(78), status: z.enum(['active', 'phase_complete']),
  inbox: z.array(z.strictObject({
    id: z.string(), date: isoDate, sender: z.string(), title: z.string(), body: z.string(),
    priority: z.enum(['Important', 'Report', 'FYI']), read: z.boolean(),
  })).max(12),
  events: z.array(z.strictObject({ id: z.string(), date: isoDate,
    type: z.enum(['SESSION_STARTED', 'WEEK_ADVANCED', 'MONTH_BOUNDARY', 'INBOX_READ']), detail: z.string(),
  })).max(500),
  commandLog: z.array(commandSchema).max(1000),
});
const envelopeSchema = z.strictObject({ format: z.literal('HOC_KOREA_SAVE'), version: z.literal(1), checksum: z.string().regex(/^[a-f0-9]{16}$/), state: stateSchema });
export function serializeSave(state: GameState): string {
  return JSON.stringify({ format: 'HOC_KOREA_SAVE', version: 1, checksum: stateHash(state), state }, null, 2);
}
export function deserializeSave(text: string): GameState {
  if (text.length > MAX_SAVE_BYTES || new TextEncoder().encode(text).byteLength > MAX_SAVE_BYTES) throw new Error('세이브 파일이 너무 큽니다 (최대 2MB).');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('올바른 JSON 파일이 아닙니다.'); }
  const parsed = envelopeSchema.safeParse(raw);
  if (!parsed.success) throw new Error('지원하지 않는 세이브 버전이거나 파일 구조가 잘못되었습니다.');
  const { state, checksum } = parsed.data;
  if (stateHash(state) !== checksum) throw new Error('세이브 무결성 검사에 실패했습니다. 파일이 변경되었거나 손상되었습니다.');
  let replayed: GameState;
  try { replayed = replay(state.seed, state.commandLog); } catch { throw new Error('세이브 명령 기록이 유효하지 않습니다.'); }
  if (stateHash(replayed) !== checksum) throw new Error('세이브 상태와 명령 재생 결과가 다릅니다.');
  return deepFreeze(state);
}
