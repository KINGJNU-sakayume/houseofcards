import { z } from 'zod';
import data from './rulesets.json' with { type: 'json' };
import { deepFreeze } from '../../engine/simulation/determinism';
import { isoDate } from '../reality/schema';
const q = z.number().int().min(0).max(1_000_000);
const seats = z.number().int().min(0).max(1000);
const krw = z.number().int().nonnegative().max(1_000_000_000);
export const currentLawSchema = z.strictObject({
  status: z.literal('REAL_FACT'), reviewId: z.literal('law-review-phase-d'), statute: z.string().min(1), verifiedAt: isoDate, note: z.string(),
  districtRule: z.literal('plurality_single_member'), districtTieBreak: z.literal('older_candidate'), officialCampaignDays: z.number().int().min(1).max(60),
  dualCandidacy: z.boolean(), listGenderRule: z.enum(['odd_positions_female', 'none']), listFemaleShareAtLeast: q,
  deposit: z.strictObject({ perDistrictCandidateKrw: krw, perListCandidateKrw: krw, refundFullAbove: q, refundHalfAbove: q, listRefundIfAnyElected: z.boolean() }),
  campaignCostReimbursement: z.strictObject({ fullAbove: q, halfAbove: q, listFullIfAnyElected: z.boolean() }),
  listRemainderTieBreak: z.literal('lottery'),
});
export const presetSchema = z.strictObject({
  rulesetId: z.string().regex(/^[a-z0-9_]+$/), label: z.string().min(1), status: z.literal('GAME_ASSUMPTION'), uiEnabled: z.boolean(),
  districtSeats: seats.min(1), listSeats: seats, listMethod: z.enum(['parallel', 'semi_compensatory']), listAllocation: z.literal('hare_largest_remainder'),
  legalThreshold: z.strictObject({ voteShare: q, orDistrictSeats: seats }).nullable(),
  semiCompensatory: z.strictObject({ coupling: q, cap: seats, satelliteMode: z.enum(['none', 'major_parties_neutralize']) }).nullable(),
  listSizeUi: z.strictObject({ min: seats, max: seats }),
  // Revocation of a 0-seat party has no current legal basis (정당법 §44①3 held
  // unconstitutional 2014-01-28); a value here is a fictional-legislation scenario.
  partyRevocation: z.strictObject({ seatsEq: seats, listVoteShareBelow: q, scenario: z.literal('FICTIONAL_LEGISLATION') }).nullable(),
  description: z.string(),
});
export const rulesetsSchema = z.strictObject({
  modelVersion: z.literal('D1.0'), defaultRulesetId: z.string(), currentLaw: currentLawSchema, presets: z.array(presetSchema).min(1),
}).superRefine((v, ctx) => {
  const ids = v.presets.map(p => p.rulesetId);
  if (new Set(ids).size !== ids.length || !ids.includes(v.defaultRulesetId)) ctx.addIssue({ code: 'custom', message: 'Duplicate ruleset ids or missing default' });
  for (const p of v.presets) {
    if ((p.listMethod === 'semi_compensatory') !== (p.semiCompensatory !== null) || p.listSizeUi.min > p.listSizeUi.max ||
      (p.semiCompensatory && p.semiCompensatory.cap > p.listSeats)) ctx.addIssue({ code: 'custom', message: `Inconsistent preset ${p.rulesetId}` });
  }
  if (!v.presets.find(p => p.rulesetId === v.defaultRulesetId)!.uiEnabled) ctx.addIssue({ code: 'custom', message: 'Default ruleset must be selectable' });
});
export type RulesetPreset = z.infer<typeof presetSchema>;
export type CurrentLaw = z.infer<typeof currentLawSchema>;
export const rulesets = deepFreeze(rulesetsSchema.parse(data));
export function rulesetPreset(id: string): RulesetPreset {
  const preset = rulesets.presets.find(p => p.rulesetId === id);
  if (!preset) throw new Error('알 수 없는 선거제도 프리셋입니다.');
  return preset;
}
