import { useState } from 'react';
import { useGameStore } from '../state/store';
import { partyManagement as data } from '../data/seeds/party-management';
import { CORE_VALUES, DOMAIN_LABELS, type CoreValue } from '../types/simulation';
export const VALUE_LABELS: Record<CoreValue, string> = { reform: '정치개혁', housing: '주거개혁', generations: '세대교체', market: '시장경쟁', 'safety-net': '사회안전망', decentralization: '지방분권', science: '과학기술', labour: '노동', climate: '기후', efficiency: '효율' };
export function Founding() {
  const { game, dispatch, busy, ready } = useGameStore();
  const [name, setName] = useState(''), [shortName, setShortName] = useState('');
  const [color, setColor] = useState(data.palette[0]!);
  const [values, setValues] = useState<CoreValue[]>([]);
  return <section className="sim-card founding-form"><p className="eyebrow">FOUND YOUR PARTY / C1</p><h1>새로운 정당의 첫 페이지</h1><p>2026.10.19 · 시드 {game.seed} · 핵심가치 정확히 세 가지를 선택하세요.</p>
    <form onSubmit={e => { e.preventDefault(); void dispatch({ type: 'CREATE_PARTY', name, shortName, color, values: values as [CoreValue, CoreValue, CoreValue] }); }}>
      <div className="sim-grid"><label>정당 이름 <input value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={20} /></label><label>약칭 <input value={shortName} onChange={e => setShortName(e.target.value)} required maxLength={6} /></label></div>
      <fieldset><legend>정당 색상</legend><div className="palette">{data.palette.map(c => <label key={c}><input type="radio" name="party-color" value={c} checked={c === color} onChange={() => setColor(c)} aria-label={`정당 색상 ${c}`} /><span style={{ background: c }} /></label>)}</div></fieldset>
      <fieldset><legend>핵심가치 ({values.length}/3)</legend><p className="muted small">가치는 연구 인력 비용의 우선순위와 정체성에 반영됩니다. 직접 득표 보너스는 없습니다. 가상 인재 후보의 관심(추첨 가중치)에도 반영됩니다. 브랜드 일관성은 Phase E2에서 구현됩니다.</p><div className="value-grid">{CORE_VALUES.map(v => <label key={v}><input type="checkbox" checked={values.includes(v)} disabled={!values.includes(v) && values.length === 3} onChange={e => setValues(e.target.checked ? [...values, v] : values.filter(x => x !== v))} /> <strong>{VALUE_LABELS[v]}</strong><small>{data.valueDomainAffinity[v].map(d => DOMAIN_LABELS[d]).join('·')} 연구 인력 비용 우대 · 직접 득표 효과 없음</small></label>)}</div></fieldset>
      <p className="model-notice">법적 창당 절차(창당준비위원회, 시도당 등록 등)는 게임에서 생략된 추상화입니다.</p><button className="button primary" disabled={busy || !ready || values.length !== 3} type="submit">정당 창당</button>
    </form>
  </section>;
}
