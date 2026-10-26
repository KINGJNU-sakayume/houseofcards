export const DOMAIN_IDS = ['housing', 'family', 'pension', 'healthcare', 'industry-ai', 'political-reform'] as const;
export type DomainId = typeof DOMAIN_IDS[number];
export const DOMAIN_LABELS: Record<DomainId, string> = {
  housing: '주택', family: '저출생·가족', pension: '연금', healthcare: '의료',
  'industry-ai': '산업·AI', 'political-reform': '정치개혁',
};
export const CORE_VALUES = ['reform', 'housing', 'generations', 'market', 'safety-net', 'decentralization', 'science', 'labour', 'climate', 'efficiency'] as const;
export type CoreValue = typeof CORE_VALUES[number];
export const AGE_BANDS = ['18-29', '30-44', '45-59', '60+'] as const;
export type AgeBand = typeof AGE_BANDS[number];
export const PROFILE_IDS = ['housing-pressure', 'family-work', 'asset-retirement'] as const;
export type ProfileId = typeof PROFILE_IDS[number];
export type LeverValue = 0 | 1 | 2 | 3 | 4;
export interface LeverDefinition {
  id: string; name: string; domain: DomainId; axis: string;
  steps: [string, string, string, string, string];
  range: { min: 0; max: 4; statusQuo: 2 };
  valueTags: Partial<Record<CoreValue, number>>;
  fiscalImplication: { costPerStep: number; note: string };
  implementationDelayMonths: number;
  effectChannels: { driverId: string; coefficient: number }[];
  uncertainty: { label: 'GAME_MODEL'; note: string; shockSensitivity: number };
}
export interface PlatformPosition {
  draftValue: LeverValue; publishedValue: LeverValue | null; publishedAt: string | null;
  // Keep the last directional publication even across a return to status quo.
  lastDirectionalValue: LeverValue | null; lastDirectionalAt: string | null;
  reversalPenalty: number;
}
export interface PartyPlatform { partyId: string; positions: Record<string, PlatformPosition> }
export interface EnactedLever { value: LeverValue; history: { value: LeverValue; enactedAt: string }[] }
export interface GovernmentPolicy { partyId: string; levers: Record<string, EnactedLever> }
// Indices use integer hundredths of a point: [0, 10000] = [0, 100].
export interface IssueState {
  id: DomainId; severity: number; salience: number; trend: number;
  structuralPressure: number; lastUpdated: string; drivers: Record<string, number>;
}
export interface Cohort {
  id: string; regionId: string; ageBand: AgeBand; profileId: ProfileId;
  // Q6 probability; exactly 1_000_000 across all cohorts. Never store floats.
  weight: number; preferences: Record<string, LeverValue>;
  salience: Record<DomainId, number>; partyAttachment: Record<string, number>;
  politicalAttention: number; turnoutTendency: number; tacticalVotingTendency: number;
  governmentEvaluationSensitivity: number;
}
