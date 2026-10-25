import { useMemo, useState } from 'react';
import { useGameStore } from '../state/store';
import { ResourceStrip, moneyLabel } from '../components/Resources';
import { SimulationNotice } from '../components/Simulation';
import { REGION_LABELS } from '../data/content/labels';
import { politicianModel } from '../data/seeds/politicians';
import { PROMISE_LABELS, ROLE_LABELS, recruitmentBand, recruitmentCost, recruitmentRefusal, roleHolder } from '../engine/people/recruitment';
import { ATTRIBUTE_IDS, PROMISE_TYPES, ROLE_IDS, type AttributeId, type Politician, type PromiseType, type RoleId } from '../types/people';
import { DOMAIN_IDS, DOMAIN_LABELS, type DomainId } from '../types/simulation';
import { VALUE_LABELS } from './Founding';

const ATTRIBUTE_LABELS: Record<AttributeId, string> = { recognition: '인지도(Recognition)', localBase: '지역 기반(LocalBase)', campaigning: '선거운동(Campaigning)', organization: '조직력(Organization)', media: '미디어(Media)', negotiation: '협상(Negotiation)', broadAppeal: '대중 호감(BroadAppeal)' };
// Honest usage notes: nothing about a person changes support in C2b.
const ATTRIBUTE_USE: Record<AttributeId, string> = { recognition: 'C2c 인지도 채널에서 사용됩니다', media: 'C2c 인지도 채널에서 사용됩니다', localBase: 'Phase D에서 사용됩니다', campaigning: 'Phase D에서 사용됩니다', organization: 'Phase D에서 사용됩니다', negotiation: 'Phase D에서 사용됩니다', broadAppeal: 'Phase D에서 사용됩니다' };
const STATUS_LABELS: Record<Politician['status'], string> = { prospect: '영입 대기', recruited: '영입됨', declined: '거절 · 재접촉 대기', unavailable: '접촉 불가' };
const backgroundLabel = (id: string) => politicianModel.backgrounds.find(b => b.id === id)?.label ?? id;
const topDomain = (p: Politician): DomainId => [...DOMAIN_IDS].sort((a, b) => p.policyExpertise[b] - p.policyExpertise[a] || (a < b ? -1 : 1))[0]!;
type SortKey = 'name' | 'age' | 'recognition' | 'expertise';

