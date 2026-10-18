import { create } from 'zustand';
import type { Command, GameState } from '../types/game';
import { createGame } from '../engine/simulation/engine';
import { readSave, writeSave } from '../persistence/database';
import { deserializeSave } from '../persistence/codec';
import { EngineClient } from '../workers/client';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';
interface Store {
  game: GameState;
  ready: boolean;
  busy: boolean;
  saveStatus: SaveStatus;
  notice: string;
  error: string | null;
  engineMode: 'worker' | 'main';
  initialize: () => Promise<void>;
  dispatch: (command: Command) => Promise<void>;
  saveManual: () => Promise<void>;
  loadManual: () => Promise<void>;
  importText: (text: string) => Promise<void>;
  newGame: (seed: number) => Promise<void>;
  clearError: () => void;
}
let client: EngineClient | undefined;
let initializing: Promise<void> | undefined;
const message = (error: unknown) => error instanceof Error ? error.message : '작업 중 오류가 발생했습니다.';

export const useGameStore = create<Store>((set, get) => {
  const persist = async (game: GameState) => {
    set({ saveStatus: 'saving' });
    try { await writeSave('autosave', game); set({ saveStatus: 'saved' }); }
    catch (error) { set({ saveStatus: 'failed', error: message(error) }); }
  };
  const perform = async (operation: () => Promise<void>) => {
    if (!get().ready || get().busy) return;
    set({ busy: true, error: null });
    try { await operation(); }
    catch (error) { set({ error: message(error) }); }
    finally { set({ busy: false }); }
  };
  return {
    game: createGame(20261019), ready: false, busy: false, saveStatus: 'idle', notice: '', error: null, engineMode: 'main',
    initialize: () => {
      initializing ??= (async () => {
        client ??= new EngineClient();
        try {
          const game = await readSave('autosave');
          if (game) set({ game, saveStatus: 'saved', notice: '이전 자동저장 세이브를 복원했습니다.' });
        } catch (error) { set({ error: message(error), saveStatus: 'failed' }); }
        finally { set({ ready: true, engineMode: client.mode }); }
      })();
      return initializing;
    },
    dispatch: command => perform(async () => {
      client ??= new EngineClient();
      const game = await client.dispatch(get().game, command);
      set({ game, engineMode: client.mode, notice: command.type === 'ADVANCE_WEEK' ? '다음 주로 진행했습니다.' : command.type === 'SET_PLATFORM_DRAFT' ? '공약 초안을 저장했습니다. 공표 전에는 영향이 없습니다.' : command.type === 'PUBLISH_PLATFORM' ? '공약을 공표했습니다. 다음 월간 분석에서 전달·인식 변화를 확인하세요.' : command.type === 'RESPOND_INBOX' ? '편지를 읽음으로 표시했습니다.' : '정당 관리 명령을 완료했습니다.' });
      await persist(game);
    }),
    saveManual: () => perform(async () => {
      await writeSave('manual', get().game);
      set({ notice: '수동 저장을 완료했습니다. 자동저장과 별도로 보관됩니다.' });
    }),
    loadManual: () => perform(async () => {
      const game = await readSave('manual');
      if (!game) throw new Error('아직 수동으로 저장한 세이브가 없습니다.');
      set({ game, notice: '수동 저장을 복원했습니다.' });
      await persist(game);
    }),
    importText: text => perform(async () => {
      const game = deserializeSave(text);
      set({ game, notice: '세이브를 가져왔습니다. 무결성과 명령 재생을 확인했습니다.' });
      await persist(game);
    }),
    newGame: seed => perform(async () => {
      const game = createGame(seed);
      set({ game, notice: '새 C1 프리뷰를 시작했습니다.' });
      await persist(game);
    }),
    clearError: () => set({ error: null }),
  };
});
