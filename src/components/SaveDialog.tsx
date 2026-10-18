import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../state/store';
import { MAX_SAVE_BYTES, serializeSave } from '../persistence/codec';
import { stateHash } from '../engine/simulation/determinism';
import { Icon } from './Icon';

export function SaveDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const store = useGameStore();
  const [seed, setSeed] = useState(String(store.game.seed));
  const [localError, setLocalError] = useState('');
  const [confirm, setConfirm] = useState<'new' | 'load' | 'import' | null>(null);
  const [importContent, setImportContent] = useState('');
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  function exportSave() {
    const blob = new Blob([serializeSave(store.game)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hoc-korea-${store.game.date}-${store.game.seed}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function confirmAction() {
    if (confirm === 'new') await store.newGame(Number(seed));
    if (confirm === 'load') await store.loadManual();
    if (confirm === 'import') await store.importText(importContent);
    setConfirm(null);
  }
  return <dialog ref={dialog} onCancel={onClose} className="save-dialog" aria-labelledby="save-title">
    <div className="dialog-heading"><div><p className="eyebrow">YOUR SEASON, SAVED</p><h2 id="save-title">세이브 관리</h2></div><button className="icon-button" onClick={onClose} aria-label="세이브 관리 닫기"><Icon name="close" /></button></div>
    <p className="muted">진행 상황은 이 브라우저에 자동저장됩니다. 다른 기기에서도 이어가려면 JSON 파일로 내보내세요.</p>
    <div className="save-summary"><span>{store.game.date} · {store.game.tick}주차</span><span>시드 {store.game.seed}</span></div>
    <div className="save-grid">
      <button className="button primary" disabled={store.busy} onClick={() => void store.saveManual()}>수동 저장</button>
      <button className="button" disabled={store.busy} onClick={() => setConfirm('load')}>수동 저장 불러오기</button>
      <button className="button" onClick={exportSave}>JSON 내보내기 ↓</button>
      <label className={`button file-button ${store.busy ? 'disabled' : ''}`}>JSON 가져오기 ↑<input aria-label="JSON 가져오기" type="file" accept=".json,application/json" disabled={store.busy} onChange={event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        setLocalError('');
        if (!file) return;
        if (file.size > MAX_SAVE_BYTES) { setLocalError('파일은 최대 2MB까지 가져올 수 있습니다.'); return; }
        void file.text().then(text => { setImportContent(text); setConfirm('import'); }).catch(() => setLocalError('파일을 읽지 못했습니다.'));
      }} /></label>
    </div>
    <div className="new-session"><h3>새 프리뷰 시작</h3><p className="muted">시드는 같은 선택을 같은 결과로 재현하는 번호입니다. 창당은 Phase C에서 열립니다.</p><div className="input-row"><label htmlFor="seed">시드</label><input id="seed" type="number" min="0" max="4294967295" step="1" value={seed} onChange={event => setSeed(event.target.value)} /><button className="button" disabled={store.busy || seed.trim() === '' || !Number.isInteger(Number(seed)) || Number(seed) < 0 || Number(seed) > 0xffffffff} onClick={() => setConfirm('new')}>새로 시작</button></div></div>
    {confirm && <div className="confirmation" role="group" aria-label="진행 상황 교체 확인"><p>현재 진행 상황과 자동저장을 교체합니다. 수동 저장 슬롯은 유지됩니다.</p><div className="input-row"><button className="button primary" disabled={store.busy} onClick={() => void confirmAction()}>교체하고 계속</button><button className="button" onClick={() => setConfirm(null)}>취소</button></div></div>}
    {(localError || store.error) && <p className="error" role="alert">{localError || store.error}</p>}
    <p className="dialog-status" role="status">{store.notice}</p>
    <details className="diagnostics"><summary>저장 무결성 정보</summary><p>상태 해시 <code data-testid="state-hash">{stateHash(store.game)}</code></p><p>스키마 1 · 엔진 {store.engineMode === 'worker' ? 'Web Worker' : '메인 스레드'} · 명령 {store.game.commandLog.length}개</p><p>해시는 손상 확인용이며 암호학적 서명이 아닙니다.</p></details>
  </dialog>;
}