export function Politicians() {
  const { game, dispatch, busy, ready } = useGameStore();
  const [view, setView] = useState<'prospects' | 'roster'>('prospects');
  const [region, setRegion] = useState('all');
  const [background, setBackground] = useState('all');
  const [domain, setDomain] = useState<'all' | DomainId>('all');
  const [sort, setSort] = useState<SortKey>('name');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [role, setRole] = useState<RoleId>('member');
  const [promises, setPromises] = useState<PromiseType[]>([]);
  const disabled = !ready || busy || game.status !== 'active';
  const rows = useMemo(() => game.politicians
    .filter(p => view === 'roster' ? p.status === 'recruited' : p.status === 'prospect' || p.status === 'declined')
    .filter(p => (region === 'all' || p.regionId === region) && (background === 'all' || p.background === background) && (domain === 'all' || topDomain(p) === domain))
    .sort((a, b) => sort === 'age' ? a.age - b.age : sort === 'recognition' ? b.attributes.recognition - a.attributes.recognition : sort === 'expertise' ? b.policyExpertise[topDomain(b)] - a.policyExpertise[topDomain(a)] : a.name.localeCompare(b.name, 'ko')) ,
  [game.politicians, view, region, background, domain, sort]);
  const selected = game.politicians.find(p => p.id === selectedId) ?? rows[0];
  const cost = recruitmentCost();
  const refusal = selected && selected.status !== 'recruited' ? recruitmentRefusal(game, selected.id, role, promises) : null;
  const band = selected && selected.status === 'prospect' && game.playerParty ? recruitmentBand(game, selected.id, role, promises) : null;
  const personPromises = selected ? game.promises.filter(p => p.politicianId === selected.id) : [];
  const counts = { prospects: game.politicians.filter(p => p.status === 'prospect').length, roster: game.politicians.filter(p => p.status === 'recruited').length };
  return <>
    <div className="page-heading"><div><p className="eyebrow">POLITICIANS / C2b</p><h1>함께할 사람을 찾다</h1><p className="muted">영입 후보 {counts.prospects}명 · 영입 {counts.roster}명 · 누적 생성 {game.politicians.length}명 · 영입 평판 {game.recruitmentReputation ?? '—'}/100</p></div></div>
    <ResourceStrip /><SimulationNotice>가상 인물입니다. 실존 인물과 무관하며 이름이 우연히 같을 수 있습니다. 능력치는 GAME MODEL 값입니다. C2b에서 영입한 인물은 아직 지지 계산에 영향을 주지 않습니다(인지도·전문성 채널은 C2c).</SimulationNotice>
    <div className="sim-tabs" role="group" aria-label="인재 보기">{([['prospects', `영입 후보 (${counts.prospects})`], ['roster', `영입한 인재 (${counts.roster})`]] as const).map(([id, label]) => <button key={id} aria-pressed={view === id} className={view === id ? 'active' : ''} onClick={() => { setView(id); setSelectedId(null); }}>{label}</button>)}</div>
    <div className="sim-toolbar">
      <label>권역 <select value={region} onChange={e => setRegion(e.target.value)}><option value="all">전체</option>{Object.entries(REGION_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>배경 <select value={background} onChange={e => setBackground(e.target.value)}><option value="all">전체</option>{politicianModel.backgrounds.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}</select></label>
      <label>주요 전문 <select value={domain} onChange={e => setDomain(e.target.value as DomainId | 'all')}><option value="all">전체</option>{DOMAIN_IDS.map(d => <option key={d} value={d}>{DOMAIN_LABELS[d]}</option>)}</select></label>
      <label>정렬 <select value={sort} onChange={e => setSort(e.target.value as SortKey)}><option value="name">이름</option><option value="age">나이</option><option value="recognition">인지도</option><option value="expertise">최고 전문성</option></select></label>
    </div>
    <div className="sim-grid">
      <section className="sim-card"><h2>{view === 'roster' ? '영입한 인재' : '영입 후보'}</h2>{!rows.length ? <p>{view === 'roster' ? '아직 영입한 인재가 없습니다.' : '조건에 맞는 영입 후보가 없습니다.'}</p> :
        <div className="table-scroll people-list"><table className="sim-table people-table"><thead><tr><th>이름</th><th>배경 · 권역</th><th>주요 전문</th><th>상태</th></tr></thead><tbody>{rows.map(p => <tr key={p.id}>
          <th><button className="link-button" aria-pressed={selected?.id === p.id} onClick={() => setSelectedId(p.id)}>{p.name}</button><br /><small className="muted">{p.age}세 · {p.gender === 'female' ? '여' : '남'}</small></th>
          <td>{backgroundLabel(p.background)}<br /><small className="muted">{REGION_LABELS[p.regionId]}</small></td><td>{DOMAIN_LABELS[topDomain(p)]} {p.policyExpertise[topDomain(p)]}</td>
          <td>{p.status === 'recruited' ? ROLE_LABELS[p.role ?? 'member'] : STATUS_LABELS[p.status]}</td></tr>)}</tbody></table></div>}</section>
      {selected ? <section className="sim-card" data-testid="politician-detail"><div className="section-heading"><h2>{selected.name}</h2><span className="outline-badge">{STATUS_LABELS[selected.status]}</span></div>
        <p>{selected.age}세 · {backgroundLabel(selected.background)} · {REGION_LABELS[selected.regionId]} · 당에 대한 신뢰 {selected.trust}/100</p>
        <p className="muted small">가치 성향: {Object.entries(selected.valueLean).map(([v, lean]) => `${VALUE_LABELS[v as keyof typeof VALUE_LABELS]} ${Math.round(lean / 10000)}`).join(' · ')}</p>
        <div className="table-scroll"><table className="sim-table attr-table"><thead><tr><th>속성</th><th>값</th><th>사용</th></tr></thead><tbody>
          {ATTRIBUTE_IDS.map(id => <tr key={id}><th>{ATTRIBUTE_LABELS[id]}</th><td>{selected.attributes[id]}</td><td className="small muted">{ATTRIBUTE_USE[id]}</td></tr>)}
          {DOMAIN_IDS.map(d => <tr key={d}><th>정책 전문성 · {DOMAIN_LABELS[d]}</th><td>{selected.policyExpertise[d]}</td><td className="small muted">C2c 당 전문성 채널에서 사용됩니다</td></tr>)}
        </tbody></table></div>
        {selected.status === 'recruited' ? <>
          <label>역할 <select value={selected.role ?? 'member'} disabled={disabled} onChange={e => void dispatch({ type: 'ASSIGN_ROLE', politicianId: selected.id, role: e.target.value as RoleId })}>{ROLE_IDS.map(r => { const holder = roleHolder(game, r); return <option key={r} value={r} disabled={!!holder && holder.id !== selected.id}>{ROLE_LABELS[r]}{holder && holder.id !== selected.id ? ` (${holder.name})` : ''}</option>; })}</select></label>
          <p className="muted small">약속한 정책위원장 자리에서 해임하면 약속은 깨진 것으로 기록됩니다.</p>
        </> : <fieldset className="recruit-form"><legend>영입 제안</legend>
          <label>역할 <select value={role} onChange={e => setRole(e.target.value as RoleId)}>{ROLE_IDS.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></label>
          <div role="group" aria-label="약속">{PROMISE_TYPES.map(t => <label key={t} className="check-row"><input type="checkbox" checked={promises.includes(t)} onChange={e => setPromises(e.target.checked ? [...promises, t] : promises.filter(x => x !== t))} />{PROMISE_LABELS[t]}{t !== 'policy_chair' ? ' (Phase D 공천에서 이행)' : ` (${politicianModel.recruitment.promiseWindowWeeks}주 안에 임명)`}</label>)}</div>
          <p>비용: {moneyLabel(cost.money)} · Staff {cost.staffCapacity}{band && <> · 성공 가능성 <strong data-testid="recruit-band">{band}</strong></>}</p>
          <p className="muted small">가능성은 가치·공약 일치, 당의 공개 조사 흐름과 인지도, 역할, 약속, 개인 신뢰, 영입 평판으로 정해지며 정확한 수치는 공개하지 않습니다. 거절되면 {politicianModel.recruitment.cooldownWeeks}주 동안 재접촉할 수 없습니다.</p>
          <button className="button primary" disabled={disabled || !!refusal} title={refusal ?? undefined} onClick={() => void dispatch({ type: 'RECRUIT_POLITICIAN', politicianId: selected.id, role, promises: [...promises] })}>영입 제안</button>
          {refusal && <p className="muted" data-testid="recruit-refusal">{refusal}</p>}
        </fieldset>}
        <h3>약속</h3>{personPromises.length ? <ul>{personPromises.map(p => <li key={p.id}>{PROMISE_LABELS[p.type]} · {p.madeAt} · {p.status === 'pending' ? (p.due === 'NOMINATION' ? '대기 — 공천은 Phase D에서 구현됩니다' : `대기 — 기한 ${p.due}`) : p.status === 'kept' ? `지킴 (${p.resolvedAt})` : `깨짐 (${p.resolvedAt})`}</li>)}</ul> : <p className="muted">이 인물에게 한 약속이 없습니다.</p>}
      </section> : <section className="sim-card"><p>인물을 선택하세요.</p></section>}
    </div>
    <p className="muted small">가상 인물입니다. 실존 인물과 무관하며 이름이 우연히 같을 수 있습니다.</p>
  </>;
}
