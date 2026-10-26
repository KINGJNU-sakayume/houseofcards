import { z } from 'zod';
import data from './organization.json' with { type: 'json' };
import { deepFreeze } from '../../engine/simulation/determinism';
import { INVESTMENT_KINDS } from '../../types/party';
const n = z.number().int().nonnegative().max(1_000_000);
const q = z.number().int().min(0).max(1_000_000);
const kind = z.strictObject({ money: n, staffCapacity: n, weeks: n.min(1).max(26), maxIntensity: n.min(1).max(3), level: n.max(100), members: n });
export const organizationModelSchema = z.strictObject({
  modelVersion: z.literal('C2.1'), label: z.literal('GAME_MODEL'),
  kinds: z.strictObject(Object.fromEntries(INVESTMENT_KINDS.map(k => [k, kind])) as Record<typeof INVESTMENT_KINDS[number], typeof kind>),
  officeRent: n, officeStaff: n, decayPerMonth: n.max(100), officeDecayPerMonth: n.max(100), decayGraceDays: n, boostWeeks: n.min(1),
  scoutingWeightPerIntensity: n.max(20), levelExposure: q.max(10000), forumExposure: q, profileScale: q, profileCap: q,
  recruitExpertiseScale: q, chairExpertiseBonus: q, recruitExpertiseRate: q,
}).superRefine((v, ctx) => {
  if (v.officeDecayPerMonth > v.decayPerMonth) ctx.addIssue({ code: 'custom', message: 'Office decay must not exceed base decay' });
});
export const organizationModel = deepFreeze(organizationModelSchema.parse(data));
