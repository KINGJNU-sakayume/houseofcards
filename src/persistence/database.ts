import type { GameState } from '../types/game';
import { deserializeSave, serializeSave } from './codec';

export type SaveSlot = 'autosave' | 'manual';
export const DATABASE_NAME = 'house-of-cards-korea';
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('IndexedDB를 사용할 수 없습니다. JSON 내보내기를 이용하세요.')); return; }
    const request = indexedDB.open(DATABASE_NAME, 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore('saves');
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      }
    };
    request.onerror = () => reject(new Error('저장소를 열 수 없습니다. 브라우저 저장 권한을 확인하세요.'));
    request.onblocked = () => { blocked = true; reject(new Error('다른 탭이 저장소를 사용 중입니다. 다른 탭을 닫아 주세요.')); };
  });
}
export async function writeSave(slot: SaveSlot, state: GameState): Promise<void> {
  const encoded = serializeSave(state);
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('saves', 'readwrite');
      transaction.objectStore('saves').put(encoded, slot);
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(new Error('저장하지 못했습니다. 저장 공간을 확인하거나 JSON으로 내보내세요.'));
    });
  } finally { database.close(); }
}
export async function readSave(slot: SaveSlot): Promise<GameState | null> {
  const database = await openDatabase();
  try {
    const encoded = await new Promise<unknown>((resolve, reject) => {
      const transaction = database.transaction('saves', 'readonly');
      const request = transaction.objectStore('saves').get(slot);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = transaction.onerror = () => reject(new Error('저장 파일을 읽지 못했습니다.'));
    });
    if (encoded === undefined) return null;
    if (typeof encoded !== 'string') throw new Error('저장된 데이터 형식이 잘못되었습니다.');
    return deserializeSave(encoded);
  } finally { database.close(); }
}
