import type { Cohort, GovernmentPolicy, IssueState, PartyPlatform } from './simulation';
import type { OpinionRuleset, PoliticsState } from './politics';
import type { Finance, InternalSurvey, InvestmentKind, PlayerParty, RegionOrganization, Research, Resources } from './party';
import type { CoreValue, DomainId } from './simulation';
import type { PartyPromise, Politician, PromiseType, RoleId } from './people';
import type { CurrentLaw, RulesetPreset } from '../data/rulesets';
export type ISODate = string;
export interface CalendarConfig {
  startDate: ISODate;
  lastWeeklyDate: ISODate;
  electionDate: ISODate;
}
// The save's full election ruleset: a GAME_ASSUMPTION preset plus the current
// statutory values (REAL_FACT, docs/data/law-review-phase-d.json).
export type ElectionRulesetSnapshot = RulesetPreset & { electionDate: ISODate; currentLaw: CurrentLaw };
export type Command = { type: 'ADVANCE_WEEK' } | { type: 'RESPOND_INBOX'; messageId: string }
  | { type: 'CREATE_PARTY'; name: string; shortName: string; color: string; values: [CoreValue, CoreValue, CoreValue] }
  | { type: 'SET_STAFF_LEVEL'; level: number }
  | { type: 'START_POLICY_RESEARCH'; domain: DomainId }
  | { type: 'COMMISSION_INTERNAL_SURVEY' }
  | { type: 'SET_PLATFORM_DRAFT'; leverId: string; value: number }
  | { type: 'PUBLISH_PLATFORM'; leverId: string }
  | { type: 'RECRUIT_POLITICIAN'; politicianId: string; role: RoleId; promises: PromiseType[] }
  | { type: 'ASSIGN_ROLE'; politicianId: string; role: RoleId }
  | { type: 'INVEST_REGION'; regionId: string; kind: InvestmentKind; intensity: number }
  | { type: 'SET_TARGET_DISTRICT'; districtId: string; targeted: boolean }
  | { type: 'NOMINATE_DISTRICT'; districtId: string; method: NominationMethod | 'none'; candidateIds: string[] }
  | { type: 'SET_LIST'; politicianIds: string[] }
  | { type: 'SET_CAMPAIGN'; districtId: string; intensity: number }
  | { type: 'SET_MESSAGES'; national: DomainId | null; secondary: DomainId[] }
  | { type: 'SET_LEADER_FOCUS'; districtId: string | null };
export type NominationMethod = 'primary' | 'strategic';
// D3 (Slice §26): the player's targets, district nominees and list. Deposits
// are charged when a candidate is named and returned if the nomination is
// withdrawn before registration closes.
export interface DistrictNomination { politicianId: string; method: NominationMethod; participants: string[]; nominatedAt: ISODate }
export interface Nominations {
  targets: string[];
  districts: Record<string, DistrictNomination>;
  list: string[];
  primaryParticipants: string[];
  registeredAt: ISODate | null;
}
// D4 Final Push (Slice §26): weekly allocation from 2028-01-17. Effort is Q6
// accumulated campaign work per district; spent is Money for reimbursement.
export interface FinalPush {
  nationalMessage: DomainId | null; secondaryMessages: DomainId[]; leaderFocus: string | null;
  campaign: Record<string, number>; effort: Record<string, number>; spent: Record<string, number>;
}
export interface DistrictResult { id: string; votes: Record<string, number>; winner: string; playerCandidate: string | null }
// D4 election result (Slice §27 minimum items), computed once on the last tick.
export interface ElectionResult {
  date: ISODate; rulesetId: string;
  nationalSwing: Record<string, number>;
  districts: DistrictResult[];
  listVotes: Record<string, number>;
  eligible: string[]; listSeats: Record<string, number>; districtSeats: Record<string, number>; totalSeats: Record<string, number>;
  playerListElected: string[]; playerDistrictElected: string[];
  cohortSupport: Record<string, number>;
  deposits: { paid: number; refunded: number }; reimbursement: number;
  outcome: 'in_parliament' | 'extra_parliamentary';
}
// U1 monthly record for charts (bounded): end-of-month money, members, current support and issue indices.
export interface MonthlyRecord { date: ISODate; money: number; members: number; support: number; issues: Record<string, [number, number]> }
export interface InboxLink { route: string; label: string }
export interface InboxMessage {
  id: string;
  date: ISODate;
  sender: string;
  title: string;
  body: string;
  priority: 'Critical' | 'Action Required' | 'Important' | 'Report' | 'FYI';
  read: boolean;
  link: InboxLink | null;
}
export interface GameEvent {
  id: string;
  date: ISODate;
  type: 'SESSION_STARTED' | 'WEEK_ADVANCED' | 'MONTH_BOUNDARY' | 'INBOX_READ' | 'PLATFORM_DRAFTED' | 'PLATFORM_PUBLISHED' | 'AI_PLATFORM_SHIFT' | 'GOVERNMENT_ENACTED' | 'POLL_PUBLISHED' | 'PARTY_CREATED' | 'STAFF_CHANGED' | 'RESEARCH_STARTED' | 'RESEARCH_COMPLETED' | 'SURVEY_COMMISSIONED' | 'RECRUITMENT_ACCEPTED' | 'RECRUITMENT_DECLINED' | 'ROLE_ASSIGNED' | 'PROMISE_KEPT' | 'PROMISE_BROKEN' | 'INVESTMENT_STARTED' | 'INVESTMENT_COMPLETED' | 'ORGANIZATION_DECAYED' | 'TARGET_SET' | 'PRIMARY_HELD' | 'NOMINATED' | 'NOMINATION_WITHDRAWN' | 'LIST_SET' | 'REGISTRATION_CLOSED' | 'CAMPAIGN_SET' | 'MESSAGES_SET' | 'LEADER_FOCUS_SET' | 'ELECTION_HELD';
  detail: string;
}
export interface GameState {
  schemaVersion: 16;
  phase: 'C2';
  playerParty: PlayerParty | null;
  resources: Resources | null;
  finance: Finance | null;
  regionalOrganization: Record<string, RegionOrganization>;
  research: Research[];
  internalSurveys: InternalSurvey[];
  // Generated virtual Full politicians, id order, at most 80 ever (C2).
  politicians: Politician[];
  promises: PartyPromise[];
  // 0–100, null before founding; lowered by broken promises, recovers monthly.
  recruitmentReputation: number | null;
  // E2 brand consistency (Q6): 0 = consistent; scales only the player's trust.
  brandInconsistency: number;
  nominations: Nominations;
  finalPush: FinalPush;
  election: ElectionResult | null;
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
  rulesetId: string;
  rulesetSnapshot: OpinionRuleset;
  electionRuleset: ElectionRulesetSnapshot;
  date: ISODate;
  tick: number;
  status: 'founding' | 'active' | 'phase_complete';
  inbox: InboxMessage[];
  history: MonthlyRecord[];
  events: GameEvent[];
  commandLog: Command[];
}
