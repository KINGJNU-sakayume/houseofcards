import { z } from 'zod';
import data from './district-model.json' with { type: 'json' };
import { deepFreeze } from '../../engine/simulation/determinism';
const q = z.number().int().min(0).max(1_000_000);
export const districtModelSchema = z.strictObject({
  modelVersion: z.literal('D2.0'), label: z.literal('GAME_MODEL'),
  viability: z.strictObject({ low: q, high: q, note: z.string() }), tacticalScale: q, residual: z.string(),
}).refine(v => v.viability.low < v.viability.high, 'viability.low must be below viability.high');
export const districtModel = deepFreeze(districtModelSchema.parse(data));
