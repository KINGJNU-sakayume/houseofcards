import { useState } from 'react';
import { useGameStore } from '../state/store';
import { ResourceStrip, moneyLabel } from '../components/Resources';
import { SimulationNotice } from '../components/Simulation';
import { REGION_LABELS } from '../data/content/labels';
import { REGION_IDS } from '../data/reality/schema';
import { organizationModel as org } from '../data/seeds/organization';
import { INVESTMENT_EFFECTS, INVESTMENT_LABELS, investmentCost, investmentRefusal, offices } from '../engine/organization';
import { forumActive, partyProfile, regionExposureMultiplier, scoutingActive } from '../engine/organization/channels';
import { INVESTMENT_KINDS, type InvestmentKind } from '../types/party';

export function Organization() {
  const { game, dispatch, busy, ready } = useGameStore();
  const [regionId, setRegionId] = useState<string>(REGION_IDS[0]);
  const [kind, setKind] = useState<InvestmentKind>('member_drive');
  const [intensity, setIntensity] = useState(1);
  const disabled = !ready || busy || game.status !== 'active';
  const level = Math.min(intensity, org.kinds[kind].maxIntensity);
  const cost = investmentCost(kind, level), refusal = investmentRefusal(game, regionId, kind, level);
  const count = offices(game);
  return <>
    <div className="page-heading"><div><p className="eyebrow">ORGANIZATION / C2c</p><h1>지역에 뿌리내리다</h1><p className="muted">8개 권역 · 당원 {game.finance!.members.toLocaleString()}명 · 지역사무소 {count}곳 · 사무소 임대료 주 {moneyLabel(count * org.officeRent)}</p></div></div>
    <ResourceStrip /><SimulationNotice>권역 조직 수준(0–100)은 GAME MODEL 값입니다. 인물의 조직력 속성, 권역 조직, 전국 정당 세력은 서로 다른 값입니다. 조직은 지지를 직접 더하지 않습니다.</SimulationNotice>
    <section className="sim-card" data-testid="org-limits"><h2>조직이 하는 일 / 아직 하지 않는 일</h2>
      <ul><li>조직 수준과 정책간담회는 그 권역 유권자에게 전달되는 공약 노출을 키워 인지도를 서서히 올립니다(공표한 공약이나 영입 인물의 인지도가 있어야 전달할 것이 있습니다).</li>
        <li>후보발굴은 그 권역 출신 인재 후보가 나올 확률 가중치만 올립니다.</li><li>당원은 당비(Money)에만 쓰입니다. 지역사무소는 임대료가 들고 월 Staff Capacity를 늘립니다.</li>
        <li>활동 없이 {org.decayGraceDays}일이 지나면 조직 수준이 매월 {org.decayPerMonth}(사무소가 있으면 {org.officeDecayPerMonth})씩 낮아집니다.</li></ul>
      <p className="muted small">아직 하지 않는 일: 캠페인 실행, 투표율 동원, 전략투표 생존가능성, 지역구 후보 공천은 Phase D에서 구현됩니다. 현재 영입 인물의 프로필 노출 항은 {(partyProfile(game) / 10000).toFixed(1)}%p(상한 {org.profileCap / 10000}%p)입니다.</p></section>
    <section className="sim-card"><h2>권역별 조직</h2><div className="table-scroll"><table className="sim-table people-table"><thead><tr><th>권역</th><th>수준 · 당원</th><th>사무소 · 진행 중</th><th>효과</th></tr></thead><tbody>{REGION_IDS.map(id => { const r = game.regionalOrganization[id]!; const forum = forumActive(game, id), scouting = scoutingActive(game, id); return <tr key={id} data-testid={`region-${id}`}>
      <th>{REGION_LABELS[id]}</th><td>수준 {r.level} · 당원 {r.members.toLocaleString()}명</td>
      <td>{r.office ? `사무소 있음 (주 ${moneyLabel(org.officeRent)})` : '사무소 없음'}{r.investments.map(i => <span key={i.kind}><br />{INVESTMENT_LABELS[i.kind]} 강도 {i.intensity} · 완료 {i.completesAt}</span>)}</td>
      <td className="small">노출 배율 ×{(regionExposureMultiplier(game, id) / 1_000_000).toFixed(2)}{forum ? ` · 정책간담회 ~${forum.until}` : ''}{scouting ? ` · 후보발굴 ~${scouting.until}` : ''}<br /><span className="muted">마지막 활동 {r.lastActivity}</span></td></tr>; })}</tbody></table></div></section>
    <section className="sim-card"><h2>투자</h2><fieldset className="recruit-form"><legend>새 투자</legend>
      <label>권역 <select value={regionId} onChange={e => setRegionId(e.target.value)}>{REGION_IDS.map(id => <option key={id} value={id}>{REGION_LABELS[id]}</option>)}</select></label>
      <label>종류 <select value={kind} onChange={e => setKind(e.target.value as InvestmentKind)}>{INVESTMENT_KINDS.map(k => <option key={k} value={k}>{INVESTMENT_LABELS[k]}</option>)}</select></label>
      <label>강도 <select value={level} onChange={e => setIntensity(Number(e.target.value))}>{Array.from({ length: org.kinds[kind].maxIntensity }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label>
      <p>{INVESTMENT_EFFECTS[kind]}</p>
      <p>비용: {moneyLabel(cost.money!)} · Staff {cost.staffCapacity} · {org.kinds[kind].weeks}주 소요</p>
      <button className="button primary" disabled={disabled || !!refusal} title={refusal ?? undefined} onClick={() => void dispatch({ type: 'INVEST_REGION', regionId, kind, intensity: level })}>투자 시작</button>
      {refusal && <p className="muted" data-testid="invest-refusal">{refusal}</p>}
    </fieldset></section>
  </>;
}
