import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PLAYER_PARTY_ID } from '../types/party';
import type { InboxMessage } from '../types/game';
import { useGameStore } from '../state/store';
import { CALENDAR, daysBetween, MILESTONES, weekCount } from '../engine/calendar';
import { DOMAIN_LABELS } from '../types/simulation';
import { ResourceStrip } from '../components/Resources';
import { Icon } from '../components/Icon';
import { Bar, PageHeading, Panel, Stat, Tabs } from '../components/ui';
import { Sparkline } from '../components/charts';
import { formatDate, formatMoney, range, shortDate } from '../components/format';

const PRIORITY: Record<InboxMessage['priority'], { label: string; tone: string; rank: number }> = {
  Critical: { label: '긴급', tone: 'loss', rank: 0 },
  'Action Required': { label: '조치 필요', tone: 'warn', rank: 1 },
  Important: { label: '중요', tone: 'info', rank: 2 },
  Report: { label: '보고', tone: '', rank: 3 },
  FYI: { label: '참고', tone: '', rank: 4 },
};
const SENDER_COLORS: Record<string, string> = { 사무총장: 'var(--hue-1)', 정책위원장: 'var(--hue-2)', '데이터 책임자': 'var(--hue-4)', '영입 책임자': 'var(--hue-3)', 선거대책위원장: 'var(--hue-6)' };
type Filter = 'all' | 'unread' | 'action';

