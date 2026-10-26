import { useState } from 'react';
import { useGameStore } from '../state/store';
import { formatMoney } from '../components/format';
import { partyManagement as data } from '../data/seeds/party-management';
import { CORE_VALUES, DOMAIN_LABELS, type CoreValue } from '../types/simulation';
export const VALUE_LABELS: Record<CoreValue, string> = { reform: '정치개혁', housing: '주거개혁', generations: '세대교체', market: '시장경쟁', 'safety-net': '사회안전망', decentralization: '지방분권', science: '과학기술', labour: '노동', climate: '기후', efficiency: '효율' };
export function Founding() {
  const { game, dispatch, busy, ready } = useGameStore();
  const [name, setName] = useState(''), [shortName, setShortName] = useState('');
  const [color, setColor] = useState(data.palette[0]!);
  const [values, setValues] = useState<CoreValue[]>([]);
  return <div className="founding-form">
    <div className="page-heading"><div><h1>새로운 정당의 첫 페이지</h1><p>2026년 10월 19일, 창당. 이름과 색, 그리고 당이 지킬 핵심가치 세 가지를 정하세요. 시드 {game.seed}</p></div></div>
    <div className="grid side">
    <form className="sim-card" onSubmit={e => { e.preventDefault(); void dispatch({ type: 'CREATE_PARTY', name, shortName, color, values: values as [CoreValue, CoreValue, CoreValue] }); }}>
      <div className="sim-grid"><label>정당 이름 <input value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={20} placeholder="예: 내일의 정당" /></label><label>약칭 <input value={shortName} onChange={e => setShortName(e.target.value)} required maxLength={6} placeholder="예: 내일" /></label></div>
      <fieldset><legend>정당 색상</legend><div className="palette">{data.palette.map(c => <label key={c}><input type="radio" name="party-color" value={c} checked={c === color} onChange={() => setColor(c)} aria-label={`정당 색상 ${c}`} /><span style={{ background: c }} /></label>)}</div></fieldset>
      <fieldset><legend>핵심가치 ({values.length}/3)</legend><p className="muted small">가치는 정체성과 연구 비용의 우선순위에 반영됩니다. 표를 직접 더해 주지는 않습니다. 인재 후보의 관심에도 반영되며, 브랜드 일관성은 우리 정당 화면에서 확인합니다.</p><div className="value-grid">{CORE_VALUES.map(v => <label key={v}><input type="checkbox" checked={values.includes(v)} disabled={!values.includes(v) && values.length === 3} onChange={e => setValues(e.target.checked ? [...values, v] : values.filter(x => x !== v))} /> <strong>{VALUE_LABELS[v]}</strong><small>{data.valueDomainAffinity[v].map(d => DOMAIN_LABELS[d]).join('·')} 연구 비용 우대</small></label>)}</div></fieldset>
      <p className="model-notice">법적 창당 절차(창당준비위원회, 시도당 등록 등)는 게임에서 생략된 추상화입니다.</p><button className="button primary" disabled={busy || !ready || values.length !== 3} type="submit">정당 창당</button>
    </form>
    <aside className="sim-card founding-preview" aria-label="새 정당 미리보기" style={{ ['--party' as string]: color }}>
      <div className="row preview-id"><span className="avatar lg" style={{ background: color }}>{(shortName || name || '당').slice(0, 1)}</span><div><h2>{name || '정당 이름'}</h2><p className="muted">{shortName || '약칭'}, 원외 신생 정당</p></div></div>
      <div className="row">{values.length ? values.map(v => <span key={v} className="chip value-chip" style={{ ['--chip-ink' as string]: color }}>{VALUE_LABELS[v]}</span>) : <span className="muted">핵심가치를 고르세요</span>}</div>
      <ul className="muted small plain-list preview-facts"><li>시작 자금 {formatMoney(data.newParty.money)}</li><li>월 실무 인력 {data.newParty.staffCapacity}, 의제 슬롯 {data.newParty.agendaSlots}</li><li>당원 {data.newParty.membersMin.toLocaleString('ko-KR')}~{data.newParty.membersMax.toLocaleString('ko-KR')}명으로 출발</li></ul>
    </aside>
    </div>
  </div>;
}
