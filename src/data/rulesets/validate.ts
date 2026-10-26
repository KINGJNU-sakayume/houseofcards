import { rulesetsSchema } from '.';
import { politicalModel } from '../seeds/political-model';

interface ReviewItem { id: string; status: string; value?: Record<string, unknown> }
// Every statutory value in the rulesets must equal the DD1 law review record,
// and no ruleset may carry an unverified legal value.
export function validateRulesets(data: unknown, lawReview: { id: string; items: ReviewItem[]; unverified: unknown[] }): string[] {
  const errors: string[] = [];
  const parsed = rulesetsSchema.safeParse(data);
  if (!parsed.success) return parsed.error.issues.map(i => `rulesets.${i.path.join('.')}: ${i.message}`);
  const law = parsed.data.currentLaw;
  if (lawReview.id !== law.reviewId) errors.push('rulesets: law review id mismatch');
  if (lawReview.unverified.length) errors.push('rulesets: law review lists unverified items');
  const item = (id: string) => {
    const found = lawReview.items.find(i => i.id === id);
    if (!found || found.status !== 'REAL_FACT') errors.push(`rulesets: missing REAL_FACT law review item ${id}`);
    return (found?.value ?? {}) as Record<string, unknown>;
  };
  const expect = (label: string, actual: unknown, expected: unknown) => { if (actual !== expected) errors.push(`rulesets: ${label} ${String(actual)} ≠ law review ${String(expected)}`); };
  expect('district deposit', law.deposit.perDistrictCandidateKrw, item('deposit-district').amountKrw);
  expect('list deposit', law.deposit.perListCandidateKrw, item('deposit-list').amountKrwPerCandidate);
  const refund = item('deposit-refund');
  expect('refund full', law.deposit.refundFullAbove, refund.districtFullAbove); expect('refund half', law.deposit.refundHalfAbove, refund.districtHalfAbove);
  expect('list refund', law.deposit.listRefundIfAnyElected, refund.listFullIfAnyElected);
  const cost = item('campaign-cost-reimbursement');
  expect('cost full', law.campaignCostReimbursement.fullAbove, cost.districtFullAbove); expect('cost half', law.campaignCostReimbursement.halfAbove, cost.districtHalfAbove);
  expect('cost list', law.campaignCostReimbursement.listFullIfAnyElected, cost.listFullIfAnyElected);
  expect('dual candidacy', law.dualCandidacy, item('dual-candidacy').dualCandidacy);
  const gender = item('list-gender-rule');
  expect('list gender rule', law.listGenderRule, gender.listGenderRule); expect('list female share', law.listFemaleShareAtLeast, gender.listFemaleShareAtLeast);
  expect('campaign days', law.officialCampaignDays, item('campaign-period').officialCampaignDays);
  expect('district tie break', law.districtTieBreak, item('district-winner').tieBreak);
  const seats = item('seats-current');
  for (const preset of parsed.data.presets) {
    // Current statutory seat numbers are used as the game presets' assumption.
    expect(`${preset.rulesetId} district seats`, preset.districtSeats, seats.districtSeats);
    expect(`${preset.rulesetId} list seats`, preset.listSeats, seats.listSeats);
  }
  if (item('party-registration-revocation') && parsed.data.presets.some(p => p.partyRevocation && p.uiEnabled && !p.label.includes('시나리오')))
    errors.push('rulesets: a party revocation rule needs an explicit fictional-scenario label');
  const scenario = politicalModel.scenario, preset = parsed.data.presets.find(p => p.rulesetId === parsed.data.defaultRulesetId)!;
  if (scenario.rulesetId !== preset.rulesetId || scenario.listSeats !== preset.listSeats || scenario.legalThresholdVoteShare !== (preset.legalThreshold?.voteShare ?? 0))
    errors.push('political-model.scenario disagrees with the default ruleset');
  return errors;
}
