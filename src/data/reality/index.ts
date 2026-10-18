import reality from './b1.json' with { type: 'json' };
import seeds from '../seeds/b1.json' with { type: 'json' };
import leverData from '../policy/levers.json' with { type: 'json' };
import { deepFreeze } from '../../engine/simulation/determinism';
import { leverSchema, realityPackSchema, seedPackSchema } from './schema';

export const realityPack = deepFreeze(realityPackSchema.parse(reality));
export const seedPack = deepFreeze(seedPackSchema.parse(seeds));
export const policyLevers = deepFreeze(leverData.map(lever => leverSchema.parse(lever)));
