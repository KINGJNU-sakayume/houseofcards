import { useMemo, useState } from 'react';
import { useGameStore } from '../state/store';
import { Hemicycle } from '../components/charts';
import { districtPack } from '../data/reality/districts';
import { PARTY_COLORS, REGION_LABELS, cohortLabel } from '../data/content/labels';
import { DOMAIN_LABELS } from '../types/simulation';
import { PLAYER_PARTY_ID } from '../types/party';
import { SimulationNotice, partyName, percent } from '../components/Simulation';
import { callOrder, exitPoll, listShare, marginOf, seasonReview } from '../engine/review';

const STEPS = ['18:00 투표 종료', '출구조사', '개표', '당선 확실', '정당득표', '비례의석'] as const;
const nameOf = (id: string) => districtPack.districts.find(d => d.id === id)!.name;

// E1 개표의 밤 (skippable) and 시즌 리뷰 (Slice §27), read from the saved result.
export function Review() {
  const { game } = useGameStore();
  const e = game.election;
  const [step, setStep] = useState(0);
  const review = useMemo(() => seasonReview(game, { region: id => REGION_LABELS[id] ?? id, domain: id => DOMAIN_LABELS[id], cohort: cohortLabel }), [game]);
  const poll = useMemo(() => e ? exitPoll(game, e) : null, [game, e]);
  if (!e || !review || !poll) return <>
    <div className="page-heading"><div><p className="eyebrow">시즌 결과</p><h1>시즌 결과</h1></div></div>
    <SimulationNotice>선거는 마지막 주(2028-04-10)를 진행하면 2028-04-12 기준으로 계산됩니다. 그 뒤에 개표의 밤과 시즌 리뷰가 열립니다.</SimulationNotice>
  </>;
  const order = callOrder(e), parties = Object.keys(e.totalSeats).sort((a, b) => e.totalSeats[b]! - e.totalSeats[a]! || listShare(e, b) - listShare(e, a));
  const called = step >= 3 ? order.length : step === 2 ? Math.round(order.length / 2) : 0;
  const tally = (ids: string[]) => ids.reduce<Record<string, number>>((acc, id) => { const w = e.districts.find(r => r.id === id)!.winner; return { ...acc, [w]: (acc[w] ?? 0) + 1 }; }, {});
  const counted = tally(order.slice(0, called));
  const done = step >= STEPS.length - 1;
  return <>
    <div className="page-heading"><div><p className="eyebrow">개표의 밤 · 시즌 리뷰</p><h1>{e.date} 총선</h1><p className="muted">{game.electionRuleset.label}</p></div></div>
    <SimulationNotice>이 세이브의 가상 선거입니다. 실제 선거 결과나 예측이 아니며, 실제 방송사나 조사기관의 출구조사가 아닙니다. 지역구는 2024년 기준입니다.</SimulationNotice>
    <section className="sim-card night-board" data-testid="election-night" aria-live="polite"><h2>개표의 밤 <span className="badge info">가상 시뮬레이션</span></h2>
      <ol className="night-steps" aria-label="개표의 밤 진행 단계">{STEPS.map((s, i) => <li key={s} className={i <= step ? 'reached' : ''} aria-current={i === step ? 'step' : undefined}>{s}</li>)}</ol>
      {step >= 1 && <div data-testid="exit-poll"><h3>가상 출구조사 (별도 오차 ±{percent(20000)}%p)</h3><p className="muted small">{Object.keys(poll).sort((a, b) => poll[b]!.point - poll[a]!.point).map(id => `${partyName(id)} ${percent(poll[id]!.low)}–${percent(poll[id]!.high)}%`).join(' · ')}</p></div>}
      {step >= 2 && <div data-testid="count"><h3>{step >= 3 ? '지역구 당선 확정' : '개표 중 · 격차가 큰 곳부터 확정'} ({called}/{order.length})</h3><p>{Object.entries(counted).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${partyName(id)} ${n}`).join(' · ')}</p>
        {step >= 3 && <p className="muted small">마지막까지 접전: {order.slice(-3).map(id => `${nameOf(id)}(${percent(marginOf(e.districts.find(r => r.id === id)!.votes))}%p)`).join(', ')}</p>}</div>}
      {step >= 4 && <p data-testid="party-vote"><strong>정당득표</strong> {parties.filter(id => e.listVotes[id] !== undefined).map(id => `${partyName(id)} ${percent(listShare(e, id))}%`).join(' · ')}</p>}
      {step >= 5 && <p data-testid="list-seats"><strong>비례의석 {game.electionRuleset.listSeats}석</strong> {parties.map(id => `${partyName(id)} ${e.listSeats[id] ?? 0}`).join(' · ')}</p>}
      {step >= 5 && <div className="night-hemicycle"><Hemicycle ariaLabel="총선 결과 의석" parties={Object.entries(e.totalSeats).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, label: partyName(id), seats: n, color: id === PLAYER_PARTY_ID ? (game.playerParty?.color ?? '#3550a8') : PARTY_COLORS[id] ?? '#8a8f98' }))} /></div>}
      <div className="sim-toolbar">{!done && <button className="button primary" onClick={() => setStep(s => s + 1)}>다음: {STEPS[step + 1]}</button>}{!done && <button className="button" onClick={() => setStep(STEPS.length - 1)}>건너뛰기</button>}</div>
    </section>
    {done && <>
      <section className="sim-card" data-testid="season-review" style={{ borderTop: `6px solid ${game.playerParty?.color ?? 'var(--accent)'}` }}><h2>{review.partyName}</h2>
        <dl className="review-headline"><div><dt>정당득표</dt><dd>{percent(review.listShare)}%</dd></div><div><dt>지역구</dt><dd>{review.districtSeats}석</dd></div><div><dt>비례</dt><dd>{review.listSeats}석</dd></div><div><dt>총</dt><dd>{review.totalSeats}석</dd></div></dl>
        <p>{e.outcome === 'in_parliament' ? '원내에 진입했습니다.' : '의석이 없지만 원외 정당으로 존속합니다. 현행법상 0석이나 낮은 득표로 정당 등록이 취소되지 않습니다(정당법 §44①3 위헌 결정, 대체 조항 없음).'}</p>
        <div className="review-cards">{review.cards.map(c => <article key={c.id} className="review-card" data-testid={`card-${c.id}`}><span className="badge accent">시즌 카드</span><h3>{c.title}</h3><strong>{c.value ?? '—'}</strong><p className="muted small">{c.detail}</p></article>)}</div>
        <p className="muted small">카드는 이 세이브의 결과와 기록에서 계산한 게임 모형 해석입니다.</p></section>
      <section className="sim-card" data-testid="ruleset-explainer"><h2>이 선거제도에서 이 득표율은 왜 이 의석이 되었나</h2>
        <p>{game.electionRuleset.listMethod === 'parallel' ? `병립형: 비례 ${review.ruleset.listSeats}석을 정당득표 비율로만 나눕니다(지역구 의석과 무관).` : '준연동형: 지역구 의석을 고려해 연동 배분합니다.'} 우리 정당득표 {percent(review.listShare)}% × {review.ruleset.listSeats}석 = {(review.ruleset.quota / 1_000_000).toFixed(2)}석 몫 → 정수 {review.ruleset.seatsByQuota}석, 남은 {(review.ruleset.remainder / 1_000_000).toFixed(2)}는 다른 정당의 잔여와 크기를 비교해 배분됩니다. 결과 비례 {review.listSeats}석.</p>
        <p className="muted small">{game.electionRuleset.legalThreshold ? `법정 문턱 ${percent(game.electionRuleset.legalThreshold.voteShare)}% 또는 지역구 ${game.electionRuleset.legalThreshold.orDistrictSeats}석.` : '법정 문턱은 없지만'} 1석 몫은 약 {percent(review.ruleset.effectiveThreshold)}%이며, 잔여 배분에 따라 사실상의 문턱이 그보다 낮거나 높아집니다. 지역구는 단순 다수 254곳이며 우리 후보는 공천한 곳에만 있었습니다.{!game.nominations.list.length ? ' 비례명부를 등록하지 않아 정당투표에 오르지 못했습니다.' : ''}</p></section>
      <section className="sim-card" data-testid="voter-growth"><h2>지지가 가장 많이 자란 유권자</h2><ul>{review.cohortGrowth.map(g => <li key={g.cohortId}>{cohortLabel(g.cohortId)}: {percent(g.from)}% → {percent(g.to)}%</li>)}</ul>
        <h3>권역별 선거일 지지 (모형)</h3><p className="muted small">{Object.entries(review.regionSupport).sort((a, b) => b[1] - a[1]).map(([r, v]) => `${REGION_LABELS[r]} ${percent(v)}%`).join(' / ')}</p></section>
      <section className="sim-card" data-testid="next-season"><h2>다음 시즌 미리보기</h2><p className="muted small">v1.0은 총선 직후 끝납니다. 아래는 다음 버전에서 열릴 요소이며 지금은 구현되어 있지 않습니다.</p><ul>{review.preview.map(p => <li key={p}>{p}</li>)}</ul>
        <p className="muted small">우리 정당 의석 {e.totalSeats[PLAYER_PARTY_ID] ?? 0}석 기준.</p></section>
    </>}
  </>;
}
