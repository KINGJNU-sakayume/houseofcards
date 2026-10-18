import type { CoreValue, DomainId } from './simulation';

// Probabilities, perceptions and utilities use Q6 (1 = 1_000_000).
export const NONE_ID = 'none';
export type SupportVector = Record<string, number>;
export type IdentityVector = Record<CoreValue, number>;
export interface PartyPerception {
  partyId: string; declaredValues: CoreValue[]; identity: IdentityVector;
  expertise: Record<DomainId, number>; ownership: Record<DomainId, number>;
  prior: Record<string, number>;
  ai: { month: string; quarter: string; changesThisMonth: number; changesThisQuarter: number };
}
export interface CohortPerception { awareness: number; loyalty: number }
export interface BarrierEstimate {
  awareness: number; viability: number; priorLoyalty: number; policyMismatch: number; ownership: number;
}
export interface SupportAnalysis {
  playerPartyId: string | null;
  date: string; currentSupport: SupportVector; potentialSupport: SupportVector;
  byAge: Record<string, SupportVector>; byRegion: Record<string, SupportVector>;
  groupMass: Record<string, number>; barriers: BarrierEstimate | null; neutralViability: number;
}
export interface PollResult { point: number; low: number; high: number; margin: number }
export interface PollGroup { sampleSize: number; results: Record<string, PollResult> }
export interface PollHouse { id: string; name: string; effects: SupportVector }
export interface SimulatedPoll {
  id: string; date: string; houseId: string; houseName: string; designEffectPermille: number; houseEffects: SupportVector;
  national: PollGroup; byAge: Record<string, PollGroup>; byRegion: Record<string, PollGroup>;
}
export interface PoliticsState {
  parties: PartyPerception[];
  perceptions: Record<string, Record<string, CohortPerception>>;
  governmentApproval: number; governmentApprovalBaseline: number;
  governmentApprovalStatus: 'REAL_FACT' | 'UNVERIFIED_ASSUMPTION';
  viability: SupportVector; viabilityInput: { asOf: string | null; shares: SupportVector };
  pollHouses: PollHouse[]; polls: SimulatedPoll[]; analysis: SupportAnalysis;
}
export interface OpinionRuleset {
  rulesetId: 'parallel_46_open'; kind: 'opinion_only'; label: string; status: 'GAME_ASSUMPTION';
  calendar: { startDate: string; lastWeeklyDate: string; electionDate: string };
  listSeats: number; legalThresholdVoteShare: number; electabilityKnee: number;
}
