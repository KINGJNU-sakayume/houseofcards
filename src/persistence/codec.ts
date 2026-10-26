import { z } from 'zod';
import { analysisSchema, politicsSchema } from './politics-schema';
import type { GameState } from '../types/game';
import { indexSchema, isoDate, leverValueSchema, REGION_IDS } from '../data/reality/schema';
import { AGE_BANDS, CORE_VALUES, DOMAIN_IDS, PROFILE_IDS } from '../types/simulation';
import { ATTRIBUTE_IDS, PROMISE_TYPES, ROLE_IDS, type AttributeId } from '../types/people';
import { INVESTMENT_KINDS } from '../types/party';
import { currentLawSchema, presetSchema, rulesets } from '../data/rulesets';
import { deepFreeze, stateHash } from '../engine/simulation/determinism';
import { MAX_COMMANDS, REALITY_PACK_ID, replay } from '../engine/simulation/engine';

export const MAX_SAVE_BYTES = 8_000_000;
const districtId = z.string().regex(/^kr2024-\d{3}$/);
const personId = z.string().regex(/^pol-\d{3}$/);
const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('CREATE_PARTY'), name: z.string().max(100), shortName: z.string().max(100), color: z.string().max(20), values: z.tuple([z.enum(CORE_VALUES), z.enum(CORE_VALUES), z.enum(CORE_VALUES)]) }),
  z.strictObject({ type: z.literal('SET_STAFF_LEVEL'), level: z.number().int().min(0).max(4) }),
  z.strictObject({ type: z.literal('START_POLICY_RESEARCH'), domain: z.enum(DOMAIN_IDS) }),
  z.strictObject({ type: z.literal('COMMISSION_INTERNAL_SURVEY') }),
  z.strictObject({ type: z.literal('ADVANCE_WEEK') }),
  z.strictObject({ type: z.literal('RESPOND_INBOX'), messageId: z.string().max(100) }),
  z.strictObject({ type: z.literal('SET_PLATFORM_DRAFT'), leverId: z.string().max(100), value: leverValueSchema }),
  z.strictObject({ type: z.literal('PUBLISH_PLATFORM'), leverId: z.string().max(100) }),
  z.strictObject({ type: z.literal('RECRUIT_POLITICIAN'), politicianId: z.string().max(20), role: z.enum(ROLE_IDS), promises: z.array(z.enum(PROMISE_TYPES)).max(3) }),
  z.strictObject({ type: z.literal('ASSIGN_ROLE'), politicianId: z.string().max(20), role: z.enum(ROLE_IDS) }),
  z.strictObject({ type: z.literal('INVEST_REGION'), regionId: z.enum(REGION_IDS), kind: z.enum(INVESTMENT_KINDS), intensity: z.number().int().min(1).max(3) }),
  z.strictObject({ type: z.literal('SET_TARGET_DISTRICT'), districtId: districtId, targeted: z.boolean() }),
  z.strictObject({ type: z.literal('NOMINATE_DISTRICT'), districtId: districtId, method: z.enum(['primary', 'strategic', 'none']), candidateIds: z.array(personId).max(5) }),
  z.strictObject({ type: z.literal('SET_LIST'), politicianIds: z.array(personId).max(30) }),
  z.strictObject({ type: z.literal('SET_CAMPAIGN'), districtId: districtId, intensity: z.number().int().min(0).max(5) }),
  z.strictObject({ type: z.literal('SET_MESSAGES'), national: z.enum(DOMAIN_IDS).nullable(), secondary: z.array(z.enum(DOMAIN_IDS)).max(5) }),
  z.strictObject({ type: z.literal('SET_LEADER_FOCUS'), districtId: districtId.nullable() }),
]);
const q6 = z.number().int().min(0).max(1_000_000);
const finalPushSchema = z.strictObject({ nationalMessage: z.enum(DOMAIN_IDS).nullable(), secondaryMessages: z.array(z.enum(DOMAIN_IDS)).max(5), leaderFocus: districtId.nullable(),
  campaign: z.record(districtId, z.number().int().min(1).max(5)), effort: z.record(districtId, q6), spent: z.record(districtId, z.number().int().nonnegative()) });
const counts = z.record(z.string(), z.number().int().nonnegative());
const electionSchema = z.strictObject({ date: isoDate, rulesetId: z.string(), nationalSwing: z.record(z.string(), z.number().int().min(-100000).max(100000)),
  districts: z.array(z.strictObject({ id: districtId, votes: counts, winner: z.string(), playerCandidate: personId.nullable() })).max(400),
  listVotes: counts, eligible: z.array(z.string()).max(10), listSeats: counts, districtSeats: counts, totalSeats: counts,
  playerListElected: z.array(personId).max(30), playerDistrictElected: z.array(districtId).max(400), cohortSupport: z.record(z.string(), q6),
  deposits: z.strictObject({ paid: z.number().int().nonnegative(), refunded: z.number().int().nonnegative() }), reimbursement: z.number().int().nonnegative(),
  outcome: z.enum(['in_parliament', 'extra_parliamentary']) });
