import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useGameStore } from '../state/store';
import { ResourceStrip } from '../components/Resources';
import { SimulationNotice } from '../components/Simulation';
import { REGION_LABELS } from '../data/content/labels';
import { politicianModel } from '../data/seeds/politicians';
import { PROMISE_LABELS, ROLE_LABELS, recruitmentBand, recruitmentCost, recruitmentRefusal, roleHolder } from '../engine/people/recruitment';
import { PROMISE_TYPES, ROLE_IDS, type AttributeId, type Politician, type PromiseType, type RoleId } from '../types/people';
import { DOMAIN_IDS, DOMAIN_LABELS, type DomainId } from '../types/simulation';
import { VALUE_LABELS } from './Founding';
import { ListWarning } from './NominationPanel';
import { AttrValue, Bar, Modal, PageHeading, Pills, Tabs } from '../components/ui';
import { Radar } from '../components/charts';
import { Icon } from '../components/Icon';
import { formatDate, formatMoney, grade } from '../components/format';

const ATTRIBUTE_LABELS: Record<AttributeId, string> = { recognition: '인지도', localBase: '지역 기반', campaigning: '선거운동', organization: '조직력', media: '미디어', negotiation: '협상', broadAppeal: '대중 호감' };
// Honest usage notes per §16.
const ATTRIBUTE_USE: Record<AttributeId, string> = { recognition: '영입 시 인지도 노출(상한·체감)', media: '영입 시 인지도 노출(상한·체감)', localBase: '경선 점수, 출신 권역 지역구 후보 효과', campaigning: '경선 점수, 지역구 후보 효과', organization: '막판 총력전 유세 누적 효율', negotiation: '영입 협상, 경선 점수, 전략공천 갈등 완화', broadAppeal: '경선 점수, 지역구 후보 효과' };
const GROUPS: { title: string; ids: AttributeId[] }[] = [{ title: '선거력', ids: ['recognition', 'localBase', 'campaigning', 'broadAppeal'] }, { title: '조직·대외', ids: ['organization', 'media', 'negotiation'] }];
const STATUS: Record<Politician['status'], { label: string; cls: string }> = { prospect: { label: '영입 대기', cls: 'info' }, recruited: { label: '영입됨', cls: 'gain' }, declined: { label: '거절 · 재접촉 대기', cls: 'loss' }, unavailable: { label: '접촉 불가', cls: '' } };
const AVATAR = ['#3550a8', '#2f9b57', '#c7790f', '#138a8a', '#8864b5', '#c93838', '#5d6b7d'];
const backgroundLabel = (id: string) => politicianModel.backgrounds.find(b => b.id === id)?.label ?? id;
const topDomain = (p: Politician): DomainId => [...DOMAIN_IDS].sort((a, b) => p.policyExpertise[b] - p.policyExpertise[a] || (a < b ? -1 : 1))[0]!;
const avatarColor = (p: Politician) => AVATAR[p.id.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR.length]!;
const overall = (p: Politician) => Math.round((p.attributes.recognition + p.attributes.localBase + p.attributes.campaigning + p.attributes.broadAppeal) / 4);
type SortKey = 'name' | 'age' | 'recognition' | 'campaigning' | 'localBase' | 'broadAppeal' | 'expertise';

function Avatar({ person, large }: { person: Politician; large?: boolean }) {
  return <span className={`avatar ${large ? 'lg' : ''}`} style={{ background: avatarColor(person) }} aria-hidden="true">{person.name.slice(0, 1)}</span>;
}

