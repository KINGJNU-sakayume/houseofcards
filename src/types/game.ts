import type { Cohort, GovernmentPolicy, IssueState, PartyPlatform } from './simulation';
import type { OpinionRuleset, PoliticsState } from './politics';
import type { Finance, InternalSurvey, PlayerParty, Research, Resources } from './party';
import type { CoreValue, DomainId } from './simulation';
import type { PartyPromise, Politician, PromiseType, RoleId } from './people';
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
  | { type: 'CREATE_PARTY'; name: string; shortName: string; color: string; values: [CoreValue, CoreValue, CoreValue] }
  | { type: 'SET_STAFF_LEVEL'; level: number }
  | { type: 'START_POLICY_RESEARCH'; domain: DomainId }
  | { type: 'COMMISSION_INTERNAL_SURVEY' }
  | { type: 'SET_PLATFORM_DRAFT'; leverId: string; value: number }
  | { type: 'PUBLISH_PLATFORM'; leverId: string }
  | { type: 'RECRUIT_POLITICIAN'; politicianId: string; role: RoleId; promises: PromiseType[] }
  | { type: 'ASSIGN_ROLE'; politicianId: string; role: RoleId };
export interface InboxMessage {
  id: string;
  date: ISODate;
  sender: string;
  title: string;
  body: string;
  priority: 'Critical' | 'Action Required' | 'Important' | 'Report' | 'FYI';
  read: boolean;
}
export interface GameEvent {
  id: string;
  date: ISODate;
  type: 'SESSION_STARTED' | 'WEEK_ADVANCED' | 'MONTH_BOUNDARY' | 'INBOX_READ' | 'PLATFORM_DRAFTED' | 'PLATFORM_PUBLISHED' | 'AI_PLATFORM_SHIFT' | 'GOVERNMENT_ENACTED' | 'POLL_PUBLISHED' | 'PARTY_CREATED' | 'STAFF_CHANGED' | 'RESEARCH_STARTED' | 'RESEARCH_COMPLETED' | 'SURVEY_COMMISSIONED' | 'RECRUITMENT_ACCEPTED' | 'RECRUITMENT_DECLINED' | 'ROLE_ASSIGNED' | 'PROMISE_KEPT' | 'PROMISE_BROKEN';
  detail: string;
}
export interface GameState {
  schemaVersion: 5;
  phase: 'C2';
  playerParty: PlayerParty | null;
  resources: Resources | null;
  finance: Finance | null;
  regionalOrganization: Record<string, { members: number; level: number }>;
  research: Research[];
  internalSurveys: InternalSurvey[];
  // Generated virtual Full politicians, id order, at most 80 ever (C2).
  politicians: Politician[];
  promises: PartyPromise[];
  // 0–100, null before founding; lowered by broken promises, recovers monthly.
  recruitmentReputation: number | null;
  seed: number;
  rngState: Record<string, number>;
  realityPackId: string;
  realityPackAsOf: ISODate;
  simulationStartDate: ISODate;
  platforms: PartyPlatform[];
  governmentPolicy: GovernmentPolicy;
  issues: IssueState[];
  cohorts: Cohort[];
  politics: PoliticsState;
  rulesetId: 'parallel_46_open';
  rulesetSnapshot: OpinionRuleset;
  date: ISODate;
  tick: number;
  status: 'founding' | 'active' | 'phase_complete';
  inbox: InboxMessage[];
  events: GameEvent[];
  commandLog: Command[];
}
