import { z } from 'zod';
import data from './political-model.json' with { type: 'json' };
import { deepFreeze } from '../../engine/simulation/determinism';
const q = z.number().int().min(0).max(1_000_000);
const count = z.number().int().positive().max(10000);
const party = z.strictObject({ awareness: q, expertise: q, ownership: q, viability: q, oppositionAlignment: z.number().int().nonnegative().max(100) });
export const politicalModelSchema = z.strictObject({
  modelVersion: z.literal('B2.1'), label: z.string(), potentialDefinition: z.literal('all-parties'),
  utility: z.strictObject({ fit: z.number().int().min(0).max(2_000_000), identity: q, trust: q, loyalty: z.number().int().min(0).max(2_000_000), government: q, viability: q, none: z.number().int().min(0).max(2_000_000) }),
  dynamics: z.strictObject({ awarenessGrowth: q, awarenessDecay: q, awarenessCap: q, ownershipRate: q, identityRate: q, loyaltyErosion: q, approvalRate: q }),
  scenario: z.strictObject({ rulesetId: z.literal('parallel_46_open'), label: z.string(), listSeats: count, legalThresholdVoteShare: q, electabilityKnee: q }),
  viability: z.strictObject({ thresholdWeight: q, thresholdWidth: z.number().int().positive().max(1_000_000), electabilityWidth: z.number().int().positive().max(1_000_000), monthlyCap: q }),
  parties: z.record(z.string(), party),
  governmentApprovalFallback: z.strictObject({ value: z.number().int().min(-1_000_000).max(1_000_000), status: z.literal('UNVERIFIED_ASSUMPTION'), note: z.string() }).nullable(),
  ai: z.strictObject({ changeChance: q, monthlyCap: count, quarterlyCap: count, diversityFloor: q, governmentQuarterlyCap: count, priorPenalty: q }),
  polling: z.strictObject({ sampleSize: count, designEffectPermille: z.number().int().min(1000).max(3000), houseEffectBound: q, analysisMargin: q, coverageBandNational: z.tuple([q, q]), houses: z.array(z.strictObject({ id: z.string(), name: z.string() })).min(1) }),
  smoke: z.strictObject({ monthlySupportChangeCap: q, maxPartySupport: q, minMajorSupport: q, calibrationTolerance: q }),
});
export const politicalModel = deepFreeze(politicalModelSchema.parse(data));
