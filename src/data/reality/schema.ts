import { z } from 'zod';

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}, 'Invalid calendar date');
const provenance = {
  id: z.string().min(1),
  status: z.enum(['REAL_FACT', 'GAME_ASSUMPTION', 'UNVERIFIED_ASSUMPTION']),
  source: z.string().min(1).optional(),
  verifiedAt: isoDate.optional(),
  asOf: isoDate.optional(),
  metric: z.boolean().optional(),
};
const fact = <T extends z.ZodType>(value: T) => z.strictObject({ ...provenance, value });
export const stringFact = fact(z.string().min(1));
export const numberFact = fact(z.number().finite().nonnegative());
const genericFact = fact(z.union([z.string(), z.number().finite(), z.boolean(), z.null()]));
export const REGION_IDS = ['seoul', 'gyeonggi-incheon', 'chungcheong', 'tk', 'pk', 'honam', 'gangwon', 'jeju'] as const;
export const PROVINCE_IDS = ['seoul', 'busan', 'daegu', 'incheon', 'gwangju', 'daejeon', 'ulsan', 'sejong', 'gyeonggi', 'gangwon', 'chungbuk', 'chungnam', 'jeonbuk', 'jeonnam', 'gyeongbuk', 'gyeongnam', 'jeju'] as const;
export const realityPackSchema = z.strictObject({
  id: z.string().min(1),
  asOf: isoDate,
  completeness: z.enum(['FOUNDATION_ONLY', 'BASELINE']),
  governingPartyId: z.string().nullable(),
  parties: z.array(z.strictObject({ id: z.string().min(1), name: stringFact, shortName: stringFact })),
  politicians: z.array(z.strictObject({ id: z.string().min(1), name: stringFact, partyId: z.string().nullable() })),
  assembly: z.strictObject({ statutorySeats: numberFact, occupiedSeats: numberFact, vacancies: numberFact }).nullable(),
  indicators: z.array(numberFact),
  facts: z.array(genericFact),
  provinceRegions: z.array(z.strictObject({ provinceId: z.enum(PROVINCE_IDS), regionId: z.enum(REGION_IDS) })),
});
export const seedPackSchema = z.strictObject({
  id: z.string().min(1), realityPackId: z.string().min(1),
  fictionalPoliticians: z.array(z.strictObject({ id: z.string().min(1), name: z.string().min(1) })),
});
export type RealityPack = z.infer<typeof realityPackSchema>;
export type SeedPack = z.infer<typeof seedPackSchema>;
