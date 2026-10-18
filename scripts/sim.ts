import { createGame, dispatchCommand, replay } from '../src/engine/simulation/engine';
import { stateHash } from '../src/engine/simulation/determinism';
import { deserializeSave, serializeSave } from '../src/persistence/codec';

const position = process.argv.indexOf('--seeds');
const count = position < 0 ? 20 : Number(process.argv[position + 1]);
if (!Number.isInteger(count) || count < 1 || count > 10000) throw new Error('--seeds must be an integer in [1, 10000]');
const hashes: string[] = [];
for (let seed = 0; seed < count; seed++) {
  let state = createGame(seed);
  while (state.status === 'active') state = dispatchCommand(state, { type: 'ADVANCE_WEEK' });
  const hash = stateHash(state);
  if (state.tick !== 78 || state.date !== '2028-04-10' || stateHash(replay(seed, state.commandLog)) !== hash || stateHash(deserializeSave(serializeSave(state))) !== hash) {
    throw new Error(`Foundation regression at seed ${seed}`);
  }
  hashes.push(hash);
}
console.log(JSON.stringify({ phase: 'A', scope: 'calendar/replay/save only; AI and election balance NOT implemented', seeds: count, inclusiveMondays: 78, advancesPerSeed: 77, passed: true, batchHash: stateHash(hashes) }, null, 2));
