import { useEffect, useState } from 'react';
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { NAVIGATION } from '../data/content/navigation';
import { Icon } from '../components/Icon';
import { SaveDialog } from '../components/SaveDialog';
import { Founding } from '../pages/Founding';
import { Party } from '../pages/Party';
import { Home } from '../pages/Home';
import { Korea } from '../pages/Korea';
import { Policy } from '../pages/Policy';
import { DataHub } from '../pages/DataHub';
import { FuturePage } from '../pages/FuturePage';
import { Politicians } from '../pages/Politicians';
import { useGameStore } from '../state/store';

export function App() {
  const store = useGameStore();
  const [savesOpen, setSavesOpen] = useState(false);
  useEffect(() => { void useGameStore.getState().initialize(); }, []);
  const saveLabel = { idle: '자동저장 대기', saving: '저장 중…', saved: '자동저장 완료', failed: '저장 확인 필요' }[store.saveStatus];
  return <HashRouter><a href="#main" className="skip-link" onClick={event => { event.preventDefault(); document.getElementById('main')?.focus(); }}>본문으로 건너뛰기</a><div className="app-shell">
    <aside className="sidebar"><a className="brand" href="#/"><img src={`${import.meta.env.BASE_URL}mark.svg`} width="42" height="42" alt="" /><span>HOUSE OF CARDS<small>K O R E A</small></span></a>
      <div className="office-label"><span className="office-symbol">H</span><div><strong>새로운 시작</strong><small>개발 프리뷰 · C2b</small></div></div>
      <p className="nav-caption">MANAGEMENT</p><nav aria-label="주 내비게이션">{NAVIGATION.map(item => <NavLink key={item.path} end={item.path === '/'} to={item.path} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon name={item.icon} /><span>{item.label}</span>{item.phase !== 'A' && <span className="nav-phase">{item.phase}</span>}</NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="simulation-label"><span />SAVE SIMULATION</div><p>선택으로 만들어가는<br />대한민국 정치 시뮬레이션</p><span className="version">v0.5 · C2b Preview</span></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="topbar-date"><Icon name="clock" size={18} /><strong>{store.game.date.replaceAll('-', '.')}</strong><span>월요일</span></div><div className="topbar-actions"><span className={`save-indicator ${store.saveStatus}`} role="status"><i />{saveLabel}</span><button className="button save-button" aria-label="저장 / 불러오기" disabled={!store.ready || store.busy} onClick={() => setSavesOpen(true)}><Icon name="save" size={17} /><span>저장 / 불러오기</span></button><button className="button primary advance-button" disabled={!store.ready || store.busy || store.game.status !== 'active'} onClick={() => void store.dispatch({ type: 'ADVANCE_WEEK' })}>{!store.ready ? '불러오는 중…' : store.busy ? '처리 중…' : store.game.status === 'phase_complete' ? 'C2 일정 완료' : '다음 주로'}<Icon name="arrow" size={17} /></button></div></header>
      <div className="preview-banner"><span className="badge">DEVELOPMENT PREVIEW</span><span>현재는 C2 개발 중(C2b) 프리뷰입니다. 모든 지지·조사는 가상 시뮬레이션이며 현실 예측이 아닙니다. 창당·자원·연구와 가상 인재 영입·약속이 구현되어 있습니다. 조직과 인재의 지지 효과는 C2c, 선거 계산은 Phase D입니다.</span></div>
      {store.error && !savesOpen && <div role="alert" className="global-error"><span>{store.error}</span><button onClick={store.clearError} className="icon-button" aria-label="오류 알림 닫기"><Icon name="close" size={16} /></button></div>}
      <main id="main" tabIndex={-1}>{store.game.status === 'founding' ? <Founding /> : <Routes><Route path="/" element={<Home />} /><Route path="/korea" element={<Korea />} /><Route path="/policy" element={<Policy />} /><Route path="/party" element={<Party />} /><Route path="/politicians" element={<Politicians />} /><Route path="/data" element={<DataHub />} /><Route path="*" element={<FuturePage />} /></Routes>}</main>
      <footer><span>HOUSE OF CARDS: KOREA</span><span>이 세이브의 선거제도: {store.game.rulesetSnapshot.label}. 실제 2028년 선거제도는 미확정입니다.</span></footer>
    </div>
  </div>{savesOpen && <SaveDialog onClose={() => setSavesOpen(false)} />}</HashRouter>;
}
