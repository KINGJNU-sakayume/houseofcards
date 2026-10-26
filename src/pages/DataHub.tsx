import { useState } from 'react';
import { useGameStore } from '../state/store';
import { SimulationNotice, PollTable, estimateRange, partyName } from '../components/Simulation';
import { ResourceStrip, moneyLabel } from '../components/Resources';
import { partyManagement } from '../data/seeds/party-management';
import { shortage } from '../engine/parties/management';
import { REGION_LABELS } from '../data/content/labels';
import { PLAYER_PARTY_ID } from '../types/party';
import { daysBetween } from '../engine/calendar';
export function DataHub() {
  const { game, dispatch, busy } = useGameStore();
  const { politics } = game;
  const [tab, setTab] = useState('analysis');
  const [pollId, setPollId] = useState('latest');
  const poll = politics.polls.find(p => p.id === pollId) ?? politics.polls[politics.polls.length - 1]!;
  const survey = game.internalSurveys[game.internalSurveys.length - 1];
  const analysis = survey?.analysis, player = PLAYER_PARTY_ID;
  const cost = partyManagement.survey, reason = shortage(game, cost);
  const band = (n: number, signed = false) => estimateRange(n, signed, survey!.margin);
  return <>
    <div className="page-heading"><div><p className="eyebrow">DATA HUB / POLLS</p><h1>지지의 차이를 읽다</h1><p className="muted">내부조사는 조사일의 기록이며 공개 여론조사와 구분됩니다.</p></div></div>
    <ResourceStrip /><SimulationNotice />
    <div className="sim-tabs" role="group" aria-label="데이터 보기">{[['analysis', '내부 분석'], ['polls', '전국 조사'], ['age', '공개 연령별'], ['region', '공개 권역별']].map(([id, label]) => <button key={id} aria-pressed={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id!)}>{label}</button>)}</div>
    {tab === 'analysis' ? <section className="sim-card"><div className="section-heading"><h2>우리 정당 · 내부조사</h2><span className="outline-badge">세이브 모형 추정</span></div>
      <p>의뢰 비용: {moneyLabel(cost.money)} · Staff Capacity {cost.staffCapacity}</p><button className="button primary" disabled={busy || game.status !== 'active' || !!reason} onClick={() => void dispatch({ type: 'COMMISSION_INTERNAL_SURVEY' })}>내부조사 의뢰</button>{reason && <p className="muted">{reason}</p>}
      {!analysis ? <p data-testid="survey-gate">아직 내부조사가 없습니다. 잠재·현재 지지, 장벽, 연령·권역별 내부 추정은 조사를 의뢰한 뒤 표시합니다. 공개 조사는 무료입니다.</p> : <>
        <p data-testid="survey-date">{survey!.date} 기준 · {survey!.date === game.date ? '현재 주 조사' : `${daysBetween(survey!.date, game.date) / 7}주 경과 · 오래된 조사`}</p><p className="muted">통계적 신뢰구간이 아닌 ±{survey!.margin / 10000}%p 모형 설명 범위입니다. 잠재 지지는 모든 정당의 인지도를 100%, 생존가능성을 동일한 중립값으로 바꿉니다. 신뢰·충성·정체성·정부평가는 유지합니다.</p>
        <div className="support-comparison"><article><span>현재 지지</span><strong data-testid="current-support">{band(analysis.currentSupport[player]!)}</strong><small>조사일의 고려 장벽 반영</small></article><article><span>잠재 지지</span><strong data-testid="potential-support">{band(analysis.potentialSupport[player]!)}</strong><small>모든 정당의 인지도·생존가능성 중립화</small></article></div>
        <h3>장벽을 하나씩 바꾸면</h3><p className="muted small">인지도·생존가능성은 현재 대비, 기존 충성은 잠재 조건에서 추가 중립화한 차이입니다. 독립 반사실이며 상호작용 때문에 합산할 수 없습니다.</p><div className="table-scroll"><table className="sim-table"><thead><tr><th>가정 변경</th><th>변화 범위</th></tr></thead><tbody>{([['awareness', '인지도 장벽 제거'], ['viability', '생존가능성 중립화'], ['priorLoyalty', '잠재 조건에서 기존 충성 중립화'], ['policyMismatch', '공약 적합 최대로'], ['ownership', '신뢰·이슈 소유 최대로']] as const).map(([id, label]) => <tr key={id}><th>{label}</th><td>{band(analysis.barriers![id], true)}</td></tr>)}</tbody></table></div>
        <div className="sim-grid">{([{ title: '연령별 내부 현재 지지', groups: analysis.byAge }, { title: '권역별 내부 현재 지지', groups: analysis.byRegion }]).map(({ title, groups }) => <section key={title}><h3>{title}</h3><ul>{Object.entries(groups).map(([id, vector]) => <li key={id}>{REGION_LABELS[id] ?? `${id}세`}: {band(vector[player]!)}</li>)}</ul></section>)}</div>
        <section data-testid="vote-flow"><h3>Vote Flow · 기존 충성 → 조사일 선택 (추정)</h3><p className="muted small">직전 선거에서 이어진 정당 충성(코호트 attachment)에서 조사일의 선택으로 옮겨 간 몫을, 코호트마다 '최소 이동'(각 정당은 겹치는 만큼 유지하고 잃은 몫은 늘어난 쪽에 비례 배분)으로 추정해 전체 유권자 대비로 합쳤습니다. 개인 단위 이동이 아닌 모형 추정이며 범위로 표시합니다.</p>
          <div className="table-scroll"><table className="sim-table"><thead><tr><th>기존 → 지금</th>{Object.keys(Object.values(survey!.voteFlow)[0] ?? {}).map(q => <th key={q}>{partyName(q)}</th>)}</tr></thead><tbody>{Object.entries(survey!.voteFlow).filter(([, row]) => Object.values(row).some(v => v > 0)).map(([p, row]) => <tr key={p}><th>{partyName(p)}</th>{Object.entries(row).map(([q, v]) => <td key={q}>{v ? band(v) : '—'}</td>)}</tr>)}</tbody></table></div></section>
      </>}
    </section> : <>
      <div className="sim-toolbar"><label>가상 조사 선택 <select value={pollId} onChange={event => setPollId(event.target.value)}><option value="latest">가장 최근 조사</option>{[...politics.polls].reverse().map(p => <option key={p.id} value={p.id}>{p.date} · {p.houseName}</option>)}</select></label><span className="muted small">{poll.date} · {poll.houseName} · 전국 표본 {poll.national.sampleSize}명</span></div>
      <p className="model-source">모든 조사기관은 가상입니다. 기관별 지속 편차와 표본 잡음이 포함됩니다. 창당 전 조사에는 우리 정당 결과가 없습니다.</p>
      {tab === 'polls' ? <section className="sim-card"><h2>가상 전국 정당 지지 조사</h2><PollTable group={poll.national} /></section> : <div className="sim-grid">{Object.entries(tab === 'age' ? poll.byAge : poll.byRegion).map(([id, group]) => <section className="sim-card" key={id}><div className="section-heading"><h2>{tab === 'age' ? `${id}세` : REGION_LABELS[id]}</h2><span className="muted small">부분 표본 {group.sampleSize}명</span></div><PollTable group={group} /></section>)}</div>}
    </>}
  </>;
}
