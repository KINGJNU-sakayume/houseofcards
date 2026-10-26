import { useGameStore } from '../state/store';
import { DOMAIN_LABELS } from '../types/simulation';
import { DRIVER_LABELS } from '../data/content/labels';
import { SimulationNotice } from '../components/Simulation';
export function Korea() {
  const { issues } = useGameStore(s => s.game);
  return <>
    <div className="page-heading"><div><p className="eyebrow">대한민국 · 사회 이슈</p><h1>대한민국의 여섯 이슈</h1><p className="muted">심각도와 대중의 관심은 서로 다른 속도로 움직입니다.</p></div></div>
    <SimulationNotice>게임 모델 지수 · 초기값은 SEED INDEX, 이후 변화는 가상 시뮬레이션입니다. 현실 통계 또는 한국 사회의 미래 전망이 아닙니다.</SimulationNotice>
    <div className="sim-grid">{issues.map(issue => <section className="sim-card" key={issue.id}><div className="section-heading"><h2>{DOMAIN_LABELS[issue.id]}</h2><span className="outline-badge">게임 모델 지수</span></div>
      <div className="issue-indices"><div><span>심각도</span><strong>{(issue.severity / 100).toFixed(1)}</strong><meter min={0} max={10000} value={issue.severity} aria-label={`${DOMAIN_LABELS[issue.id]} 심각도`} /></div><div><span>관심도</span><strong>{(issue.salience / 100).toFixed(1)}</strong><meter min={0} max={10000} value={issue.salience} aria-label={`${DOMAIN_LABELS[issue.id]} 관심도`} /></div></div>
      <p className="muted small">월간 변화 {issue.trend > 0 ? '+' : ''}{(issue.trend / 100).toFixed(2)} · {issue.trend > 0 ? '압력 증가' : issue.trend < 0 ? '압력 감소' : '시작 상태'} · 갱신 {issue.lastUpdated}</p>
      <details><summary>이슈를 움직이는 조건</summary><ul className="driver-list">{Object.entries(issue.drivers).map(([id, value]) => <li key={id}><span>{DRIVER_LABELS[id] ?? id}</span><span>{(value / 100).toFixed(1)}</span></li>)}</ul><p className="muted small">집행된 정부 정책은 구현 시차가 지난 뒤 반영됩니다. 원외 정당의 공약은 이 지표를 직접 바꾸지 않습니다.</p></details>
    </section>)}</div>
  </>;
}
