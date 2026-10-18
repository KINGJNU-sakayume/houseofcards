import { z } from 'zod';
import { isoDate } from '../data/reality/schema';
import { CORE_VALUES, DOMAIN_IDS } from '../types/simulation';
const q = z.number().int().min(0).max(1_000_000);
const signed = z.number().int().min(-1_000_000).max(1_000_000);
const vector = z.record(z.string(), q);
const pollGroup = z.strictObject({ sampleSize: z.number().int().min(1).max(100000), results: z.record(z.string(), z.strictObject({ point: q, low: q, high: q, margin: q })) });
export const analysisSchema = z.strictObject({ date: isoDate, playerPartyId: z.string().nullable(), currentSupport: vector, potentialSupport: vector, byAge: z.record(z.string(), vector), byRegion: z.record(z.string(), vector), groupMass: vector,
  neutralViability: q, barriers: z.strictObject({ awareness: signed, viability: signed, priorLoyalty: signed, policyMismatch: signed, ownership: signed }).nullable(),
});
export const politicsSchema = z.strictObject({
  parties: z.array(z.strictObject({ partyId: z.string(), declaredValues: z.array(z.enum(CORE_VALUES)), identity: z.record(z.enum(CORE_VALUES), q),
    expertise: z.record(z.enum(DOMAIN_IDS), q), ownership: z.record(z.enum(DOMAIN_IDS), q), prior: z.record(z.string(), z.number().int().min(0).max(4)),
    ai: z.strictObject({ month: z.string(), quarter: z.string(), changesThisMonth: z.number().int().min(0).max(1), changesThisQuarter: z.number().int().min(0).max(2) }),
  })).min(5).max(6),
  perceptions: z.record(z.string(), z.record(z.string(), z.strictObject({ awareness: q, loyalty: q }))),
  governmentApproval: signed, governmentApprovalBaseline: signed, governmentApprovalStatus: z.enum(['REAL_FACT', 'UNVERIFIED_ASSUMPTION']),
  viability: vector, viabilityInput: z.strictObject({ asOf: isoDate.nullable(), shares: vector }),
  pollHouses: z.array(z.strictObject({ id: z.string(), name: z.string(), effects: z.record(z.string(), signed) })).min(1).max(10),
  polls: z.array(z.strictObject({ id: z.string(), date: isoDate, houseId: z.string(), houseName: z.string(), designEffectPermille: z.number().int().min(1000).max(3000),
    houseEffects: z.record(z.string(), signed), national: pollGroup, byAge: z.record(z.string(), pollGroup), byRegion: z.record(z.string(), pollGroup),
  })).max(40),
  analysis: analysisSchema,
});