export function Home() {
  const { game, dispatch, busy, ready } = useGameStore();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const needsAction = (m: InboxMessage) => m.priority === 'Critical' || m.priority === 'Action Required';
  const messages = useMemo(() => game.inbox
    .filter(m => filter === 'all' || (filter === 'unread' ? !m.read : needsAction(m)))
    .sort((a, b) => b.date.localeCompare(a.date) || PRIORITY[a.priority].rank - PRIORITY[b.priority].rank || game.inbox.indexOf(a) - game.inbox.indexOf(b)), [game.inbox, filter]);
  const selected = game.inbox.find(m => m.id === selectedId) ?? messages[0] ?? game.inbox[0];
  const unread = game.inbox.filter(m => !m.read).length;
  const actions = game.inbox.filter(m => needsAction(m) && !m.read).length;
  const polls = game.politics.polls.filter(p => p.national.results[PLAYER_PARTY_ID]);
  const latest = game.politics.polls[game.politics.polls.length - 1]!.national.results[PLAYER_PARTY_ID];
  const days = daysBetween(game.date, CALENDAR.electionDate);
  const total = weekCount(CALENDAR);
  const topIssues = [...game.issues].sort((a, b) => b.salience - a.salience).slice(0, 3);
  const next = MILESTONES.find(m => m.date > game.date);
  const open = (m: InboxMessage) => {
    if (!m.read && ready && !busy) void dispatch({ type: 'RESPOND_INBOX', messageId: m.id });
    if (m.link) navigate(m.link.route);
  };
  return <>
    <PageHeading title={`${game.playerParty?.name ?? '우리 정당'} 당사`} sub={`${game.tick}주차입니다. 이번 주 보고와 일정을 확인하고 다음 주로 넘어가세요.`} />
    <ResourceStrip />
    <div className="stats">
      <Stat label="오늘" value={<span data-testid="game-date">{game.date.replaceAll('-', '.')}</span>} note={`${game.tick}주차 / ${total}주`} />
      <Stat label="총선까지" value={days >= 0 ? `D-${days}` : '선거 종료'} note={`${formatDate(CALENDAR.electionDate)} (예정)`} />
      <Stat label="우리 정당 지지 (가상 조사)" value={latest ? range(latest.low, latest.high) : '첫 조사 대기'} note="현실 여론조사 아님"><Sparkline values={polls.map(p => p.national.results[PLAYER_PARTY_ID]!.point)} color="var(--party)" ariaLabel="우리 정당 조사 지지 추이" /></Stat>
      <Stat label="자금" value={game.resources ? formatMoney(game.resources.money) : '없음'} note={game.history.length > 1 ? '월말 잔액 추이' : '월말마다 기록합니다'}><Sparkline values={game.history.map(h => h.money)} color="var(--gain)" ariaLabel="월말 자금 추이" /></Stat>
    </div>
    <div className="grid side">
      <Panel title={<span className="row"><Icon name="inbox" size={18} />받은 편지함 <span className="count">읽지 않음 {unread}</span></span>} flush>
        <div className="inbox-filter"><Tabs label="편지 필터" value={filter} onChange={setFilter} options={[{ id: 'all', label: '전체', count: game.inbox.length }, { id: 'unread', label: '읽지 않음', count: unread }, { id: 'action', label: '조치 필요', count: actions }]} /></div>
        <div className="inbox-layout">
          <div className="message-list">
            {messages.length === 0 && <p className="empty-list">해당하는 편지가 없습니다.</p>}
            {messages.map(m => <button key={m.id} onClick={() => setSelectedId(m.id)} className={`message-item ${m.id === selected?.id ? 'selected' : ''} ${m.read ? 'read' : ''}`} aria-pressed={m.id === selected?.id}>
              <span className="message-meta"><span>{m.sender}</span><span>{shortDate(m.date)}</span></span>
              <strong>{!m.read && <span className="visually-hidden">읽지 않음, </span>}{m.title}</strong>
              <span className="row tight message-tags"><span className={`badge ${PRIORITY[m.priority].tone}`}>{PRIORITY[m.priority].label}</span>{m.link && <span className="muted small">{m.link.label}</span>}</span>
            </button>)}
          </div>
          {selected ? <article className="message-detail">
            <div className="spread"><div className="sender"><span className="avatar sm" style={{ background: SENDER_COLORS[selected.sender] ?? 'var(--hue-7)' }}>{selected.sender.slice(0, 1)}</span><div><strong>{selected.sender}</strong><div className="muted small">대표님께, {formatDate(selected.date)}</div></div></div><span className={`badge ${PRIORITY[selected.priority].tone}`}>{PRIORITY[selected.priority].label}</span></div>
            <h3>{selected.title}</h3>
            <p className="letter-body">{selected.body}</p>
            <div className="row">
              {selected.link && <button className="button primary" disabled={busy} onClick={() => open(selected)}>{selected.link.label}</button>}
              <button className="button" disabled={selected.read || busy || !ready} onClick={() => void dispatch({ type: 'RESPOND_INBOX', messageId: selected.id })}><Icon name="check" size={16} />{selected.read ? '읽음' : '읽음으로 표시'}</button>
            </div>
            <p className="letter-footnote mt-md">가상 운영 보고입니다.</p>
          </article> : <p className="empty-list">받은 편지가 없습니다.</p>}
        </div>
      </Panel>
      <div className="stack">
        <Panel title="다가오는 일정" sub="게임 일정이며 실제 법정 일정이 아닙니다">
          {next && <p className="chip info next-chip">다음 일정 {next.label}, D-{daysBetween(game.date, next.date)}</p>}
          <ol className="timeline flush">{MILESTONES.map(item => <li key={item.date} className={game.date >= item.date ? 'reached' : ''}><time>{formatDate(item.date)}</time><strong>{item.label}</strong></li>)}</ol>
        </Panel>
        <Panel title="관심이 높은 이슈" actions={<Link className="link-button small" to="/korea">정국 브리핑 보기</Link>}>
          <div className="stack tight">{topIssues.map(issue => <div key={issue.id}>
            <div className="spread"><strong>{DOMAIN_LABELS[issue.id]}</strong><span className="muted small">관심도 {(issue.salience / 100).toFixed(0)}, 심각도 {(issue.severity / 100).toFixed(0)}</span></div>
            <Bar value={issue.salience} max={10000} color="var(--warn)" label={`${DOMAIN_LABELS[issue.id]} 관심도`} />
          </div>)}</div>
        </Panel>
        <Panel title="시즌 진행">
          <div className="spread muted small"><span>2026.10.19</span><span>2028.04.10</span></div>
          <progress max={total - 1} value={game.tick - 1} aria-label="시즌 일정 진행률" />
          <p className="muted small mt-sm">{game.status === 'phase_complete' ? '총선이 계산되었습니다. 시즌 결과에서 개표의 밤과 시즌 리뷰를 보세요.' : `${total - game.tick}주 남았습니다. 진행하면 자동저장됩니다.`}</p>
          {game.status === 'phase_complete' && <Link className="button primary mt-sm" to="/review">시즌 결과 보기</Link>}
        </Panel>
      </div>
    </div>
  </>;
}
