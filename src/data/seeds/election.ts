import { z } from 'zod';
import data from './election.json' with { type: 'json' };
import { deepFreeze } from '../../engine/simulation/determinism';
import { isoDate } from '../reality/schema';
const n = z.number().int().nonnegative().max(1_000_000);
const q = z.number().int().min(0).max(1_000_000);
export const electionModelSchema = z.strictObject({
  modelVersion: z.literal('D4.1'), label: z.literal('GAME_MODEL'), note: z.string(),
  finalPush: z.strictObject({ start: isoDate, maxIntensity: n.min(1).max(5), weeklyMoneyPerIntensity: n, weeklyStaffPerIntensity: n, leaderStaff: n, leaderIntensity: n.max(5),
    messageAgendaSlots: n, maxSecondaryMessages: n.max(5), nationalExposure: q, secondaryExposure: q, effortPerIntensityWeek: q, organizationBase: q, organizationPerPoint: q.max(10000),
    campaignUtility: q, campaignAwareness: q }),
  electionDay: z.strictObject({ note: z.string(), nationalSwingRelative: q.max(200000), districtSwing: q.max(100000) }),
});
export const electionModel = deepFreeze(electionModelSchema.parse(data));
