import type { CoreValue, DomainId } from './simulation';
// Slice §20.4: these seven plus per-domain PolicyExpertise are the only person attributes.
export const ATTRIBUTE_IDS = ['recognition', 'localBase', 'campaigning', 'organization', 'media', 'negotiation', 'broadAppeal'] as const;
export type AttributeId = typeof ATTRIBUTE_IDS[number];
export const ROLE_IDS = ['member', 'policy_chair', 'secretary_general'] as const;
export type RoleId = typeof ROLE_IDS[number];
export const PROMISE_TYPES = ['primary_guarantee', 'policy_chair', 'regional_priority'] as const;
export type PromiseType = typeof PROMISE_TYPES[number];
export type PoliticianStatus = 'prospect' | 'recruited' | 'declined' | 'unavailable';
export interface Politician {
  id: string; name: string; gender: 'female' | 'male'; age: number; background: string; regionId: string; origin: 'GENERATED';
  generatedAt: string;
  attributes: Record<AttributeId, number>;
  policyExpertise: Record<DomainId, number>;
  valueLean: Partial<Record<CoreValue, number>>;
  domainInterest: Record<DomainId, number>;
  status: PoliticianStatus; availableUntil: string; cooldownUntil: string | null; trust: number;
  role: RoleId | null; recruitedAt: string | null;
}
export interface PartyPromise {
  id: string; politicianId: string; type: PromiseType; madeAt: string;
  // policy_chair has a dated window; nomination promises wait for Phase D.
  due: string | 'NOMINATION'; status: 'pending' | 'kept' | 'broken'; resolvedAt: string | null;
}
