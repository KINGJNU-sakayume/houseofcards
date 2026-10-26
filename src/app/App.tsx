import { useEffect, useState, type CSSProperties } from 'react';
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { NAVIGATION } from '../data/content/navigation';
import { Icon } from '../components/Icon';
import { SaveDialog } from '../components/SaveDialog';
import { formatDate, formatMoney } from '../components/format';
import { nextRefillDate } from '../engine/parties/management';
import { CALENDAR, daysBetween } from '../engine/calendar';
import { Founding } from '../pages/Founding';
import { Party } from '../pages/Party';
import { Home } from '../pages/Home';
import { Korea } from '../pages/Korea';
import { Policy } from '../pages/Policy';
import { DataHub } from '../pages/DataHub';
import { FuturePage } from '../pages/FuturePage';
import { Review } from '../pages/Review';
import { Politicians } from '../pages/Politicians';
import { Organization } from '../pages/Organization';
import { Election } from '../pages/Election';
import { useGameStore } from '../state/store';

export function App() {
  const store = useGameStore();
  const [savesOpen, setSavesOpen] = useState(false);
  useEffect(() => { void useGameStore.getState().initialize(); }, []);
  const game = store.game, party = game.playerParty, resources = game.resources;
  const saveLabel = { idle: '자동저장 대기', saving: '저장 중…', saved: '자동저장 완료', failed: '저장 확인 필요' }[store.saveStatus];
  const unread = game.inbox.filter(m => !m.read).length;
  const actionRequired = game.inbox.filter(m => !m.read && (m.priority === 'Action Required' || m.priority === 'Critical')).length;
  const dday = daysBetween(game.date, CALENDAR.electionDate);
  const style = { '--party': party?.color ?? 'var(--party-default)' } as CSSProperties;
  return <HashRouter><a href="#main" className="skip-link" onClick={event => { event.preventDefault(); document.getElementById('main')?.focus(); }}>본문으로 건너뛰기</a><div className="app-shell" style={style}>
    <aside className="sidebar">
      <a className="brand" href="#/"><img src={`${import.meta.env.BASE_URL}mark.svg`} width="34" height="34" alt="" /><span><strong>하우스 오브 카드</strong><small>정당 경영 시뮬레이션</small></span></a>
      {party && <div className="party-badge"><i>{party.shortName.slice(0, 1)}</i><div><strong>{party.name}</strong><small>창당 {party.foundedAt.replaceAll('-', '.')}</small></div></div>}
      <nav aria-label="주 내비게이션">{NAVIGATION.map(item => <NavLink key={item.path} end={item.path === '/'} to={item.path} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon name={item.icon} /><span>{item.label}</span>{item.path === '/' && unread > 0 && <span className="nav-count" aria-hidden="true" title={`읽지 않은 편지 ${unread}통`}>{unread}</span>}</NavLink>)}</nav>
      <div className="sidebar-bottom">가상 시뮬레이션<br />실제 선거 예측이 아닙니다</div>
    </aside>
    <div className="main-shell"><header className="topbar">
      <div className="topbar-date" data-testid="topbar-date"><strong>{formatDate(game.date, true)}</strong><span>{game.tick}주차 / 78주</span></div>
      {dday >= 0 && <span className="dday" title={`총선 예정일 ${CALENDAR.electionDate} (예정)`}>총선 D-{dday}</span>}
      {resources && <div className="topbar-resources" aria-label="정당 자원">
        <div className="res-chip"><span>자금</span><strong>{formatMoney(resources.money)}</strong></div>
        <div className="res-chip"><span>실무 인력</span><strong>{resources.staffCapacity}</strong></div>
        <div className="res-chip" title={`다음 충전 ${nextRefillDate(game.date)}`}><span>의제 슬롯</span><strong>{resources.agendaSlots}</strong></div>
      </div>}
      <div className="topbar-actions">
        <span className="sim-chip">가상 시뮬레이션 · 실제 예측 아님</span>
        <span className={`save-indicator ${store.saveStatus}`} role="status"><i />{saveLabel}</span>
        <button className="button save-button" aria-label="저장 / 불러오기" disabled={!store.ready || store.busy} onClick={() => setSavesOpen(true)}><Icon name="save" size={17} /><span>저장</span></button>
        <button className="button primary advance-button" disabled={!store.ready || store.busy || game.status !== 'active'} onClick={() => void store.dispatch({ type: 'ADVANCE_WEEK' })}>{!store.ready ? '불러오는 중…' : store.busy ? '처리 중…' : game.status === 'phase_complete' ? '시즌 완료' : '다음 주로'}<Icon name="arrow" size={17} />{actionRequired > 0 && game.status === 'active' && <span className="nav-count" aria-hidden="true" title={`조치가 필요한 편지 ${actionRequired}통`}>{actionRequired}</span>}</button>
      </div>
    </header>
      {store.error && !savesOpen && <div role="alert" className="global-error"><span>{store.error}</span><button onClick={store.clearError} className="icon-button" aria-label="오류 알림 닫기"><Icon name="close" size={16} /></button></div>}
      <main id="main" tabIndex={-1}>{game.status === 'founding' ? <Founding /> : <Routes><Route path="/" element={<Home />} /><Route path="/korea" element={<Korea />} /><Route path="/policy" element={<Policy />} /><Route path="/party" element={<Party />} /><Route path="/politicians" element={<Politicians />} /><Route path="/organization" element={<Organization />} /><Route path="/election" element={<Election />} /><Route path="/review" element={<Review />} /><Route path="/data" element={<DataHub />} /><Route path="*" element={<FuturePage />} /></Routes>}</main>
      <footer><span>이 세이브의 선거제도: {game.rulesetSnapshot.label}. 실제 2028년 선거제도는 미확정입니다.</span><span>모든 지지·조사·선거 결과는 가상 시뮬레이션입니다.</span></footer>
    </div>
  </div>{savesOpen && <SaveDialog onClose={() => setSavesOpen(false)} />}</HashRouter>;
}
