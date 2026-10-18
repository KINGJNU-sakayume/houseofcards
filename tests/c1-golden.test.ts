import { expect, it } from 'vitest';
import golden from './fixtures/c1-golden.json' with { type: 'json' };
import { createGame, dispatchCommand, replay } from '../src/engine/simulation/engine';
import { stateHash } from '../src/engine/simulation/determinism';
import { partyManagement } from '../src/data/seeds/party-management';
import type { Command } from '../src/types/game';
it('replays the deliberately reviewed C1 founding, idle season and management/reversal goldens', () => {
  expect(partyManagement.modelVersion).toBe(golden.modelVersion);
  const initial = createGame(golden.seed);
  expect(stateHash(initial)).toBe(golden.initialHash);
  let state = dispatchCommand(initial, golden.commands[0] as Command);
  expect(stateHash(state)).toBe(golden.foundedHash);
  for (let i = 0; i < 77; i++) state = dispatchCommand(state, { type: 'ADVANCE_WEEK' });
  expect(stateHash(state)).toBe(golden.seasonEndHash);
  expect(stateHash(replay(golden.seed, golden.commands as Command[]))).toBe(golden.managementHash);
});
