import { z } from 'zod';
import data from './real-name-denylist.json' with { type: 'json' };
// Owner-supplied names that generated virtual people must never use, e.g.
// [{ "name": "홍길동", "note": "why it is blocked (no claims about the person)" }].
// Kept empty until the owner supplies a sourced list; never filled from memory.
export const denylistSchema = z.array(z.strictObject({ name: z.string().trim().min(1).max(40), note: z.string().max(200) }));
export type NameDenylist = readonly z.infer<typeof denylistSchema>[number][];
export const realNameDenylist: NameDenylist = Object.freeze(denylistSchema.parse(data));
