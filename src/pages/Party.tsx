import { Link } from 'react-router-dom';
import { useGameStore } from '../state/store';
import { ResourceStrip } from '../components/Resources';
import { partyManagement as data } from '../data/seeds/party-management';
import { organizationModel } from '../data/seeds/organization';
import { monthlyDonations, researchCost, shortage, staffCap } from '../engine/parties/management';
import { offices } from '../engine/organization';
import { DOMAIN_IDS, DOMAIN_LABELS } from '../types/simulation';
import { VALUE_LABELS } from './Founding';
import { PROMISE_LABELS, ROLE_LABELS } from '../engine/people/recruitment';
import { brandAlignment } from '../engine/parties/brand';
import { LEDGER_LABELS } from '../data/content/labels';
import { Bar, PageHeading, Panel, Stat } from '../components/ui';
import { BarList, LineChart } from '../components/charts';
import { formatDate, formatMoney, formatSignedMoney, shortDate } from '../components/format';

// Labels, not scores: where the evidence leans relative to the declared value.
const lean = (x: number | null) => x === null ? { text: '아직 근거 없음', cls: '' } : x >= 600000 ? { text: '가치 쪽으로 기움', cls: 'gain' } : x >= 400000 ? { text: '중립에 가까움', cls: 'info' } : { text: '가치와 반대로 기움', cls: 'loss' };
const WEEKS_PER_MONTH = 52 / 12;
function refLabel(kind: string, ref: string) {
  if (ref === 'weekly-dues') return '주간 당비';
  if (ref === 'monthly-donations') return '월 후원금';
  if (ref === 'weekly-payroll-rent-and-arrears') return '주간 급여·사무소 임대료';
  if (ref.startsWith('publication:')) return '공약 공표';
  if (ref.startsWith('staff-level:')) return `직원 수준 ${ref.split(':')[1]}로 변경`;
  if (ref === 'internal-survey') return '내부조사 의뢰';
  if (kind === 'research' && (DOMAIN_LABELS as Record<string, string>)[ref]) return `${(DOMAIN_LABELS as Record<string, string>)[ref]} 연구`;
  return LEDGER_LABELS[kind] ?? kind;
}

