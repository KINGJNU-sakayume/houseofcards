import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createGame, dispatchCommand } from '../src/engine/simulation/engine';
import { stateHash } from '../src/engine/simulation/determinism';
import { deserializeSave, MAX_SAVE_BYTES, serializeSave } from '../src/persistence/codec';
import { readSave, writeSave } from '../src/persistence/database';

describe('save/load', () => {
  it('round trips state, named stream positions and command history exactly', () => {
    let game = createGame(99);
    for (let i = 0; i < 20; i++) game = dispatchCommand(game, { type: 'ADVANCE_WEEK' });
    const restored = deserializeSave(serializeSave(game));
    expect(stateHash(restored)).toBe(stateHash(game));
    expect(restored.rngState).toEqual(game.rngState);
    expect(stateHash(dispatchCommand(restored, { type: 'ADVANCE_WEEK' }))).toBe(stateHash(dispatchCommand(game, { type: 'ADVANCE_WEEK' })));
  });
  it('rejects tampering, malformed files, unknown versions and impossible replay', () => {
    const game = createGame(1);
    expect(() => deserializeSave('nope')).toThrow('JSON');
    expect(() => deserializeSave(serializeSave(game).replace('"version": 1', '"version": 2'))).toThrow('버전');
    expect(() => deserializeSave(serializeSave(game).replace('"seed": 1', '"seed": 2'))).toThrow('무결성');
    expect(() => deserializeSave(serializeSave({ ...game, date: '2026-10-26' }))).toThrow('재생');
    expect(() => deserializeSave(serializeSave({ ...game, rulesetSnapshot: { ...game.rulesetSnapshot, label: 'tampered' } }))).toThrow('재생');
    expect(() => deserializeSave(' '.repeat(MAX_SAVE_BYTES + 1))).toThrow('2MB');
  });
  it('uses separate IndexedDB autosave and manual slots', async () => {
    expect(await readSave('autosave')).toBeNull();
    const game = createGame(4);
    const advanced = dispatchCommand(game, { type: 'ADVANCE_WEEK' });
    await writeSave('manual', game);
    await writeSave('autosave', advanced);
    expect(stateHash(await readSave('manual'))).toBe(stateHash(game));
    expect(stateHash(await readSave('autosave'))).toBe(stateHash(advanced));
  });
  it('explains an older baseline without silently regenerating its politics', () => {
    const game = createGame(1);
    const previous = serializeSave({ ...game, realityPackId: 'kr-b1-2026-10-18' });
    expect(() => deserializeSave(previous)).toThrow('현실 데이터 기준');
    expect(() => deserializeSave(previous)).toThrow('JSON을 보관');
  });
});
