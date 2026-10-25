import type { CoreValue, DomainId } from './simulation';
// Slice §20.4: these seven plus per-domain PolicyExpertise are the only person attributes.
export const ATTRIBUTE_IDS = ['recognition', 'localBase', 'campaigning', 'organization', 'media', 'negotiation', 'broadAppeal'] as const;
export type AttributeId = typeof ATTRIBUTE_IDS[number];
export type PoliticianStatus = 'prospect' | 'recruited' | 'declined' | 'unavailable';
export interface Politician {
  id: string; name: string; gender: 'female' | 'male'; age: number; background: string; regionId: string; origin: 'GENERATED';
  generatedAt: string;
  attributes: Record<AttributeId, number>;
  policyExpertise: Record<DomainId, number>;
  valueLean: Partial<Record<CoreValue, number>>;
  domainInterest: Record<DomainId, number>;
  status: PoliticianStatus; availableUntil: string; cooldownUntil: string | null; trust: number;
}