const nominationsSchema = z.strictObject({
  targets: z.array(districtId).max(30),
  districts: z.record(districtId, z.strictObject({ politicianId: personId, method: z.enum(['primary', 'strategic']), participants: z.array(personId).max(5), nominatedAt: isoDate })),
  list: z.array(personId).max(30), primaryParticipants: z.array(personId).max(80), registeredAt: isoDate.nullable(),
});
const positionSchema = z.strictObject({ draftValue: leverValueSchema, publishedValue: leverValueSchema.nullable(), publishedAt: isoDate.nullable(),
  lastDirectionalValue: leverValueSchema.nullable(), lastDirectionalAt: isoDate.nullable(), reversalPenalty: indexSchema });
const probability = z.number().int().min(0).max(1_000_000);
const score = z.number().int().min(0).max(100);
const politicianSchema = z.strictObject({ id: z.string().regex(/^pol-\d{3}$/), name: z.string().min(1).max(10), gender: z.enum(['female', 'male']), age: z.number().int().min(18).max(100),
  background: z.string().max(40), regionId: z.enum(REGION_IDS), origin: z.literal('GENERATED'), generatedAt: isoDate,
  attributes: z.strictObject(Object.fromEntries(ATTRIBUTE_IDS.map(id => [id, score])) as Record<AttributeId, typeof score>),
  policyExpertise: z.record(z.enum(DOMAIN_IDS), score), valueLean: z.partialRecord(z.enum(CORE_VALUES), probability), domainInterest: z.record(z.enum(DOMAIN_IDS), score),
  status: z.enum(['prospect', 'recruited', 'declined', 'unavailable']), availableUntil: isoDate, cooldownUntil: isoDate.nullable(), trust: score,
  role: z.enum(ROLE_IDS).nullable(), recruitedAt: isoDate.nullable() });
const promiseSchema = z.strictObject({ id: z.string().regex(/^promise-\d{3}$/), politicianId: z.string().regex(/^pol-\d{3}$/), type: z.enum(PROMISE_TYPES), madeAt: isoDate,
  due: z.union([isoDate, z.literal('NOMINATION')]), status: z.enum(['pending', 'kept', 'broken']), resolvedAt: isoDate.nullable() });
