import { z } from 'zod';
import { AGE_BANDS, CORE_VALUES, DOMAIN_IDS, PROFILE_IDS } from '../../types/simulation';

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}, 'Invalid calendar date');
const provenance = {
  id: z.string().min(1),
  status: z.enum(['REAL_FACT', 'GAME_ASSUMPTION', 'UNVERIFIED_ASSUMPTION']),
  source: z.string().min(1).optional(),
  verifiedAt: isoDate.optional(),
  asOf: isoDate.optional(),
  metric: z.boolean().optional(),
  sourceQuality: z.enum(['primary', 'secondary_news']).optional(),
  note: z.string().optional(),
  resolution: z.literal('UNRESOLVED').optional(),
};
const fact = <T extends z.ZodType>(value: T) => z.strictObject({ ...provenance, value });
export const stringFact = fact(z.string().min(1));
export const numberFact = fact(z.number().finite().nonnegative());
const genericFact = fact(z.union([z.string(), z.number().finite(), z.boolean(), z.null()]));
const topicFact = fact(z.array(z.string().min(1)).min(1));
export const indexSchema = z.number().int().min(0).max(10000);
const signedIndex = z.number().int().min(-10000).max(10000);
const coreTag = z.enum(CORE_VALUES);
export const leverValueSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
const domainIndexRecord = z.record(z.enum(DOMAIN_IDS), indexSchema);
export const leverSchema = z.strictObject({
  id: z.string().min(1), name: z.string().min(1), domain: z.enum(DOMAIN_IDS), axis: z.string().min(1),
  range: z.strictObject({ min: z.literal(0), max: z.literal(4), statusQuo: z.literal(2) }),
  valueTags: z.partialRecord(coreTag, z.number().int().min(1).max(10)),
  fiscalImplication: z.strictObject({ costPerStep: z.number().int().min(-10).max(10), note: z.string().min(1) }),
  implementationDelayMonths: z.number().int().min(0).max(120),
  effectChannels: z.array(z.strictObject({ driverId: z.string(), coefficient: signedIndex })).min(1),
  uncertainty: z.strictObject({ label: z.literal('GAME_MODEL'), note: z.string().min(1), shockSensitivity: indexSchema }),
});
export const REGION_IDS = ['seoul', 'gyeonggi-incheon', 'chungcheong', 'tk', 'pk', 'honam', 'gangwon', 'jeju'] as const;
export const PROVINCE_IDS = ['seoul', 'busan', 'daegu', 'incheon', 'gwangju', 'daejeon', 'ulsan', 'sejong', 'gyeonggi', 'gangwon', 'chungbuk', 'chungnam', 'jeonbuk', 'jeonnam', 'gyeongbuk', 'gyeongnam', 'jeju'] as const;
export const realityPackSchema = z.strictObject({
  id: z.string().min(1),
  asOf: isoDate,
  completeness: z.enum(['FOUNDATION_ONLY', 'SIMULATION_FOUNDATIONS', 'BASELINE']),
  governingPartyId: z.string().nullable(),
  parties: z.array(z.strictObject({ id: z.string().min(1), name: stringFact, shortName: stringFact, platformTags: topicFact.optional() })),
  politicians: z.array(z.strictObject({ id: z.string().min(1), name: stringFact, partyId: z.string().nullable() })),
  assembly: z.strictObject({ statutorySeats: numberFact, occupiedSeats: numberFact, vacancies: numberFact }).nullable(),
  indicators: z.array(numberFact),
  facts: z.array(genericFact),
  provinceRegions: z.array(z.strictObject({ provinceId: z.enum(PROVINCE_IDS), regionId: z.enum(REGION_IDS) })),
  electionDate: stringFact.extend({ scheduleStatus: z.enum(['SCHEDULED', 'CONFIRMED']).optional() }).optional(),
  electionLawState: z.literal('UNRESOLVED').optional(),
  regionAgeMarginals: z.array(z.strictObject({ regionId: z.enum(REGION_IDS), ageBand: z.enum(AGE_BANDS), mass: numberFact })).optional(),
  calibrationTargets: z.array(z.strictObject({
    regionId: z.union([z.enum(REGION_IDS), z.literal('national')]), partyId: z.string(),
    kind: z.enum(['latest-election', 'recent-poll-aggregate']), target: genericFact,
  })).optional(),
});
export const seedPackSchema = z.strictObject({
  id: z.string().min(1), realityPackId: z.string().min(1),
  fictionalPoliticians: z.array(z.strictObject({ id: z.string().min(1), name: z.string().min(1) })),
  issueConfigs: z.array(z.strictObject({
    id: z.enum(DOMAIN_IDS), severity: indexSchema, salience: indexSchema,
    structuralPressure: z.number().int().min(-1000).max(1000),
    inertia: z.number().int().min(0).max(999), salienceInertia: z.number().int().min(0).max(999),
    shockBound: z.number().int().min(0).max(500),
    drivers: z.array(z.strictObject({ id: z.string(), initial: indexSchema, weight: z.number().int().positive().max(1000) })).min(1),
    crossDrivers: z.array(z.strictObject({ domain: z.enum(DOMAIN_IDS), coefficient: z.number().int().min(-1000).max(1000) })),
  })).length(6),
  cohortProfiles: z.array(z.strictObject({ id: z.enum(PROFILE_IDS), preferenceTags: z.partialRecord(coreTag, leverValueSchema), salience: domainIndexRecord, politicalAttention: indexSchema, turnoutTendency: indexSchema, tacticalVotingTendency: indexSchema, governmentEvaluationSensitivity: indexSchema })).length(3),
  profileConditionals: z.array(z.strictObject({ regionId: z.enum(REGION_IDS), ageBand: z.enum(AGE_BANDS), masses: z.array(z.number().int().nonnegative().max(10000)).length(3) })).length(32),
  tagInterpretation: z.record(z.string(), z.array(coreTag)),
  platformPriorWeights: z.array(z.number().int().positive().max(1000)).length(5),
  partyAttachmentMasses: z.record(z.string(), z.number().int().positive().max(1000)),
  nonLeverSignals: z.partialRecord(coreTag, z.array(z.string())),
  seedLabel: z.string().min(1),
});
export type RealityPack = z.infer<typeof realityPackSchema>;
export type SeedPack = z.infer<typeof seedPackSchema>;
