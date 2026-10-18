import { z } from 'zod';
import data from './party-management.json' with { type: 'json' };
import { CORE_VALUES, DOMAIN_IDS } from '../../types/simulation';
import { deepFreeze } from '../../engine/simulation/determinism';
const n = z.number().int().nonnegative().max(1_000_000_000);
const q = z.number().int().min(0).max(1_000_000);
export const partyManagementSchema = z.strictObject({
  modelVersion: z.literal('C1.0'), label: z.literal('GAME_MODEL'),
  palette: z.array(z.string().regex(/^#[0-9a-f]{6}$/)).min(8),
  newParty: z.strictObject({ money: n, staffCapacity: n, agendaSlots: n, membersMin: n, membersMax: n,
    regionalLevelMin: z.number().int().min(0).max(100), regionalLevelMax: z.number().int().min(0).max(100),
    awareness: q, viability: q, ownership: q, oppositionAlignment: n, expertise: z.record(z.enum(DOMAIN_IDS), q) }),
  finance: z.strictObject({ payingRate: q, monthlyDues: n, baseStaffCapacity: n, agendaCap: n }),
  staffLevels: z.array(z.strictObject({ level: n, weeklyPayroll: n, capacity: n, hiringCost: n })).length(5),
  publication: z.strictObject({ agendaSlots: n, baseStaff: n, reversalStaff: n, consistentGain: q }),
  research: z.strictObject({ money: n, staffCapacity: n, weeks: z.number().int().min(1).max(52), gain: q, expertiseCap: q, affinityDiscount: q.max(250000) }),
  survey: z.strictObject({ money: n, staffCapacity: n, margin: q }),
  valueDomainAffinity: z.record(z.enum(CORE_VALUES), z.array(z.enum(DOMAIN_IDS)).min(1)),
}).superRefine((v, ctx) => {
  if (new Set(v.palette).size !== v.palette.length || v.staffLevels.some((s, i) => s.level !== i) ||
    v.newParty.membersMin > v.newParty.membersMax || v.newParty.regionalLevelMin > v.newParty.regionalLevelMax)
    ctx.addIssue({ code: 'custom', message: 'Invalid party-management ranges or duplicate palette' });
});
export const partyManagement = deepFreeze(partyManagementSchema.parse(data));
