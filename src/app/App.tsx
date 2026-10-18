import { useEffect, useState } from 'react';
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { NAVIGATION } from '../data/content/navigation';
import { Icon } from '../components/Icon';
import { SaveDialog } from '../components/SaveDialog';
import { Home } from '../pages/Home';
import { FuturePage } from '../pages/FuturePage';
import { useGameStore } from '../state/store';

export function App() {
  const store = useGameStore();
  const [savesOpen, setSavesOpen] = useState(false);
  useEffect(() => { void useGameStore.getState().initialize(); }, []);
  const saveLabel = { idle: '자동저장 대기', saving: '저장 중…', saved: '자동저장 완료', failed: '저장 확인 필요' }[store.saveStatus];
  return <HashRouter><a href="#main" className="skip-link" onClick={event => { event.preventDefault(); document.getElementById('main')?.focus(); }}>본문으로 건너뛰기</a><div className="app-shell">
    <aside className="sidebar"><a className="brand" href="#/"><img src={`${import.meta.env.BASE_URL}mark.svg`} width="42" height="42" alt="" /><span>HOUSE OF CARDS<small>K O R E A</small></span></a>
      <div className="office-label"><span className="office-symbol">H</span><div><strong>새로운 시작</strong><small>정당 창당 준비 · Phase A</small></div></div>
      <p className="nav-caption">MANAGEMENT</p><nav aria-label="주 내비게이션">{NAVIGATION.map(item => <NavLink key={item.path} end={item.path === '/'} to={item.path} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon name={item.icon} /><span>{item.label}</span>{item.phase !== 'A' && <span className="nav-phase">{item.phase}</span>}</NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="simulation-label"><span />SAVE SIMULATION</div><p>선택으로 만들어가는<br />대한민국 정치 시뮬레이션</p><span className="version">v0.1 · Foundation Preview</span></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="topbar-date"><Icon name="clock" size={18} /><strong>{store.game.date.replaceAll('-', '.')}</strong><span>월요일</span></div><div className="topbar-actions"><span className={`save-indicator ${store.saveStatus}`} role="status"><i />{saveLabel}</span><button className="button save-button" aria-label="저장 / 불러오기" disabled={!store.ready || store.busy} onClick={() => setSavesOpen(true)}><Icon name="save" size={17} /><span>저장 / 불러오기</span></button><button className="button primary advance-button" disabled={!store.ready || store.busy || store.game.status === 'phase_complete'} onClick={() => void store.dispatch({ type: 'ADVANCE_WEEK' })}>{!store.ready ? '불러오는 중…' : store.busy ? '처리 중…' : store.game.status === 'phase_complete' ? 'Phase A 일정 완료' : '다음 주로'}<Icon name="arrow" size={17} /></button></div></header>
      <div className="preview-banner"><span className="badge">DEVELOPMENT PREVIEW</span><span>현재는 Phase A입니다. 달력과 저장이 동작하며, 정치·선거 시뮬레이션은 아직 구현되지 않았습니다.</span></div>
      {store.error && !savesOpen && <div role="alert" className="global-error"><span>{store.error}</span><button onClick={store.clearError} className="icon-button" aria-label="오류 알림 닫기"><Icon name="close" size={16} /></button></div>}
      <main id="main" tabIndex={-1}><Routes><Route path="/" element={<Home />} /><Route path="*" element={<FuturePage />} /></Routes></main>
      <footer><span>HOUSE OF CARDS: KOREA</span><span>이 세이브의 선거제도: 달력 프리뷰 · 선거 배분 미구현. 실제 2028년 선거제도를 가정하지 않습니다.</span></footer>
    </div>
  </div>{savesOpen && <SaveDialog onClose={() => setSavesOpen(false)} />}</HashRouter>;
}
