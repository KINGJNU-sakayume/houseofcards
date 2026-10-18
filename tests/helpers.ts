import { createGame, dispatchCommand } from '../src/engine/simulation/engine';
import type { Command } from '../src/types/game';
import { partyManagement } from '../src/data/seeds/party-management';
export const foundingCommand: Extract<Command, { type: 'CREATE_PARTY' }> = { type: 'CREATE_PARTY', name: '내일의 정당', shortName: '내일', color: partyManagement.palette[0]!, values: ['housing', 'safety-net', 'science'] };
export const createFoundedGame = (seed: number) => dispatchCommand(createGame(seed), foundingCommand);
