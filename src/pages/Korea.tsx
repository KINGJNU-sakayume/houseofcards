import { useMemo, useState } from 'react';
import { useGameStore } from '../state/store';
import { DOMAIN_LABELS } from '../types/simulation';
import { DRIVER_LABELS } from '../data/content/labels';
import { MASTHEAD } from '../data/content/stories';
import { seedPack } from '../data/reality';
import { articles as buildArticles, recentChanges, type Article } from '../engine/issues/stories';
import { Icon } from '../components/Icon';
import { LineChart, Sparkline } from '../components/charts';
import { Gauge } from '../components/charts';
import { PageHeading, Panel } from '../components/ui';
import { formatDate, shortDate } from '../components/format';

const TONE = { up: { label: '악화', cls: 'loss', icon: 'up' }, down: { label: '완화', cls: 'gain', icon: 'down' }, flat: { label: '보합', cls: '', icon: 'flat' } } as const;
const pt = (v: number) => (v / 100).toFixed(1);
const CHANGE_ICON = { government: '정부', party: '정당', poll: '조사' } as const;

function Kicker({ article }: { article: Article }) {
  const tone = TONE[article.tone];
  return <span className="row tight"><span className="badge accent">{article.kicker}</span><span className={`badge ${tone.cls}`}><Icon name={tone.icon} size={12} />{tone.label}</span></span>;
}

export function Korea() {
  const game = useGameStore(s => s.game);
  const list = useMemo(() => buildArticles(game), [game]);
  const changes = useMemo(() => recentChanges(game), [game]);
  const [openIssue, setOpenIssue] = useState<string | null>(null);
  const [front, ...rest] = list;
  const months = game.history.map(h => shortDate(h.date));
  const edition = game.history.length + 1;
  return <>
    <PageHeading title="정국 브리핑" sub="이번 달 무엇이 문제이고, 왜 움직였는지 봅니다. 원외 정당의 공약은 이 지표를 직접 바꾸지 못합니다." />
    <section className="newspaper" aria-label="정국 브리핑 1면">
      <header className="masthead"><strong>{MASTHEAD.name}</strong><span>{formatDate(game.date, true)}, 제{edition}호</span><span className="badge info">가상 매체</span></header>
      {front && <article className="front">
        <div className="front-copy"><Kicker article={front} /><h2>{front.headline}</h2><p>{front.lede}</p>
          <div className="row">{front.driver && <span className={`chip ${front.tone === "up" ? "loss" : front.tone === "down" ? "gain" : "warn"}`}>{front.tone === "flat" ? "핵심 요인" : "원인"}: {front.driver.label}</span>}<span className="chip">관심도 1위 {DOMAIN_LABELS[front.issueId]}</span></div></div>
        <div className="front-chart">{front.history.length > 1 ? <LineChart ariaLabel={`${DOMAIN_LABELS[front.issueId]} 심각도 추이`} labels={months} format={v => (v / 100).toFixed(0)} height={180}
          series={[{ id: 'sev', label: '심각도', color: 'var(--loss)', values: game.history.map(h => h.issues[front.issueId]?.[0] ?? null) }, { id: 'sal', label: '관심도', color: 'var(--warn)', values: game.history.map(h => h.issues[front.issueId]?.[1] ?? null) }]} /> : <p className="muted small">월말마다 추이를 기록합니다. 첫 달이 지나면 그래프가 나타납니다.</p>}</div>
      </article>}
      <div className="side-articles">{rest.slice(0, 3).map(a => <article key={a.id}><Kicker article={a} /><h3>{a.headline}</h3><p>{a.lede}</p></article>)}</div>
      <p className="masthead-note">{MASTHEAD.note}</p>
    </section>
    <div className="grid side">
      <Panel title="아젠다 보드" sub="여섯 이슈의 심각도와 관심도입니다. 게임 모형 지수이며 현실 통계가 아닙니다.">
        <div className="agenda-board">{[...game.issues].sort((a, b) => b.salience - a.salience).map(issue => {
          const article = list.find(a => a.issueId === issue.id)!;
          const config = seedPack.issueConfigs.find(c => c.id === issue.id)!;
          return <article key={issue.id} className={`agenda-tile tone-${article.tone}`}>
            <div className="spread"><h3>{DOMAIN_LABELS[issue.id]}</h3><span className={`chip ${TONE[article.tone].cls}`}><Icon name={TONE[article.tone].icon} size={12} />{issue.trend > 0 ? '+' : ''}{(issue.trend / 100).toFixed(1)}</span></div>
            <div className="agenda-metrics"><Gauge value={issue.severity / 100} label={`${DOMAIN_LABELS[issue.id]} 심각도`} color={issue.severity >= 7000 ? 'var(--loss)' : issue.severity >= 5000 ? 'var(--warn)' : 'var(--gain)'} />
              <div className="issue-indices"><div><span>심각도</span><strong>{pt(issue.severity)}</strong><meter min={0} max={10000} low={5000} high={7000} optimum={0} value={issue.severity} aria-label={`${DOMAIN_LABELS[issue.id]} 심각도`} /></div><div><span>관심도</span><strong>{pt(issue.salience)}</strong><meter min={0} max={10000} value={issue.salience} aria-label={`${DOMAIN_LABELS[issue.id]} 관심도`} /></div></div></div>
            <Sparkline values={article.history} color="var(--loss)" ariaLabel={`${DOMAIN_LABELS[issue.id]} 심각도 추이`} />
            <button className="link-button small" aria-expanded={openIssue === issue.id} onClick={() => setOpenIssue(openIssue === issue.id ? null : issue.id)}>{openIssue === issue.id ? '요인 접기' : '이슈를 움직이는 요인'}</button>
            {openIssue === issue.id && <ul className="driver-list">{config.drivers.map(d => { const v = issue.drivers[d.id] ?? d.initial, delta = v - d.initial; return <li key={d.id}><span>{DRIVER_LABELS[d.id] ?? d.id}</span><span className={delta > 50 ? 'loss' : delta < -50 ? 'gain' : 'muted'}>{pt(v)} ({delta >= 0 ? '+' : ''}{pt(delta)})</span></li>; })}</ul>}
          </article>;
        })}</div>
        <p className="muted small mt-sm">집행된 정부 정책은 시행 시차가 지난 뒤 요인에 반영됩니다. 요인 옆 괄호는 시즌 시작 대비 변화입니다(+ 악화).</p>
      </Panel>
      <Panel title="이달의 변화" sub="최근 5주의 정부 집행, 정당 공약, 가상 조사">
        {changes.length ? <ol className="change-list">{changes.map((c, i) => <li key={i}><span className={`badge ${c.kind === 'government' ? 'warn' : c.kind === 'party' ? 'info' : ''}`}>{CHANGE_ICON[c.kind]}</span><div><strong>{c.title}</strong><p className="muted small"><time>{shortDate(c.date)}</time> {c.body}</p></div></li>)}</ol> : <p className="empty-state">최근 5주 동안 정부 집행이나 정당 공약 변화가 없습니다.</p>}
      </Panel>
    </div>
  </>;
}