const stateSchema = z.strictObject({
  schemaVersion: z.literal(11), phase: z.literal('C2'), seed: z.number().int().min(0).max(0xffffffff),
  playerParty: z.strictObject({ id: z.literal('player'), name: z.string(), shortName: z.string(), color: z.string(),
    values: z.tuple([z.enum(CORE_VALUES), z.enum(CORE_VALUES), z.enum(CORE_VALUES)]), foundedAt: isoDate }).nullable(),
  resources: z.strictObject({ money: z.number().int().nonnegative(), staffCapacity: z.number().int().nonnegative(), agendaSlots: z.number().int().nonnegative() }).nullable(),
  finance: z.strictObject({ members: z.number().int().nonnegative(), initialMoney: z.number().int().nonnegative(), arrears: z.number().int().nonnegative(), staffLevel: z.number().int().min(0).max(4), ledgerTruncatedSum: z.number().int(),
    ledger: z.array(z.strictObject({ date: isoDate, kind: z.enum(['dues', 'payroll', 'hiring', 'research', 'survey', 'recruitment', 'organization', 'nomination', 'deposit', 'campaign', 'reimbursement']), amount: z.number().int(), balanceAfter: z.number().int().nonnegative(), ref: z.string() })).max(100) }).nullable(),
  regionalOrganization: z.record(z.enum(REGION_IDS), z.strictObject({ members: z.number().int().nonnegative(), level: z.number().int().min(0).max(100), office: z.boolean(),
    investments: z.array(z.strictObject({ kind: z.enum(INVESTMENT_KINDS), intensity: z.number().int().min(1).max(3), startedAt: isoDate, completesAt: isoDate })).max(4), lastActivity: isoDate,
    scouting: z.strictObject({ until: isoDate, intensity: z.number().int().min(1).max(3) }).nullable(), forum: z.strictObject({ until: isoDate, intensity: z.number().int().min(1).max(3) }).nullable() })).or(z.strictObject({})),
  research: z.array(z.strictObject({ domain: z.enum(DOMAIN_IDS), startedAt: isoDate, completesAt: isoDate })).max(6),
  politicians: z.array(politicianSchema).max(80),
  promises: z.array(promiseSchema).max(240), recruitmentReputation: z.number().int().min(0).max(100).nullable(),
  brandInconsistency: z.number().int().min(0).max(1_000_000),
  nominations: nominationsSchema, finalPush: finalPushSchema, election: electionSchema.nullable(),
  internalSurveys: z.array(z.strictObject({ date: isoDate, margin: z.number().int().min(0).max(1_000_000), analysis: analysisSchema, voteFlow: z.record(z.string(), z.record(z.string(), z.number().int().min(0).max(1_000_000))) })).max(12),
  rngState: z.record(z.string(), z.number().int().min(1).max(0xffffffff)),
  realityPackId: z.string(), realityPackAsOf: isoDate,
  simulationStartDate: isoDate, politics: politicsSchema,
  platforms: z.array(z.strictObject({ partyId: z.string(), positions: z.record(z.string(), positionSchema) })).min(5).max(6),
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
  rulesetId: z.enum(rulesets.presets.map(p => p.rulesetId) as [string, ...string[]]),
  electionRuleset: presetSchema.extend({ electionDate: isoDate, currentLaw: currentLawSchema }).strict(),
  rulesetSnapshot: z.strictObject({
    rulesetId: z.string(), kind: z.literal('opinion_only'), label: z.string(),
    status: z.literal('GAME_ASSUMPTION'), listSeats: z.number().int().positive(), legalThresholdVoteShare: probability, electabilityKnee: probability,
    calendar: z.strictObject({ startDate: isoDate, lastWeeklyDate: isoDate, electionDate: isoDate }),
  }),
  date: isoDate, tick: z.number().int().min(1).max(78), status: z.enum(['founding', 'active', 'phase_complete']),
  inbox: z.array(z.strictObject({
    id: z.string(), date: isoDate, sender: z.string(), title: z.string(), body: z.string(),
    priority: z.enum(['Critical', 'Action Required', 'Important', 'Report', 'FYI']), read: z.boolean(),
  })).max(60),
  events: z.array(z.strictObject({ id: z.string(), date: isoDate,
    type: z.enum(['PARTY_CREATED', 'STAFF_CHANGED', 'RESEARCH_STARTED', 'RESEARCH_COMPLETED', 'SURVEY_COMMISSIONED', 'RECRUITMENT_ACCEPTED', 'RECRUITMENT_DECLINED', 'ROLE_ASSIGNED', 'PROMISE_KEPT', 'PROMISE_BROKEN', 'INVESTMENT_STARTED', 'INVESTMENT_COMPLETED', 'ORGANIZATION_DECAYED', 'TARGET_SET', 'PRIMARY_HELD', 'NOMINATED', 'NOMINATION_WITHDRAWN', 'LIST_SET', 'REGISTRATION_CLOSED', 'CAMPAIGN_SET', 'MESSAGES_SET', 'LEADER_FOCUS_SET', 'ELECTION_HELD', 'SESSION_STARTED', 'WEEK_ADVANCED', 'MONTH_BOUNDARY', 'INBOX_READ', 'PLATFORM_DRAFTED', 'PLATFORM_PUBLISHED', 'AI_PLATFORM_SHIFT', 'GOVERNMENT_ENACTED', 'POLL_PUBLISHED']), detail: z.string(),
  })).max(MAX_COMMANDS + 400),
  commandLog: z.array(commandSchema).max(MAX_COMMANDS),
});
const envelopeSchema = z.strictObject({ format: z.literal('HOC_KOREA_SAVE'), version: z.literal(1), checksum: z.string().regex(/^[a-f0-9]{16}$/), state: stateSchema });
export function serializeSave(state: GameState): string {
  return JSON.stringify({ format: 'HOC_KOREA_SAVE', version: 1, checksum: stateHash(state), state }, null, 2);
}
export function deserializeSave(text: string): GameState {
  if (text.length > MAX_SAVE_BYTES || new TextEncoder().encode(text).byteLength > MAX_SAVE_BYTES) throw new Error('세이브 파일이 너무 큽니다 (최대 8MB).');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('올바른 JSON 파일이 아닙니다.'); }
  if (raw && typeof raw === 'object' && 'state' in raw && raw.state && typeof raw.state === 'object' &&
    'schemaVersion' in raw.state && raw.state.schemaVersion === 1) {
    throw new Error('Phase A 프리뷰 세이브(스키마 1)는 현재 버전(스키마 11)과 호환되지 않습니다. 기존 JSON 내보내기 파일을 보관하고 새 프리뷰를 시작하세요.');
  }
  if (raw && typeof raw === 'object' && 'state' in raw && raw.state && typeof raw.state === 'object' && 'phase' in raw.state && raw.state.phase === 'B1') {
    throw new Error('B1 개발 프리뷰 세이브는 C2 정치 모형과 호환되지 않습니다. 기존 JSON을 보관하고 새 C2 프리뷰를 시작하세요.');
  }
  if (raw && typeof raw === 'object' && 'state' in raw && raw.state && typeof raw.state === 'object' && 'schemaVersion' in raw.state && raw.state.schemaVersion === 2) {
    throw new Error('B2 세이브(스키마 2)는 현재 버전(스키마 11)과 호환되지 않습니다. 기존 JSON을 보관하고 새 프리뷰를 시작하세요.');
  }
  if (raw && typeof raw === 'object' && 'state' in raw && raw.state && typeof raw.state === 'object' && 'schemaVersion' in raw.state && raw.state.schemaVersion === 3) {
    throw new Error('C1 세이브(스키마 3)는 현재 버전(스키마 11)과 호환되지 않습니다. 기존 JSON을 보관하고 새 프리뷰를 시작하세요.');
  }
  if (raw && typeof raw === 'object' && 'state' in raw && raw.state && typeof raw.state === 'object' && 'schemaVersion' in raw.state && raw.state.schemaVersion === 4) {
    throw new Error('C2a 세이브(스키마 4)는 현재 버전(스키마 11)과 호환되지 않습니다. 기존 JSON을 보관하고 새 프리뷰를 시작하세요.');
  }
  if (raw && typeof raw === 'object' && 'state' in raw && raw.state && typeof raw.state === 'object' && 'schemaVersion' in raw.state && raw.state.schemaVersion === 5) {
    throw new Error('C2b 세이브(스키마 5)는 현재 버전(스키마 11)과 호환되지 않습니다. 기존 JSON을 보관하고 새 프리뷰를 시작하세요.');
  }
  if (raw && typeof raw === 'object' && 'state' in raw && raw.state && typeof raw.state === 'object' && 'schemaVersion' in raw.state && raw.state.schemaVersion === 6) {
    throw new Error('C2c 세이브(스키마 6)는 현재 버전(스키마 11)과 호환되지 않습니다. 기존 JSON을 보관하고 새 프리뷰를 시작하세요.');
  }
  if (raw && typeof raw === 'object' && 'state' in raw && raw.state && typeof raw.state === 'object' && 'schemaVersion' in raw.state && raw.state.schemaVersion === 7) {
    throw new Error('D1 세이브(스키마 7)는 교정된 정치 모형 B3(스키마 8)와 호환되지 않습니다. 기존 JSON을 보관하고 새 프리뷰를 시작하세요.');
  }
  if (raw && typeof raw === 'object' && 'state' in raw && raw.state && typeof raw.state === 'object' && 'schemaVersion' in raw.state && raw.state.schemaVersion === 8) {
    throw new Error('D2 세이브(스키마 8)는 공천·명부가 추가된 현재 버전(스키마 11)과 호환되지 않습니다. 기존 JSON을 보관하고 새 프리뷰를 시작하세요.');
  }
  if (raw && typeof raw === 'object' && 'state' in raw && raw.state && typeof raw.state === 'object' && 'schemaVersion' in raw.state && raw.state.schemaVersion === 9) {
    throw new Error('D3 세이브(스키마 9)는 Final Push와 선거 결과가 추가된 현재 버전(스키마 11)과 호환되지 않습니다. 기존 JSON을 보관하고 새 프리뷰를 시작하세요.');
  }
  if (raw && typeof raw === 'object' && 'state' in raw && raw.state && typeof raw.state === 'object' && 'schemaVersion' in raw.state && raw.state.schemaVersion === 10) {
    throw new Error('E1 세이브(스키마 10)는 브랜드 일관성이 추가된 현재 버전(스키마 11)과 호환되지 않습니다. 기존 JSON을 보관하고 새 프리뷰를 시작하세요.');
  }
  const parsed = envelopeSchema.safeParse(raw);
  if (!parsed.success) throw new Error('지원하지 않는 세이브 버전이거나 파일 구조가 잘못되었습니다.');
  const { state, checksum } = parsed.data;
  if (stateHash(state) !== checksum) throw new Error('세이브 무결성 검사에 실패했습니다. 파일이 변경되었거나 손상되었습니다.');
  if (state.realityPackId !== REALITY_PACK_ID) throw new Error('현실 데이터 기준이 다른 개발 프리뷰 세이브입니다. 기존 JSON을 보관하고 새 프리뷰를 시작하세요.');
  let replayed: GameState;
  try { replayed = replay(state.seed, state.commandLog, state.rulesetId); } catch { throw new Error('세이브 명령 기록이 유효하지 않습니다.'); }
  if (stateHash(replayed) !== checksum) throw new Error('세이브 상태와 명령 재생 결과가 다릅니다.');
  return deepFreeze(state);
}