function Profile({ person, onRecruit }: { person: Politician; onRecruit: (role: RoleId, promises: PromiseType[]) => void }) {
  const { game, dispatch, busy, ready } = useGameStore();
  const [role, setRole] = useState<RoleId>('member');
  const [promises, setPromises] = useState<PromiseType[]>([]);
  const disabled = !ready || busy || game.status !== 'active';
  const cost = recruitmentCost();
  const refusal = person.status !== 'recruited' ? recruitmentRefusal(game, person.id, role, promises) : null;
  const band = person.status === 'prospect' && game.playerParty ? recruitmentBand(game, person.id, role, promises) : null;
  const personPromises = game.promises.filter(p => p.politicianId === person.id);
  return <div className="profile">
    <header className="profile-head">
      <Avatar person={person} large />
      <div style={{ minWidth: 0 }}><h2>{person.name}</h2><p className="muted">{person.age}세 · {person.gender === 'female' ? '여' : '남'} · {backgroundLabel(person.background)} · {REGION_LABELS[person.regionId]}</p>
        <div className="row" style={{ marginTop: 6 }}><span className={`badge ${STATUS[person.status].cls}`}>{STATUS[person.status].label}</span>{person.role && <span className="badge accent">{ROLE_LABELS[person.role]}</span>}<span className="badge">가상 인물</span></div></div>
      <div className="profile-trust"><span className="muted small">당에 대한 신뢰</span><strong>{person.trust}<small>/100</small></strong><Bar value={person.trust} color={person.trust >= 60 ? 'var(--gain)' : person.trust >= 35 ? 'var(--warn)' : 'var(--loss)'} label="당에 대한 신뢰" /></div>
    </header>
    <div className="profile-grid">
      <section>{GROUPS.map(g => <div key={g.title} className="attr-group"><h3>{g.title}</h3>{g.ids.map(id => <div key={id} className="attr-row"><span>{ATTRIBUTE_LABELS[id]}<small>{ATTRIBUTE_USE[id]}</small></span><AttrValue value={person.attributes[id]} label={ATTRIBUTE_LABELS[id]} /></div>)}</div>)}
        <p className="muted small">능력치는 0–100 게임 모형 값입니다(색: 빨강 낮음 → 청록 높음).</p></section>
      <section><h3>정책 전문성</h3><Radar ariaLabel={`${person.name} 정책 전문성`} axes={DOMAIN_IDS.map(d => DOMAIN_LABELS[d])} values={DOMAIN_IDS.map(d => person.policyExpertise[d])} color={avatarColor(person)} />
        <div className="row" style={{ justifyContent: 'center', gap: 6 }}>{DOMAIN_IDS.map(d => <span key={d} className={`chip text-grade-${grade(person.policyExpertise[d])}`}>{DOMAIN_LABELS[d]} {person.policyExpertise[d]}</span>)}</div>
        <h3>가치 성향</h3><div className="row">{Object.entries(person.valueLean).map(([v, lean]) => <span key={v} className="chip info">{VALUE_LABELS[v as keyof typeof VALUE_LABELS]} {Math.round(lean / 10000)}</span>)}</div>
        <p className="muted small" style={{ marginTop: 6 }}>영입하면 인지도 노출과 당 전문성(이슈 소유)으로만 서서히 작용하며 지지를 직접 더하지 않습니다.</p></section>
    </div>
    {person.status === 'recruited' ? <section className="profile-action">
      <label className="row"><strong>역할</strong><select value={person.role ?? 'member'} disabled={disabled} onChange={e => void dispatch({ type: 'ASSIGN_ROLE', politicianId: person.id, role: e.target.value as RoleId })}>{ROLE_IDS.map(r => { const holder = roleHolder(game, r); return <option key={r} value={r} disabled={!!holder && holder.id !== person.id}>{ROLE_LABELS[r]}{holder && holder.id !== person.id ? ` (${holder.name})` : ''}</option>; })}</select></label>
      <p className="muted small">약속한 정책위원장 자리에서 해임하면 약속은 깨진 것으로 기록됩니다.</p>
    </section> : <fieldset className="profile-action recruit-form"><legend>영입 제안</legend>
      <div className="grid cols-2"><label className="row"><strong>역할</strong><select value={role} onChange={e => setRole(e.target.value as RoleId)}>{ROLE_IDS.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></label>
        <div role="group" aria-label="약속">{PROMISE_TYPES.map(t => <label key={t} className="check-row"><input type="checkbox" checked={promises.includes(t)} onChange={e => setPromises(e.target.checked ? [...promises, t] : promises.filter(x => x !== t))} />{PROMISE_LABELS[t]}{t !== 'policy_chair' ? ' (공천에서 이행)' : ` (${politicianModel.recruitment.promiseWindowWeeks}주 안에 임명)`}</label>)}</div></div>
      <div className="spread"><p>비용 {formatMoney(cost.money)} · 실무 인력 {cost.staffCapacity}{band && <> · 성공 가능성 <strong data-testid="recruit-band" className={band === '높음' ? 'gain' : band === '낮음' ? 'loss' : 'warn'}>{band}</strong></>}</p>
        <button className="button primary" disabled={disabled || !!refusal} title={refusal ?? undefined} onClick={() => onRecruit(role, [...promises])}>영입 제안</button></div>
      <p className="muted small">가능성은 가치·공약 일치, 당의 공개 조사 흐름과 인지도, 역할, 약속, 개인 신뢰, 영입 평판으로 정해지며 정확한 수치는 공개하지 않습니다. 거절되면 {politicianModel.recruitment.cooldownWeeks}주 동안 재접촉할 수 없습니다.</p>
      {refusal && <p className="loss small" data-testid="recruit-refusal">{refusal}</p>}
    </fieldset>}
    <section><h3>약속</h3>{personPromises.length ? <ul style={{ paddingLeft: 18 }}>{personPromises.map(p => <li key={p.id}>{PROMISE_LABELS[p.type]} · {p.madeAt} · {p.status === 'pending' ? (p.due === 'NOMINATION' ? '대기 — 후보 등록 마감(2028-03-20)에 공천 결과로 판정' : `대기 — 기한 ${p.due}`) : p.status === 'kept' ? `지킴 (${p.resolvedAt})` : `깨짐 (${p.resolvedAt})`}</li>)}</ul> : <p className="muted">이 인물에게 한 약속이 없습니다.</p>}</section>
  </div>;
}

export function Politicians() {
  const { game, dispatch } = useGameStore();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<'prospects' | 'roster'>('prospects');
  const [region, setRegion] = useState('all');
  const [background, setBackground] = useState('all');
  const [domain, setDomain] = useState<'all' | DomainId>('all');
  const [sort, setSort] = useState<SortKey>('name');
  const [pending, setPending] = useState<{ id: string; role: RoleId; promises: PromiseType[] } | null>(null);
  const [result, setResult] = useState<{ id: string; ok: boolean; role: RoleId; promises: PromiseType[] } | null>(null);
  const openId = params.get('id');
  const open = game.politicians.find(p => p.id === openId) ?? null;
  const setOpen = (id: string | null) => setParams(id ? { id } : {});
  // The recruitment draw happens in the engine; the screen reads the outcome from the person's status.
  useEffect(() => {
    if (!pending) return;
    const person = game.politicians.find(p => p.id === pending.id);
    if (person && person.status !== 'prospect') { setResult({ id: pending.id, ok: person.status === 'recruited', role: pending.role, promises: pending.promises }); setPending(null); setOpen(null); }
  }, [game.politicians, pending]);
  const rows = useMemo(() => game.politicians
    .filter(p => view === 'roster' ? p.status === 'recruited' : p.status === 'prospect' || p.status === 'declined')
    .filter(p => (region === 'all' || p.regionId === region) && (background === 'all' || p.background === background) && (domain === 'all' || topDomain(p) === domain))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'ko') : sort === 'age' ? a.age - b.age : sort === 'expertise' ? b.policyExpertise[topDomain(b)] - a.policyExpertise[topDomain(a)] : b.attributes[sort] - a.attributes[sort] || a.name.localeCompare(b.name, 'ko')),
  [game.politicians, view, region, background, domain, sort]);
  const counts = { prospects: game.politicians.filter(p => p.status === 'prospect').length, roster: game.politicians.filter(p => p.status === 'recruited').length };
  const recruit = (person: Politician, role: RoleId, promises: PromiseType[]) => { setPending({ id: person.id, role, promises }); void dispatch({ type: 'RECRUIT_POLITICIAN', politicianId: person.id, role, promises }); };
  const resultPerson = result ? game.politicians.find(p => p.id === result.id) : null;
  const Th = ({ id, children }: { id: SortKey; children: string }) => <th className={id === 'name' ? '' : 'num'}><button className={`sort-button ${sort === id ? 'active' : ''}`} onClick={() => setSort(id)} aria-pressed={sort === id}>{children}{sort === id && ' ▾'}</button></th>;
  return <>
    <PageHeading eyebrow="인재" title="함께할 사람을 찾다" sub={`영입 후보 ${counts.prospects}명 · 영입 ${counts.roster}명 · 누적 생성 ${game.politicians.length}명 · 영입 평판 ${game.recruitmentReputation ?? '—'}/100`} />
    <ResourceStrip /><SimulationNotice>가상 인물입니다. 실존 인물과 무관하며 이름이 우연히 같을 수 있습니다. 능력치는 게임 모형 값입니다.</SimulationNotice>
    <Tabs label="인재 보기" value={view} onChange={setView} options={[{ id: 'prospects', label: '영입 후보', count: counts.prospects }, { id: 'roster', label: '영입한 인재', count: counts.roster }]} />
    {view === 'roster' && <ListWarning />}
    <div className="sim-toolbar">
      <Pills label="권역" value={region} onChange={setRegion} options={[{ id: 'all', label: '전체 권역' }, ...Object.entries(REGION_LABELS).map(([id, label]) => ({ id, label }))]} />
      <label>배경 <select value={background} onChange={e => setBackground(e.target.value)}><option value="all">전체</option>{politicianModel.backgrounds.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}</select></label>
      <label>주요 전문 <select value={domain} onChange={e => setDomain(e.target.value as DomainId | 'all')}><option value="all">전체</option>{DOMAIN_IDS.map(d => <option key={d} value={d}>{DOMAIN_LABELS[d]}</option>)}</select></label>
    </div>
    <section className="panel">{!rows.length ? <p className="empty-state">{view === 'roster' ? '아직 영입한 인재가 없습니다.' : '조건에 맞는 영입 후보가 없습니다.'}</p> :
      <div className="table-scroll"><table className="sim-table people-table roster"><thead><tr><Th id="name">이름</Th><Th id="age">나이</Th><th>배경 · 권역</th><Th id="recognition">인지도</Th><Th id="campaigning">선거운동</Th><Th id="localBase">지역 기반</Th><Th id="broadAppeal">대중 호감</Th><Th id="expertise">주요 전문</Th><th>상태</th></tr></thead>
        <tbody>{rows.map(p => <tr key={p.id} className="clickable" onClick={() => setOpen(p.id)}>
          <th><button className="person-button" onClick={e => { e.stopPropagation(); setOpen(p.id); }}><Avatar person={p} /><span><strong>{p.name}</strong><small className="muted">종합 {overall(p)}</small></span></button></th>
          <td className="num">{p.age}세 · {p.gender === 'female' ? '여' : '남'}</td>
          <td>{backgroundLabel(p.background)}<br /><small className="muted">{REGION_LABELS[p.regionId]}</small></td>
          {(['recognition', 'campaigning', 'localBase', 'broadAppeal'] as const).map(id => <td key={id} className="num"><AttrValue value={p.attributes[id]} label={ATTRIBUTE_LABELS[id]} /></td>)}
          <td className="num">{DOMAIN_LABELS[topDomain(p)]} <span className={`text-grade-${grade(p.policyExpertise[topDomain(p)])}`}><strong>{p.policyExpertise[topDomain(p)]}</strong></span></td>
          <td><span className={`badge ${STATUS[p.status].cls}`}>{p.status === 'recruited' ? ROLE_LABELS[p.role ?? 'member'] : STATUS[p.status].label}</span></td>
        </tr>)}</tbody></table></div>}</section>
    <p className="muted small" style={{ marginTop: 10 }}>행을 누르면 인물 프로필이 열립니다. 열 제목을 누르면 정렬합니다. 가상 인물이며 실존 인물과 무관합니다.</p>
    {open && <Modal title="인물 프로필" onClose={() => setOpen(null)} testId="politician-detail"><Profile key={open.id} person={open} onRecruit={(role, promises) => recruit(open, role, promises)} /></Modal>}
    {result && resultPerson && <Modal narrow title="영입 결과" onClose={() => setResult(null)}>
      <div className={`result ${result.ok ? 'gain' : 'loss'}`} data-testid="recruit-result">
        <div className="result-icon"><Icon name={result.ok ? 'check' : 'close'} size={32} /></div>
        <h2>{result.ok ? `${resultPerson.name} 영입 성공` : `${resultPerson.name}이(가) 제안을 거절했습니다`}</h2>
        {result.ok ? <p>{ROLE_LABELS[result.role]}(으)로 합류했습니다.{result.promises.length ? ` 약속: ${result.promises.map(t => PROMISE_LABELS[t]).join(', ')}.` : ''} 영입한 인재 탭에서 역할을 바꾸거나 공천할 수 있습니다.</p>
          : <p>{resultPerson.cooldownUntil ? `${formatDate(resultPerson.cooldownUntil)}부터 다시 접촉할 수 있습니다.` : '나중에 다시 접촉할 수 있습니다.'} 공약과 가치가 맞고 당이 성장할수록 가능성이 높아집니다.</p>}
        <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}><button className="button" onClick={() => { setResult(null); setOpen(result.id); }}>프로필 보기</button><button className="button primary" onClick={() => setResult(null)}>확인</button></div>
      </div>
    </Modal>}
  </>;
}
