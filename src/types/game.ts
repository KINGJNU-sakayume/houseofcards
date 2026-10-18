import type { Cohort, GovernmentPolicy, IssueState, PartyPlatform } from './simulation';
export type ISODate = string;
export interface CalendarConfig {
  startDate: ISODate;
  lastWeeklyDate: ISODate;
  electionDate: ISODate;
}
export interface FoundationRuleset {
  rulesetId: 'foundation_calendar_only';
  kind: 'foundation';
  label: string;
  status: 'GAME_ASSUMPTION';
  calendar: CalendarConfig;
}
// Election allocation and all legal parameters belong to Phase D data presets.
export interface ElectionRuleset {
  rulesetId: string;
  label: string;
  electionDate: ISODate;
  districtSeats: number;
  listSeats: number;
  listMethod: 'parallel' | 'semi_compensatory';
  listAllocation: 'hare_largest_remainder';
  districtRule: 'plurality_single_member';
  legalThreshold: null | { voteShare: number; orDistrictSeats: number };
  semiCompensatory: null | {
    coupling: number; cap: number; satelliteMode: 'none' | 'major_parties_neutralize';
  };
  officialCampaignDays: number;
  dualCandidacy: boolean;
  listGenderRule: 'odd_positions_female' | 'none';
  listSizeUi: { min: number; max: number };
  partyRevocation: { seatsEq: number; listVoteShareBelow: number };
  deposit: { perDistrictCandidate: number; partyList: number; refundFullAbove: number; refundHalfAbove: number };
  campaignCostReimbursement: { fullAbove: number; halfAbove: number };
}
export type Command = { type: 'ADVANCE_WEEK' } | { type: 'RESPOND_INBOX'; messageId: string }
  | { type: 'SET_PLATFORM_DRAFT'; leverId: string; value: number }
  | { type: 'PUBLISH_PLATFORM'; leverId: string };
export interface InboxMessage {
  id: string;
  date: ISODate;
  sender: string;
  title: string;
  body: string;
  priority: 'Important' | 'Report' | 'FYI';
  read: boolean;
}
export interface GameEvent {
  id: string;
  date: ISODate;
  type: 'SESSION_STARTED' | 'WEEK_ADVANCED' | 'MONTH_BOUNDARY' | 'INBOX_READ' | 'PLATFORM_DRAFTED' | 'PLATFORM_PUBLISHED';
  detail: string;
}
export interface GameState {
  schemaVersion: 2;
  phase: 'B1';
  seed: number;
  rngState: Record<string, number>;
  realityPackId: string;
  realityPackAsOf: ISODate;
  simulationStartDate: ISODate;
  platforms: PartyPlatform[];
  governmentPolicy: GovernmentPolicy;
  issues: IssueState[];
  cohorts: Cohort[];
  rulesetId: 'foundation_calendar_only';
  rulesetSnapshot: FoundationRuleset;
  date: ISODate;
  tick: number;
  status: 'active' | 'phase_complete';
  inbox: InboxMessage[];
  events: GameEvent[];
  commandLog: Command[];
}
