import { z } from 'zod';
import data from './nomination.json' with { type: 'json' };
import { deepFreeze } from '../../engine/simulation/determinism';
import { isoDate } from '../reality/schema';
const n = z.number().int().nonnegative().max(1_000_000);
const q = z.number().int().min(0).max(1_000_000);
const weights = <K extends string>(keys: readonly K[]) => z.strictObject(Object.fromEntries(keys.map(k => [k, q])) as Record<K, typeof q>)
  .refine(w => (Object.values(w) as number[]).reduce((a, b) => a + b, 0) === 1_000_000, 'weights must sum to 1,000,000');
export const nominationModelSchema = z.strictObject({
  modelVersion: z.literal('D3.0'), label: z.literal('GAME_MODEL'), note: z.string(),
  gates: z.strictObject({ targets: isoDate, nominations: isoDate, list: isoDate, registration: isoDate }),
  targets: z.strictObject({ max: n.min(1).max(30), note: z.string() }),
  primary: z.strictObject({ minCandidates: n.min(2), maxCandidates: n.min(2).max(5), money: n, staffCapacity: n,
    weights: weights(['localBase', 'recognition', 'campaigning', 'broadAppeal', 'negotiation'] as const), noise: q,
    participantTrust: n.max(100), winnerTrust: n.max(100), organizationLevel: n.max(100) }),
  strategic: z.strictObject({ staffCapacity: n, passedOverTrust: n.max(100), negotiationSoftening: q, organizationLevel: n.max(100) }),
  candidate: z.strictObject({ note: z.string(), quality: weights(['localBase', 'campaigning', 'broadAppeal'] as const), utilityWeight: q,
    awarenessFromRecognition: q, awarenessFromOrganization: q }),
}).superRefine((v, ctx) => {
  const g = v.gates;
  if (!(g.targets < g.nominations && g.nominations < g.list && g.list < g.registration)) ctx.addIssue({ code: 'custom', message: 'gates must be in calendar order' });
  if (v.primary.minCandidates > v.primary.maxCandidates) ctx.addIssue({ code: 'custom', message: 'primary.minCandidates must not exceed maxCandidates' });
});
export const nominationModel = deepFreeze(nominationModelSchema.parse(data));