export function Party() {
  const { game, dispatch, busy } = useGameStore();
  const party = game.playerParty!, finance = game.finance!, perception = game.politics.parties.find(p => p.partyId === party.id)!;
  const disabled = busy || game.status !== 'active';
  const payroll = data.staffLevels[finance.staffLevel]!.weeklyPayroll, rent = offices(game) * organizationModel.officeRent;
  const dues = Math.round(finance.members * data.finance.payingRate * data.finance.monthlyDues / 1_000_000);
  const donations = monthlyDonations(game);
  const monthlyCost = Math.round((payroll + rent) * WEEKS_PER_MONTH);
  const net = dues + donations - monthlyCost;
  const spentByKind: Record<string, number> = {};
  for (const l of finance.ledger) spentByKind[l.kind] = (spentByKind[l.kind] ?? 0) + l.amount;
  const months = game.history.map(h => shortDate(h.date));
  return <>
    <PageHeading eyebrow="우리 정당" title={party.name} sub={<span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: party.color, width: 12, height: 12 }} />{party.shortName} · 창당 {formatDate(party.foundedAt)} {party.values.map(v => <span key={v} className="chip" style={{ background: `${party.color}22`, color: party.color }}>{VALUE_LABELS[v]}</span>)}</span>} />
    <ResourceStrip />
    <div className="stats">
      <Stat label="잔액" value={formatMoney(game.resources!.money)} note={`시작 자금 ${formatMoney(finance.initialMoney)}`} />
      <Stat label="월 수입 (추정)" tone="gain" value={formatMoney(dues + donations)} note={`당비 ${formatMoney(dues)} · 후원금 ${formatMoney(donations)}`} testId="monthly-donations" />
      <Stat label="월 고정 지출" tone="loss" value={formatMoney(monthlyCost)} note={`급여 ${formatMoney(Math.round(payroll * WEEKS_PER_MONTH))} · 임대료 ${formatMoney(Math.round(rent * WEEKS_PER_MONTH))}`} />
      <Stat label="월 순증감" tone={net >= 0 ? 'gain' : 'loss'} value={formatSignedMoney(net)} note={net >= 0 ? '고정비를 수입이 감당합니다' : `이대로면 약 ${Math.max(0, Math.floor(game.resources!.money / Math.max(1, -net)))}개월 버팁니다`} />
      <Stat label="미지급금" tone={finance.arrears > 0 ? 'loss' : undefined} value={formatMoney(finance.arrears)} note={finance.arrears > 0 ? '다음 인력 충전이 절반이 됩니다' : '없음'} />
      <Stat label="당원" value={`${finance.members.toLocaleString('ko-KR')}명`} note={`납부율 ${data.finance.payingRate / 10000}% · 월 당비 ${formatMoney(data.finance.monthlyDues)}`} />
    </div>
    <div className="grid cols-2">
      <Panel title="자금 추이" sub="월말 잔액 · 게임 모형">
        <LineChart ariaLabel="월말 자금 추이" labels={months} format={v => `${(v / 10000).toFixed(1)}억`} zero series={[{ id: 'money', label: '잔액', color: 'var(--accent)', values: game.history.map(h => h.money) }]} />
      </Panel>
      <Panel title="수입과 지출 구성" sub="최근 원장 100건 기준 · 초록 수입, 빨강 지출">
        {finance.ledger.length ? <BarList ariaLabel="원장 종류별 합계" format={formatSignedMoney} items={Object.entries(spentByKind).sort((a, b) => b[1] - a[1]).map(([kind, value]) => ({ label: LEDGER_LABELS[kind] ?? kind, value }))} /> : <p className="empty-state">아직 정산 기록이 없습니다.</p>}
        <p className="muted small" style={{ marginTop: 12 }}>후원금은 매월 말 한 번, 그 시점의 현재 지지에 비례해 들어옵니다(지지 1%당 월 {formatMoney(data.donations.monthlyPerSupport / 100)}, 게임 모형). 정치자금법의 모금·기부 한도는 원문으로 확인하지 못해 적용하지 않았습니다. 원외 정당 국고보조금은 없다고 가정합니다.</p>
      </Panel>
    </div>
    <div className="grid cols-2">
      <Panel title="당 사무처 직원" sub="급여가 가장 큰 고정비입니다">
        <label className="row" style={{ marginBottom: 12 }}><strong>직원 수준</strong><select value={finance.staffLevel} disabled={disabled} onChange={e => void dispatch({ type: 'SET_STAFF_LEVEL', level: Number(e.target.value) })}>{data.staffLevels.map(l => <option key={l.level} value={l.level}>수준 {l.level} · 주급 {formatMoney(l.weeklyPayroll)} · 월 인력 {data.finance.baseStaffCapacity + l.capacity}</option>)}</select></label>
        <div className="table-scroll"><table className="sim-table"><thead><tr><th>수준</th><th className="num">월 실무 인력</th><th className="num">월 급여(추정)</th><th className="num">채용비</th></tr></thead><tbody>{data.staffLevels.map(l => <tr key={l.level} style={l.level === finance.staffLevel ? { background: 'var(--accent-soft)', fontWeight: 650 } : undefined}><th>수준 {l.level}{l.level === finance.staffLevel && ' · 현재'}</th><td className="num">{data.finance.baseStaffCapacity + l.capacity}</td><td className="num loss">{formatMoney(Math.round(l.weeklyPayroll * WEEKS_PER_MONTH))}</td><td className="num">{formatMoney(l.hiringCost)}</td></tr>)}</tbody></table></div>
        <p className="muted small">다음 충전 한도 {staffCap(game)}. 증원은 채용비 차액을 내고, 감원은 무료이며 환급하지 않습니다. 인력 한도는 다음 월간 충전부터 적용됩니다.</p>
      </Panel>
      <Panel title="전문성과 이슈 소유" sub="전문성 → 이슈 소유 인식 → 신뢰. 지지에 직접 더하지 않습니다." className="party-expertise">
        <div className="table-scroll"><table className="sim-table"><thead><tr><th>영역</th><th>전문성 / 소유</th><th>정책 연구</th></tr></thead><tbody>{DOMAIN_IDS.map(d => {
          const cost = researchCost(game, d), active = game.research.find(r => r.domain === d), reason = shortage(game, cost);
          return <tr key={d}><th>{DOMAIN_LABELS[d]}</th><td data-label="전문성 / 소유" style={{ minWidth: 140 }}><div className="spread small"><span>전문성 {(perception.expertise[d] / 10000).toFixed(1)}</span><span className="muted">소유 {(perception.ownership[d] / 10000).toFixed(1)}</span></div><Bar value={perception.expertise[d]} max={1_000_000} label={`${DOMAIN_LABELS[d]} 전문성`} /><div style={{ height: 4 }} /><Bar value={perception.ownership[d]} max={1_000_000} color="var(--grade-4)" label={`${DOMAIN_LABELS[d]} 이슈 소유`} /></td>
            <td>{active ? <span className="chip info">완료 예정 {active.completesAt}</span> : <><button className="button compact" disabled={disabled || !!reason} title={reason ?? undefined} onClick={() => void dispatch({ type: 'START_POLICY_RESEARCH', domain: d })}>{DOMAIN_LABELS[d]} 연구</button><small className="muted" style={{ display: "block", marginTop: 4 }}>{formatMoney(cost.money!)} · 실무 인력 {cost.staffCapacity} · {data.research.weeks}주</small>{reason && <small className="loss" style={{ display: "block" }}>{reason}</small>}</>}</td></tr>;
        })}</tbody></table></div>
      </Panel>
    </div>
    <Panel title="최근 재정 원장" sub={`최근 100건 · 이전 기록 합계 ${formatSignedMoney(finance.ledgerTruncatedSum)}`} flush>
      {!finance.ledger.length ? <p className="empty-state">아직 정산·지출 기록이 없습니다.</p> : <div className="table-scroll" style={{ maxHeight: 360, overflowY: 'auto' }}><table className="sim-table"><thead><tr><th>날짜</th><th>종류</th><th>내용</th><th className="num">금액</th><th className="num">잔액</th></tr></thead><tbody>{[...finance.ledger].reverse().map((l, i) => <tr key={i}><td>{l.date}</td><td><span className={`badge ${l.amount >= 0 ? 'gain' : 'loss'}`}>{LEDGER_LABELS[l.kind] ?? l.kind}</span></td><td>{refLabel(l.kind, l.ref)}</td><td className={`num ${l.amount >= 0 ? 'gain' : 'loss'}`}>{formatSignedMoney(l.amount)}</td><td className="num">{formatMoney(l.balanceAfter)}</td></tr>)}</tbody></table></div>}
    </Panel>
    <div className="grid cols-2" style={{ marginTop: 16 }}>
      <Panel title="브랜드 일관성" sub="창당 때 내세운 가치와 공약·인재의 방향 · 게임 모형" testId="brand-consistency">
        <div className="stack" style={{ gap: 10 }}>{brandAlignment(game).map(r => { const p = lean(r.platform), q = lean(r.recruits); return <div key={r.value} className="spread"><strong>{VALUE_LABELS[r.value]}</strong><span className="row" style={{ gap: 6 }}><span className={`chip ${p.cls}`}>공약: {p.text}</span><span className={`chip ${q.cls}`}>인재: {q.text}</span></span></div>; })}</div>
        <p className="muted small" style={{ marginTop: 12 }}>반대로 기울면 유권자 신뢰 평가가 매월 서서히 낮아지고(최대 {data.brand.maxTrustPenalty / 10000}%), 바로잡으면 서서히 회복합니다. 현재 신뢰 조정: <strong>{game.brandInconsistency < 50000 ? '거의 없음' : game.brandInconsistency < data.brand.warning ? '약함' : '뚜렷함'}</strong>. 득표를 직접 바꾸지 않습니다.</p>
      </Panel>
      <Panel title="인재와 약속" actions={<Link className="link-button small" to="/politicians">인재 화면 →</Link>} testId="party-roster">
        <p>영입 {game.politicians.filter(p => p.status === 'recruited').length}명 · 영입 평판 {game.recruitmentReputation}/100</p>
        <ul className="muted" style={{ paddingLeft: 18 }}>{game.politicians.filter(p => p.status === 'recruited').slice(0, 8).map(p => <li key={p.id}>{p.name} · {ROLE_LABELS[p.role ?? 'member']}</li>)}</ul>
        {game.promises.length ? <ul style={{ paddingLeft: 18 }}>{game.promises.map(p => <li key={p.id}>{game.politicians.find(x => x.id === p.politicianId)!.name}: {PROMISE_LABELS[p.type]} · <span className={p.status === 'kept' ? 'gain' : p.status === 'broken' ? 'loss' : 'warn'}>{p.status === 'pending' ? (p.due === 'NOMINATION' ? '대기 (등록 마감에 판정)' : `대기 (기한 ${p.due})`) : p.status === 'kept' ? '지킴' : '깨짐'}</span></li>)}</ul> : <p className="muted">아직 약속이 없습니다.</p>}
        <p className="muted small">가상 인물입니다.</p>
        <h3>내부조사 이력</h3>
        {game.internalSurveys.length ? <ol className="timeline" style={{ padding: 0 }}>{[...game.internalSurveys].reverse().map((s, i) => <li key={i} className="reached"><time>{formatDate(s.date)}</time><span>모형 설명 범위 ±{s.margin / 10000}%p · 데이터 허브에서 결과 확인</span></li>)}</ol> : <p className="muted small">아직 내부조사를 의뢰하지 않았습니다. 데이터 허브에서 의뢰할 수 있습니다.</p>}
      </Panel>
    </div>
  </>;
}
