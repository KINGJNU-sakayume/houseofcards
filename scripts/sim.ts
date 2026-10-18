import { createGame, dispatchCommand, replay } from '../src/engine/simulation/engine';
import { stateHash } from '../src/engine/simulation/determinism';
import { deserializeSave, serializeSave } from '../src/persistence/codec';
import { SCALE } from '../src/engine/simulation/math';

export function assertFoundations(state: ReturnType<typeof createGame>) {
  if (state.cohorts.length !== 96 || state.cohorts.reduce((s, c) => s + c.weight, 0) !== SCALE || state.cohorts.some(c => c.weight < 0)) throw new Error('Invalid cohorts');
  for (const issue of state.issues) {
    for (const value of [issue.severity, issue.salience, ...Object.values(issue.drivers)]) {
      if (!Number.isSafeInteger(value) || value < 0 || value > 10000) throw new Error(`Invalid issue ${issue.id}`);
    }
  }
  // canonical hashing also rejects NaN/Infinity anywhere in state.
}

const position = process.argv.indexOf('--seeds');
const count = position < 0 ? 20 : Number(process.argv[position + 1]);
if (!Number.isInteger(count) || count < 1 || count > 10000) throw new Error('--seeds must be an integer in [1, 10000]');
const hashes: string[] = [];
for (let seed = 0; seed < count; seed++) {
  let state = createGame(seed);
  assertFoundations(state);
  while (state.status === 'active') {
    state = dispatchCommand(state, { type: 'ADVANCE_WEEK' });
    assertFoundations(state);
  }
  const hash = stateHash(state);
  if (state.tick !== 78 || state.date !== '2028-04-10' || stateHash(replay(seed, state.commandLog)) !== hash || stateHash(deserializeSave(serializeSave(state))) !== hash) {
    throw new Error(`B1 regression at seed ${seed}`);
  }
  hashes.push(hash);
}
console.log(JSON.stringify({ phase: 'B1', scope: 'monthly issues/96 conditional cohorts/replay/save; voter model, AI, polls and election balance NOT implemented', seeds: count, inclusiveMondays: 78, advancesPerSeed: 77, passed: true, batchHash: stateHash(hashes) }, null, 2));
