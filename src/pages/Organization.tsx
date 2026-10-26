import { useState } from 'react';
import { useGameStore } from '../state/store';
import { ResourceStrip } from '../components/Resources';
import { REGION_LABELS } from '../data/content/labels';
import { REGION_IDS } from '../data/reality/schema';
import { organizationModel as org } from '../data/seeds/organization';
import { INVESTMENT_EFFECTS, INVESTMENT_LABELS, investmentCost, investmentRefusal, offices } from '../engine/organization';
import { forumActive, partyProfile, regionExposureMultiplier, scoutingActive } from '../engine/organization/channels';
import { INVESTMENT_KINDS, type InvestmentKind } from '../types/party';
import { Bar, PageHeading, Panel, Stat } from '../components/ui';
import { formatDate, formatMoney } from '../components/format';

// Schematic tile map (not geographic): rough relative positions of the eight game regions.
const AREAS: Record<string, string> = { 'gyeonggi-incheon': 'gi', seoul: 'se', gangwon: 'gw', chungcheong: 'cc', tk: 'tk', honam: 'hn', pk: 'pk', jeju: 'jj' };

export function Organization() {
  const { game, dispatch, busy, ready } = useGameStore();
  const [regionId, setRegionId] = useState<string>(REGION_IDS[0]);
  const [kind, setKind] = useState<InvestmentKind>('member_drive');
  const [intensity, setIntensity] = useState(1);
  const disabled = !ready || busy || game.status !== 'active';
  const level = Math.min(intensity, org.kinds[kind].maxIntensity);
  const cost = investmentCost(kind, level), refusal = investmentRefusal(game, regionId, kind, level);
  const count = offices(game);
  const regions = REGION_IDS.map(id => ({ id, r: game.regionalOrganization[id]! }));
  const avg = Math.round(regions.reduce((s, x) => s + x.r.level, 0) / regions.length);
  const selected = game.regionalOrganization[regionId]!;
  return <>
    <PageHeading title="지역에 뿌리내리다" sub="여덟 권역에 조직을 키워 공약 전달, 인재 발굴, 후보의 지역구 인지도를 받칩니다. 조직은 지지를 직접 더하지 않습니다." />
    <ResourceStrip />
    <div className="stats">
      <Stat label="당원" value={`${game.finance!.members.toLocaleString('ko-KR')}명`} note="당비 수입의 원천" />
      <Stat label="평균 조직 수준" value={`${avg}`} note="0에서 100 사이, 게임 모형" />
      <Stat label="지역사무소" value={`${count}곳`} note={`주 임대료 ${formatMoney(count * org.officeRent)}`} />
      <Stat label="인재 프로필 노출" value={`${(partyProfile(game) / 10000).toFixed(1)}%p`} note={`상한 ${org.profileCap / 10000}%p, 영입 인물의 인지도·미디어에서 나옵니다`} />
    </div>
    <div className="grid side">
      <Panel title="권역 지도" sub="색이 진할수록 조직 수준이 높습니다. 위치는 개략도입니다.">
        <div className="region-map" role="group" aria-label="권역 선택">{regions.map(({ id, r }) => {
          const forum = forumActive(game, id), scouting = scoutingActive(game, id);
          return <button key={id} className={`region-tile ${id === regionId ? 'selected' : ''}`} style={{ gridArea: AREAS[id], ['--lv' as string]: `${Math.max(6, r.level)}%` }} aria-pressed={id === regionId} onClick={() => setRegionId(id)}>
            <strong>{REGION_LABELS[id]}</strong><span className="lv">{r.level}</span>
            <span className="row tight">{r.office && <span className="badge">사무소</span>}{forum && <span className="badge accent">간담회</span>}{scouting && <span className="badge warn">발굴</span>}{r.investments.length > 0 && <span className="badge info">진행 {r.investments.length}</span>}</span>
          </button>;
        })}</div>
      </Panel>
      <Panel title={`${REGION_LABELS[regionId]}에 투자`} sub={`조직 수준 ${selected.level}, 당원 ${selected.members.toLocaleString('ko-KR')}명`}>
        <fieldset className="invest-form">
          <label>권역 <select value={regionId} onChange={e => setRegionId(e.target.value)}>{REGION_IDS.map(id => <option key={id} value={id}>{REGION_LABELS[id]}</option>)}</select></label>
          <label>종류 <select value={kind} onChange={e => setKind(e.target.value as InvestmentKind)}>{INVESTMENT_KINDS.map(k => <option key={k} value={k}>{INVESTMENT_LABELS[k]}</option>)}</select></label>
          <div role="radiogroup" aria-label="강도" className="segmented">{Array.from({ length: org.kinds[kind].maxIntensity }, (_, i) => <button key={i} type="button" role="radio" aria-checked={level === i + 1} className={level === i + 1 ? 'active' : ''} onClick={() => setIntensity(i + 1)}>강도 {i + 1}</button>)}</div>
          <p className="invest-effect">{INVESTMENT_EFFECTS[kind]}</p>
          <p className="invest-cost">비용: {formatMoney(cost.money!)}, 실무 인력 {cost.staffCapacity}, {org.kinds[kind].weeks}주 소요</p>
          <button className="button primary" disabled={disabled || !!refusal} title={refusal ?? undefined} onClick={() => void dispatch({ type: 'INVEST_REGION', regionId, kind, intensity: level })}>투자 시작</button>
          {refusal && <p className="loss small" data-testid="invest-refusal">{refusal}</p>}
        </fieldset>
      </Panel>
    </div>
    <Panel title="권역별 현황" flush>
      <div className="table-scroll"><table className="sim-table people-table"><thead><tr><th>권역</th><th>조직 수준</th><th>사무소와 진행 중 투자</th><th>효과</th></tr></thead><tbody>{regions.map(({ id, r }) => { const forum = forumActive(game, id), scouting = scoutingActive(game, id); return <tr key={id} data-testid={`region-${id}`} className={id === regionId ? 'selected-row' : ''}>
        <th>{REGION_LABELS[id]}</th><td className="level-cell"><div className="spread small"><strong>수준 {r.level}</strong><span className="muted">당원 {r.members.toLocaleString('ko-KR')}명</span></div><Bar value={r.level} label={`${REGION_LABELS[id]} 조직 수준`} /></td>
        <td>{r.office ? `사무소 있음 (주 ${formatMoney(org.officeRent)})` : <span className="muted">사무소 없음</span>}{r.investments.map(i => <span key={i.kind} className="block-line">{INVESTMENT_LABELS[i.kind]} 강도 {i.intensity}, {i.completesAt} 완료</span>)}</td>
        <td className="small">노출 배율 ×{(regionExposureMultiplier(game, id) / 1_000_000).toFixed(2)}{forum && <span className="block-line">정책간담회 {forum.until}까지</span>}{scouting && <span className="block-line">후보발굴 {scouting.until}까지</span>}<span className="block-line muted">마지막 활동 {formatDate(r.lastActivity)}</span></td></tr>; })}</tbody></table></div>
    </Panel>
    <section className="sim-card mt-md" data-testid="org-limits"><h2>조직이 하는 일 / 아직 하지 않는 일</h2>
      <ul><li>조직 수준과 정책간담회는 그 권역 유권자에게 전달되는 공약 노출을 키워 인지도를 서서히 올립니다(공표한 공약이나 영입 인물의 인지도가 있어야 전달할 것이 있습니다).</li>
        <li>후보발굴은 그 권역 출신 인재 후보가 나올 확률 가중치만 올립니다.</li><li>당원은 당비(자금)에만 쓰입니다. 지역사무소는 임대료가 들고 월 실무 인력을 늘립니다.</li>
        <li>활동 없이 {org.decayGraceDays}일이 지나면 조직 수준이 매월 {org.decayPerMonth}(사무소가 있으면 {org.officeDecayPerMonth})씩 낮아집니다.</li></ul>
      <p className="muted small">공천은 권역 조직 수준에 영향을 주고(경선 +, 갈등 있는 전략공천 −), 조직 수준은 우리 후보의 지역구 인지도 하한에 쓰입니다. 막판 총력전 유세는 후보 지역구에만 작용하며, 투표율 동원은 구현하지 않았습니다.</p></section>
  </>;
}
