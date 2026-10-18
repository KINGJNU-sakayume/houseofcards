import type { Command, GameState } from '../../types/game';
import { dispatchCommand } from './engine';
import { stateHash } from './determinism';

export interface EngineRequest { id: number; state: GameState; command: Command }
export type EngineResponse = { id: number; ok: true; state: GameState; hash: string }
  | { id: number; ok: false; error: string };
export function handleEngineRequest(request: EngineRequest): EngineResponse {
  try {
    const state = dispatchCommand(request.state, request.command);
    return { id: request.id, ok: true, state, hash: stateHash(state) };
  } catch (error) {
    return { id: request.id, ok: false, error: error instanceof Error ? error.message : '엔진 오류' };
  }
}
