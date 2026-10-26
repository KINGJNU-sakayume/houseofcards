import type { CoreValue, DomainId } from './simulation';
import type { SupportAnalysis } from './politics';
export const PLAYER_PARTY_ID = 'player';
export interface PlayerParty {
  id: typeof PLAYER_PARTY_ID; name: string; shortName: string; color: string;
  values: [CoreValue, CoreValue, CoreValue]; foundedAt: string;
}
export interface Resources { money: number; staffCapacity: number; agendaSlots: number }
export interface Finance {
  members: number; initialMoney: number; arrears: number; staffLevel: number; ledgerTruncatedSum: number;
  ledger: { date: string; kind: 'dues' | 'payroll' | 'hiring' | 'research' | 'survey' | 'recruitment' | 'organization' | 'nomination' | 'deposit' | 'campaign' | 'reimbursement'; amount: number; balanceAfter: number; ref: string }[];
}
export interface Research { domain: DomainId; startedAt: string; completesAt: string }
// voteFlow: E2 Vote Flow estimate at the survey date (from → to, Q6 of the electorate).
export interface InternalSurvey { date: string; margin: number; analysis: SupportAnalysis; voteFlow: Record<string, Record<string, number>> }
export const INVESTMENT_KINDS = ['member_drive', 'local_office', 'candidate_scouting', 'policy_forum'] as const;
export type InvestmentKind = typeof INVESTMENT_KINDS[number];
export interface RegionInvestment { kind: InvestmentKind; intensity: number; startedAt: string; completesAt: string }
// Regional organization (Slice §22): distinct from a person's Organization
// attribute and from national party strength.
export interface RegionOrganization {
  members: number; level: number; office: boolean; investments: RegionInvestment[];
  lastActivity: string;
  scouting: { until: string; intensity: number } | null;
  forum: { until: string; intensity: number } | null;
}
