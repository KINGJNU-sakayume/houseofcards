import { z } from 'zod';
import { politicsSchema } from './politics-schema';
import type { GameState } from '../types/game';
import { indexSchema, isoDate, leverValueSchema, REGION_IDS } from '../data/reality/schema';
import { AGE_BANDS, DOMAIN_IDS, PROFILE_IDS } from '../types/simulation';
import { deepFreeze, stateHash } from '../engine/simulation/determinism';
import { MAX_COMMANDS, replay } from '../engine/simulation/engine';

export const MAX_SAVE_BYTES = 2_000_000;
const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ADVANCE_WEEK') }),
  z.strictObject({ type: z.literal('RESPOND_INBOX'), messageId: z.string().max(100) }),
  z.strictObject({ type: z.literal('SET_PLATFORM_DRAFT'), leverId: z.string().max(100), value: leverValueSchema }),
  z.strictObject({ type: z.literal('PUBLISH_PLATFORM'), leverId: z.string().max(100) }),
]);
const positionSchema = z.strictObject({ draftValue: leverValueSchema, publishedValue: leverValueSchema.nullable(), publishedAt: isoDate.nullable(),
  lastDirectionalValue: leverValueSchema.nullable(), lastDirectionalAt: isoDate.nullable(), reversalPenalty: indexSchema });
const probability = z.number().int().min(0).max(1_000_000);
const stateSchema = z.strictObject({
  schemaVersion: z.literal(2), phase: z.literal('B2'), seed: z.number().int().min(0).max(0xffffffff),
  rngState: z.record(z.string(), z.number().int().min(1).max(0xffffffff)),
  realityPackId: z.string(), realityPackAsOf: isoDate,
  simulationStartDate: isoDate, politics: politicsSchema,
  platforms: z.array(z.strictObject({ partyId: z.string(), positions: z.record(z.string(), positionSchema) })).length(6),
  governmentPolicy: z.strictObject({ partyId: z.string(), levers: z.record(z.string(), z.strictObject({
    value: leverValueSchema, history: z.array(z.strictObject({ value: leverValueSchema, enactedAt: isoDate })).max(200),
  })) }),
  issues: z.array(z.strictObject({ id: z.enum(DOMAIN_IDS), severity: indexSchema, salience: indexSchema,
    trend: z.number().int().min(-10000).max(10000), structuralPressure: z.number().int().min(-1000).max(1000),
    lastUpdated: isoDate, drivers: z.record(z.string(), indexSchema),
  })).length(6),
  cohorts: z.array(z.strictObject({ id: z.string(), regionId: z.enum(REGION_IDS), ageBand: z.enum(AGE_BANDS), profileId: z.enum(PROFILE_IDS),
    weight: probability, preferences: z.record(z.string(), leverValueSchema), salience: z.record(z.enum(DOMAIN_IDS), indexSchema),
    partyAttachment: z.record(z.string(), probability), politicalAttention: indexSchema, turnoutTendency: indexSchema,
    tacticalVotingTendency: indexSchema, governmentEvaluationSensitivity: indexSchema,
  })).length(96),
  rulesetId: z.literal('parallel_46_open'),
  rulesetSnapshot: z.strictObject({
    rulesetId: z.literal('parallel_46_open'), kind: z.literal('opinion_only'), label: z.string(),
    status: z.literal('GAME_ASSUMPTION'), listSeats: z.number().int().positive(), legalThresholdVoteShare: probability, electabilityKnee: probability,
    calendar: z.strictObject({ startDate: isoDate, lastWeeklyDate: isoDate, electionDate: isoDate }),
  }),
  date: isoDate, tick: z.number().int().min(1).max(78), status: z.enum(['active', 'phase_complete']),
  inbox: z.array(z.strictObject({
    id: z.string(), date: isoDate, sender: z.string(), title: z.string(), body: z.string(),
    priority: z.enum(['Important', 'Report', 'FYI']), read: z.boolean(),
  })).max(12),
  events: z.array(z.strictObject({ id: z.string(), date: isoDate,
    type: z.enum(['SESSION_STARTED', 'WEEK_ADVANCED', 'MONTH_BOUNDARY', 'INBOX_READ', 'PLATFORM_DRAFTED', 'PLATFORM_PUBLISHED', 'AI_PLATFORM_SHIFT', 'GOVERNMENT_ENACTED', 'POLL_PUBLISHED']), detail: z.string(),
  })).max(MAX_COMMANDS + 200),
  commandLog: z.array(commandSchema).max(MAX_COMMANDS),
});
const envelopeSchema = z.strictObject({ format: z.literal('HOC_KOREA_SAVE'), version: z.literal(1), checksum: z.string().regex(/^[a-f0-9]{16}$/), state: stateSchema });
export function serializeSave(state: GameState): string {
  return JSON.stringify({ format: 'HOC_KOREA_SAVE', version: 1, checksum: stateHash(state), state }, null, 2);
}
export function deserializeSave(text: string): GameState {
  if (text.length > MAX_SAVE_BYTES || new TextEncoder().encode(text).byteLength > MAX_SAVE_BYTES) throw new Error('세이브 파일이 너무 큽니다 (최대 2MB).');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('올바른 JSON 파일이 아닙니다.'); }
  if (raw && typeof raw === 'object' && 'state' in raw && raw.state && typeof raw.state === 'object' &&
    'schemaVersion' in raw.state && raw.state.schemaVersion === 1) {
    throw new Error('Phase A 프리뷰 세이브(스키마 1)는 B2(스키마 2)과 호환되지 않습니다. 기존 JSON 내보내기 파일을 보관하고 새 프리뷰를 시작하세요.');
  }
  if (raw && typeof raw === 'object' && 'state' in raw && raw.state && typeof raw.state === 'object' && 'phase' in raw.state && raw.state.phase === 'B1') {
    throw new Error('B1 개발 프리뷰 세이브는 B2 정치 모형과 호환되지 않습니다. 기존 JSON을 보관하고 새 B2 프리뷰를 시작하세요.');
  }
  const parsed = envelopeSchema.safeParse(raw);
  if (!parsed.success) throw new Error('지원하지 않는 세이브 버전이거나 파일 구조가 잘못되었습니다.');
  const { state, checksum } = parsed.data;
  if (stateHash(state) !== checksum) throw new Error('세이브 무결성 검사에 실패했습니다. 파일이 변경되었거나 손상되었습니다.');
  let replayed: GameState;
  try { replayed = replay(state.seed, state.commandLog); } catch { throw new Error('세이브 명령 기록이 유효하지 않습니다.'); }
  if (stateHash(replayed) !== checksum) throw new Error('세이브 상태와 명령 재생 결과가 다릅니다.');
  return deepFreeze(state);
}
