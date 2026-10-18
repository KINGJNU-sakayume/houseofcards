import { useState } from 'react';
import { useGameStore } from '../state/store';
import { SimulationNotice, PollTable, estimateRange } from '../components/Simulation';
import { REGION_LABELS } from '../data/content/labels';
export function DataHub() {
  const { politics } = useGameStore(s => s.game);
  const [tab, setTab] = useState('analysis');
  const [pollId, setPollId] = useState('latest');
  const poll = politics.polls.find(p => p.id === pollId) ?? politics.polls[politics.polls.length - 1]!;
  const analysis = politics.analysis, player = 'player-preview';
  return <>
    <div className="page-heading"><div><p className="eyebrow">DATA HUB / POLLS</p><h1>지지의 차이를 읽다</h1><p className="muted">가능성과 현재의 선택 사이에 무엇이 남아 있을까요?</p></div></div>
    <SimulationNotice />
    <div className="sim-tabs" role="group" aria-label="데이터 보기">{[['analysis', '내부 분석'], ['polls', '전국 조사'], ['age', '연령별'], ['region', '권역별']].map(([id, label]) => <button key={id} aria-pressed={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id!)}>{label}</button>)}</div>
    {tab === 'analysis' ? <section className="sim-card"><div className="section-heading"><h2>개발 프리뷰 정당 · 잠재와 현재</h2><span className="outline-badge">내부 분석 · 세이브 모형 추정</span></div><p className="muted">{analysis.date} 기준. 현실 통계와 통계적 신뢰구간이 아닌 모형 추정 범위입니다. 모든 정당의 인지도를 100%로, 생존가능성을 동일한 중립값으로 바꿉니다. 신뢰·충성·정체성·정부평가는 유지합니다.</p>
      <div className="support-comparison"><article><span>현재 지지</span><strong data-testid="current-support">{estimateRange(analysis.currentSupport[player]!)}</strong><small>실제 고려 장벽을 반영한 전국 정당 지지</small></article><article><span>잠재 지지</span><strong data-testid="potential-support">{estimateRange(analysis.potentialSupport[player]!)}</strong><small>모든 정당의 인지도 100%, 생존가능성 동일화</small></article></div>
      <h3>장벽을 하나씩 바꾸면</h3><p className="muted small">인지도·생존가능성은 각각 현재 대비 변화입니다. 기존 충성은 잠재 조건에서 추가로 중립화한 변화입니다. 상호작용 때문에 아래 범위들은 합산할 수 없습니다.</p>
      <table className="sim-table"><thead><tr><th>가정 변경</th><th>추가 지지의 모형 추정 범위</th></tr></thead><tbody>{([['awareness', '인지도 장벽 제거'], ['viability', '생존가능성 중립화'], ['priorLoyalty', '잠재 조건에서 기존 충성 중립화'], ['policyMismatch', '공약 적합을 최대로 가정'], ['ownership', '신뢰·이슈 소유를 최대로 가정']] as const).map(([id, label]) => <tr key={id}><th scope="row">{label}</th><td>{estimateRange(analysis.barriers[id], true)}</td></tr>)}</tbody></table>
      <p className="model-source">내부 분석 비용은 Phase C까지 유예됩니다. 인지도는 발표 후 천천히 변합니다. 초안 편집은 분석에 영향을 주지 않습니다.</p>
    </section> : <>
      <div className="sim-toolbar"><label>가상 조사 선택 <select value={pollId} onChange={event => setPollId(event.target.value)}><option value="latest">가장 최근 조사</option>{[...politics.polls].reverse().map(p => <option key={p.id} value={p.id}>{p.date} · {p.houseName}</option>)}</select></label><span className="muted small">{poll.date} · {poll.houseName} · 전국 표본 {poll.national.sampleSize}명</span></div>
      <p className="model-source">모든 조사기관은 가상입니다. 기관별 지속 편차와 표본 잡음이 포함됩니다. 연령·권역 조사 범위는 작은 부분 표본으로 계산합니다.</p>
      {tab === 'polls' ? <section className="sim-card"><h2>가상 전국 정당 지지 조사</h2><PollTable group={poll.national} /></section> : <div className="sim-grid">{Object.entries(tab === 'age' ? poll.byAge : poll.byRegion).map(([id, group]) => <section className="sim-card" key={id}><div className="section-heading"><h2>{tab === 'age' ? `${id}세` : REGION_LABELS[id]}</h2><span className="muted small">부분 표본 {group.sampleSize}명</span></div><PollTable group={group} /></section>)}</div>}
    </>}
  </>;
}
