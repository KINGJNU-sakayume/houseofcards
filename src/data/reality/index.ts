import reality from './foundation.json';
import seeds from '../seeds/foundation.json';
import { deepFreeze } from '../../engine/simulation/determinism';
import { realityPackSchema, seedPackSchema } from './schema';

export const realityPack = deepFreeze(realityPackSchema.parse(reality));
export const seedPack = deepFreeze(seedPackSchema.parse(seeds));
