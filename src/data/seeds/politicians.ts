import { z } from 'zod';
import data from './politicians.json' with { type: 'json' };
import { CORE_VALUES, DOMAIN_IDS } from '../../types/simulation';
import { isoDate } from '../reality/schema';
import { deepFreeze } from '../../engine/simulation/determinism';
import { ATTRIBUTE_IDS, PROMISE_TYPES, ROLE_IDS } from '../../types/people';
const n = z.number().int().nonnegative().max(1000);
const q = z.number().int().min(0).max(1_000_000);
const bias = z.number().int().min(-50).max(50);
export const politicianModelSchema = z.strictObject({
  modelVersion: z.literal('C2.1'), label: z.literal('GAME_MODEL'),
  generator: z.strictObject({ initial: n, monthlyMin: n, monthlyMax: n, cap: n.max(80), guaranteeCount: n, guaranteeBy: isoDate, availabilityWeeks: n.min(1),
    ageMin: n, ageMax: n, attributeBase: n.max(100), attributeSpread: n.min(1).max(101), expertiseBase: n.max(100), expertiseSpread: n.min(1).max(101), interestSpread: n.min(1).max(101),
    valueInterestWeight: n, leanValues: n.min(1).max(CORE_VALUES.length), leanMin: q, leanMax: q, initialTrust: n.max(100) }),
  surnames: z.array(z.string().min(1).max(2)).min(10),
  givenNames: z.array(z.string().min(1).max(3)).min(20),
  backgrounds: z.array(z.strictObject({ id: z.string().regex(/^[a-z-]+$/), label: z.string().min(1), weight: n.min(1),
    attributes: z.partialRecord(z.enum(ATTRIBUTE_IDS), bias), domains: z.partialRecord(z.enum(DOMAIN_IDS), bias), values: z.array(z.enum(CORE_VALUES)).min(1) })).min(11),
  recruitment: z.strictObject({ staffCapacity: n, money: z.number().int().nonnegative().max(1_000_000), base: q, matchWeight: q, momentumWeight: q, trustWeight: q, reputationWeight: q,
    minProbability: q, maxProbability: q, roleAppeal: z.strictObject(Object.fromEntries(ROLE_IDS.map(r => [r, q])) as Record<typeof ROLE_IDS[number], typeof q>),
    promiseWeight: z.strictObject(Object.fromEntries(PROMISE_TYPES.map(t => [t, q])) as Record<typeof PROMISE_TYPES[number], typeof q>),
    acceptTrust: n.max(100), refusalTrust: n.max(100), cooldownWeeks: n.min(1), promiseWindowWeeks: n.min(1), warningDays: n, brokenTrust: n.max(100), brokenReputation: n.max(100),
    reputationStart: n.max(100), reputationFloor: n.max(100), reputationRecovery: n.max(100), bandLow: q, bandHigh: q }),
}).superRefine((v, ctx) => {
  const g = v.generator;
  if (g.monthlyMin > g.monthlyMax || v.recruitment.minProbability > v.recruitment.maxProbability || v.recruitment.bandLow > v.recruitment.bandHigh || v.recruitment.reputationFloor > v.recruitment.reputationStart || g.ageMin > g.ageMax || g.leanMin > g.leanMax || g.initial > g.cap || g.guaranteeCount > g.cap ||
    new Set(v.surnames).size !== v.surnames.length || new Set(v.givenNames).size !== v.givenNames.length || new Set(v.backgrounds.map(b => b.id)).size !== v.backgrounds.length ||
    v.surnames.length * v.givenNames.length < g.cap * 10)
    ctx.addIssue({ code: 'custom', message: 'Invalid politician generator ranges, duplicates or too few name combinations' });
});
export type PoliticianModel = z.infer<typeof politicianModelSchema>;
export const politicianModel = deepFreeze(politicianModelSchema.parse(data));
