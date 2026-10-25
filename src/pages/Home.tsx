import { ResourceStrip } from '../components/Resources';
import { PLAYER_PARTY_ID } from '../types/party';
import { useState } from 'react';
import { useGameStore } from '../state/store';
import { CALENDAR, daysBetween, isMonthlyTick, MILESTONES, weekCount } from '../engine/calendar';
import { realityPack } from '../data/reality';
import { DOMAIN_LABELS } from '../types/simulation';
import { SimulationNotice, range } from '../components/Simulation';
import { Icon } from '../components/Icon';

export function Home() {
  const { game, dispatch, busy, ready } = useGameStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const selected = game.inbox.find(message => message.id === selectedId) ?? game.inbox[0]!;
  const messages = game.inbox.filter(message => filter === 'all' || !message.read).sort((a, b) => ['Critical', 'Action Required', 'Important', 'Report', 'FYI'].indexOf(a.priority) - ['Critical', 'Action Required', 'Important', 'Report', 'FYI'].indexOf(b.priority) || b.date.localeCompare(a.date) || game.inbox.indexOf(a) - game.inbox.indexOf(b)).slice(0, 5);
  const latestPoll = game.politics.polls[game.politics.polls.length - 1]!;
  const pollSupport = latestPoll.national.results[PLAYER_PARTY_ID];
  const topIssues = [...game.issues].sort((a, b) => b.salience - a.salience).slice(0, 3);
  const unread = game.inbox.filter(message => !message.read).length;
  const days = daysBetween(game.date, realityPack.electionDate!.value);
  const percentage = (game.tick - 1) / (weekCount(CALENDAR) - 1) * 100;
  return <>
    <div className="page-heading"><div><p className="eyebrow">PARTY OFFICE / WEEK {String(game.tick).padStart(2, '0')}</p><h1>우리의 다음 페이지.</h1><p className="muted">작은 정당의 시작부터, 새로운 가능성까지.</p></div><span className="outline-badge">시즌 2026 — 2028</span></div>
    <section className="season-card" aria-labelledby="season-title">
      <div className="season-copy"><span className="light-eyebrow">HOUSE OF CARDS: KOREA</span><h2 id="season-title">정치는 선택의 기록입니다.</h2><p>정책을 만들고, 사람을 모으고, 지역에 뿌리내리세요.<br />2028년을 향한 첫 주가 여기서 시작됩니다.</p><div className="season-tags"><span>C2a · PARTY MANAGEMENT</span><span>창당 · 자원 · 연구 · 인재 생성</span></div></div>
      <div className="card-architecture" aria-hidden="true"><div className="arch-line" /><i className="playing-card card-one" /><i className="playing-card card-two" /><i className="playing-card card-three" /><i className="playing-card card-four" /><span>BUILD SOMETHING<br />THAT LASTS.</span></div>
    </section>
    <ResourceStrip /><section className="overview-grid" aria-label="시즌 현황">
      <article className="metric"><span>프리뷰 기준일</span><strong data-testid="game-date">{game.date.replaceAll('-', '.')}</strong><small>{isMonthlyTick(game.date) ? '월요일 · 월간 틱 경계' : '월요일 · 주간 틱'}</small></article>
      <article className="metric"><span>예정 선거일까지</span><strong>D−{days}</strong><small>2028.04.12 · SCHEDULED 예정</small></article>
      <article className="metric"><span>주간 일정</span><strong>{String(game.tick).padStart(2, '0')}<em> / {weekCount(CALENDAR)}</em></strong><small>{78 - game.tick}번 전진 남음</small></article>
      <article className="metric"><span>우리 정당 · 가상 조사</span><strong>{pollSupport ? range(pollSupport.low, pollSupport.high) : '첫 조사 대기'}</strong><small>{latestPoll.date} · 현실 여론조사 아님</small></article>
    </section>
    <SimulationNotice />
    <section className="home-issues" aria-label="관심이 높은 이슈">{topIssues.map(issue => <article className="sim-card" key={issue.id}><span className="muted small">게임 모델 지수 · {issue.lastUpdated}</span><h3>{DOMAIN_LABELS[issue.id]}</h3><p>심각도 {(issue.severity / 100).toFixed(1)} · 관심도 {(issue.salience / 100).toFixed(1)}</p></article>)}</section>
    <div className="workspace-grid">
      <section className="inbox-panel" aria-labelledby="inbox-title">
        <div className="section-heading"><h2 id="inbox-title"><Icon name="inbox" />받은 편지함 <span className="count">{unread}</span></h2><span className="muted small">우선순위별 주요 알림 최대 5개</span></div>
        <div className="inbox-tabs" role="group" aria-label="편지 필터"><button aria-pressed={filter === 'all'} className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>전체</button><button aria-pressed={filter === 'unread'} className={filter === 'unread' ? 'active' : ''} onClick={() => setFilter('unread')}>읽지 않음</button></div>
        <div className="inbox-layout"><div className="message-list">
          {messages.length === 0 && <p className="empty-list">모든 편지를 읽었습니다.</p>}
          {messages.map(item => <button key={item.id} onClick={() => setSelectedId(item.id)} className={`message-item ${item.id === selected.id ? 'selected' : ''}`} aria-pressed={item.id === selected.id}><span className="message-meta"><span>{item.sender}</span><span>{item.date.slice(5).replace('-', '.')}</span></span><strong>{!item.read && <i className="unread-dot" />}{item.title}</strong><span className="message-category">{{ Critical: '긴급', 'Action Required': '확인 필요', Important: '중요', Report: '보고', FYI: '참고' }[item.priority]} · C1</span></button>)}
        </div><article className="message-detail"><div className="message-detail-meta"><span className="badge">{{ Critical: '긴급', 'Action Required': '확인 필요', Important: '중요', Report: '보고', FYI: '참고' }[selected.priority]}</span><span>{selected.date}</span></div><h3>{selected.title}</h3><p className="sender">{selected.sender} <span>→ 대표님</span></p><p className="letter-body">{selected.body}</p><div className="letter-footnote">가상 운영 안내 · SAVE SIMULATION</div><button className="button compact" disabled={selected.read || busy || !ready} onClick={() => void dispatch({ type: 'RESPOND_INBOX', messageId: selected.id })}><Icon name="check" size={16} />{selected.read ? '읽음' : '읽음으로 표시'}</button></article></div>
      </section>
      <aside className="agenda-panel"><div className="section-heading"><h2><Icon name="clock" />다가오는 일정</h2><span className="muted small">게임 일정</span></div><ol className="timeline">{MILESTONES.slice(0, 4).map(item => <li key={item.date} className={game.date >= item.date ? 'reached' : ''}><time>{item.date.replaceAll('-', '.')}</time><strong>{item.label}</strong><span>Phase {item.phase}에서 구현</span></li>)}</ol><div className="agenda-note">일정은 게임 시나리오입니다.<br />실제 법정 선거 일정의 안내가 아닙니다.</div></aside>
    </div>
    <section className="progress-panel"><div><p className="eyebrow">THE ROAD TO 2028</p><h2>{game.status === 'phase_complete' ? '시즌의 마지막 주에 도착했습니다.' : '한 주씩, 다음 가능성으로.'}</h2><p className="muted">{game.status === 'phase_complete' ? '선거 계산은 Phase D에서 이어집니다. 지금까지의 기록을 저장하거나 새 시드로 다시 시작할 수 있습니다.' : '시간을 진행하면 날짜와 받은 편지가 갱신되고 자동저장됩니다.'}</p></div><div className="season-progress"><div><span>2026.10.19</span><span>2028.04.10</span></div><progress max={100} value={percentage} aria-label="시즌 일정 진행률" /><span>{game.tick} / {weekCount(CALENDAR)} 주차</span></div></section>
  </>;
}
