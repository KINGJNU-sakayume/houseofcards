import type { Command, GameState } from '../types/game';
import { handleEngineRequest, type EngineRequest, type EngineResponse } from '../engine/simulation/protocol';
import { deepFreeze, stateHash } from '../engine/simulation/determinism';

export class EngineClient {
  private worker: Worker | null = null;
  private nextId = 0;
  private pending = new Map<number, { request: EngineRequest; resolve: (response: EngineResponse) => void; timer: ReturnType<typeof setTimeout> }>();
  constructor() {
    try {
      if (typeof Worker === 'undefined') return;
      this.worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<EngineResponse>) => {
        const pending = this.pending.get(event.data.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(event.data.id);
        pending.resolve(event.data);
      };
      this.worker.onerror = () => this.useMainThread();
      this.worker.onmessageerror = () => this.useMainThread();
    } catch { this.useMainThread(); }
  }
  get mode(): 'worker' | 'main' { return this.worker ? 'worker' : 'main'; }
  private useMainThread() {
    this.worker?.terminate();
    this.worker = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.resolve(handleEngineRequest(pending.request));
    }
    this.pending.clear();
  }
  async dispatch(state: GameState, command: Command): Promise<GameState> {
    const request = { id: ++this.nextId, state, command };
    const response = this.worker
      ? await new Promise<EngineResponse>(resolve => {
        const timer = setTimeout(() => this.useMainThread(), 8000);
        this.pending.set(request.id, { request, resolve, timer });
        try { this.worker!.postMessage(request); } catch { this.useMainThread(); }
      })
      : handleEngineRequest(request);
    if (!response.ok) throw new Error(response.error);
    if (stateHash(response.state) !== response.hash) throw new Error('Worker 상태 검사에 실패했습니다.');
    return deepFreeze(response.state);
  }
  dispose() { this.useMainThread(); }
}
