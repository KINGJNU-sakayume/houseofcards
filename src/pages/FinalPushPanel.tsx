import { useGameStore } from '../state/store';
import { districtPack } from '../data/reality/districts';
import { REGION_LABELS } from '../data/content/labels';
import { electionModel as em } from '../data/seeds/election';
import { campaignRefusal, campaignStrength, finalPushOpen, leaderRefusal, messagesRefusal, weeklyCost } from '../engine/election/finalPush';
import { DOMAIN_IDS, DOMAIN_LABELS, type DomainId } from '../types/simulation';
import { PLAYER_PARTY_ID } from '../types/party';
import { partyName, percent } from '../components/Simulation';

const nameOf = (id: string) => districtPack.districts.find(d => d.id === id)!.name;

// D4 Final Push controls (Slice §26). Every change is a command.
export function FinalPushPanel() {
  const { game, dispatch, busy, ready } = useGameStore();
  if (!game.playerParty) return null;
  const f = game.finalPush, open = finalPushOpen(game), disabled = !ready || busy || game.status !== 'active';
  const nominees = Object.entries(game.nominations.districts);
  const cost = weeklyCost(game);
  const setMessages = (national: DomainId | null, secondary: DomainId[]) => void dispatch({ type: 'SET_MESSAGES', national, secondary });
  return <section className="sim-card" data-testid="final-push"><h2>Final Push <span className="outline-badge">SAVE SIMULATION</span></h2>
    <p className="muted small">{em.finalPush.start}부터 매주 배분합니다(법정 공식 선거운동 13일과 다른 게임 개념). 메시지는 해당 영역을 중요하게 여기는 코호트에게 우리 정당이 노출되는 정도(인지도)만 바꾸며, 공표한 공약이 있는 영역만 고를 수 있습니다. 메시지 변경마다 Agenda Slots {em.finalPush.messageAgendaSlots}. 유세 강도 1당 매주 Money {em.finalPush.weeklyMoneyPerIntensity}만원·Staff {em.finalPush.weeklyStaffPerIntensity}, 지도부 집중은 Staff {em.finalPush.leaderStaff}. 유세 누적은 후보의 Organization 속성에 따라 효율이 다르고(체감), 그 지역구 효용과 인지 하한에만 들어갑니다. 득표를 직접 더하지 않습니다.</p>
    <p className="muted small">언론 보도: 모든 정당은 최근 공개 조사 지지에 비례하는 전국 노출을 받습니다(상한 있음). 이 기간에는 투표용지에 오른 정당(우리 정당은 비례명부나 지역구 후보가 있을 때)이 같은 선거운동 노출을 더 받습니다. 둘 다 인지도에만 작용합니다(GAME MODEL).</p>
    {!open ? <p data-testid="final-push-status"><strong>{game.election ? '선거가 끝났습니다.' : `${em.finalPush.start}부터 열립니다.`}</strong></p> : <>
      <p data-testid="final-push-status"><strong>진행 중 · 이번 배분의 주간 비용 Money {cost.money ?? 0}만원 · Staff {cost.staffCapacity ?? 0}</strong></p>
      <div className="sim-toolbar"><label>전국 메시지 <select value={f.nationalMessage ?? ''} disabled={disabled} onChange={e => setMessages((e.target.value || null) as DomainId | null, f.secondaryMessages.filter(d => d !== e.target.value))}>
        <option value="">없음</option>{DOMAIN_IDS.map(d => <option key={d} value={d} disabled={!!messagesRefusal(game, d, f.secondaryMessages.filter(x => x !== d))}>{DOMAIN_LABELS[d]}</option>)}</select></label>
        {[0, 1].map(i => <label key={i}>보조 메시지 {i + 1} <select value={f.secondaryMessages[i] ?? ''} disabled={disabled} onChange={e => { const next = [...f.secondaryMessages]; if (e.target.value) next[i] = e.target.value as DomainId; else next.splice(i, 1); setMessages(f.nationalMessage, [...new Set(next.filter(Boolean))]); }}>
          <option value="">없음</option>{DOMAIN_IDS.filter(d => d !== f.nationalMessage).map(d => <option key={d} value={d}>{DOMAIN_LABELS[d]}</option>)}</select></label>)}
        <label>지도부 집중 지역 <select value={f.leaderFocus ?? ''} disabled={disabled} onChange={e => void dispatch({ type: 'SET_LEADER_FOCUS', districtId: e.target.value || null })}><option value="">없음</option>{nominees.map(([id]) => <option key={id} value={id} disabled={!!leaderRefusal(game, id)}>{nameOf(id)}</option>)}</select></label></div>
      {nominees.length ? <div className="table-scroll"><table className="sim-table" data-testid="campaign-table"><thead><tr><th>지역구</th><th>후보</th><th>유세 강도</th><th>누적 효과</th></tr></thead><tbody>{nominees.map(([id, n]) => <tr key={id}><th>{nameOf(id)}</th>
        <td>{game.politicians.find(p => p.id === n.politicianId)!.name}</td>
        <td><select aria-label={`${nameOf(id)} 유세 강도`} value={f.campaign[id] ?? 0} disabled={disabled} onChange={e => void dispatch({ type: 'SET_CAMPAIGN', districtId: id, intensity: Number(e.target.value) })}>{Array.from({ length: em.finalPush.maxIntensity + 1 }, (_, i) => <option key={i} value={i} disabled={!!campaignRefusal(game, id, i)}>{i}</option>)}</select></td>
        <td>{percent(campaignStrength(f.effort[id] ?? 0))}%</td></tr>)}</tbody></table></div> : <p className="muted">공천한 지역구가 없어 유세할 곳이 없습니다.</p>}</>}
  </section>;
}

// D4 results (Slice §27 minimum items). Election Night is E1.
export function ElectionResults() {
  const { game } = useGameStore();
  const e = game.election;
  if (!e) return null;
  const listTotal = Object.values(e.listVotes).reduce((a, b) => a + b, 0);
  const share = (id: string) => (e.listVotes[id] ?? 0) * 1_000_000 / Math.max(1, listTotal);
  const parties = Object.keys(e.totalSeats).sort((a, b) => e.totalSeats[b]! - e.totalSeats[a]! || share(b) - share(a));
  const regions = Object.keys(REGION_LABELS).map(region => {
    const ds = e.districts.filter(r => districtPack.districts.find(d => d.id === r.id)!.regionId === region);
    const votes = ds.reduce((s, r) => s + (r.votes[PLAYER_PARTY_ID] ?? 0), 0), all = ds.reduce((s, r) => s + Object.values(r.votes).reduce((a, b) => a + b, 0), 0);
    return { region, wins: ds.filter(r => r.winner === PLAYER_PARTY_ID).length, share: Math.round(votes * 1_000_000 / Math.max(1, all)) };
  });
  const person = (id: string) => game.politicians.find(p => p.id === id)?.name ?? id;
  return <section className="sim-card" data-testid="election-results"><h2>{e.date} 총선 결과 <span className="outline-badge">SAVE SIMULATION · 가상 시뮬레이션</span></h2>
    <p className="muted small">이 세이브의 모형 결과입니다. 실제 선거 결과나 예측이 아닙니다. 지역구 유권자 규모는 2024년 투표자 수를 씁니다. 선거일 변동은 정해진 시드 스트림으로 결정됩니다.</p>
    <p data-testid="player-result"><strong>{game.playerParty?.shortName} {e.totalSeats[PLAYER_PARTY_ID] ?? 0}석</strong> · 정당득표 {percent(Math.round(share(PLAYER_PARTY_ID)))}% · 지역구 {e.districtSeats[PLAYER_PARTY_ID] ?? 0}석 · 비례 {e.listSeats[PLAYER_PARTY_ID] ?? 0}석 · {e.outcome === 'in_parliament' ? '원내 진입' : '원외 정당으로 존속 (현행법상 0석 등록취소 없음)'}</p>
    <div className="table-scroll"><table className="sim-table"><thead><tr><th>정당</th><th>정당득표</th><th>지역구</th><th>비례</th><th>합계</th></tr></thead><tbody>{parties.map(id => <tr key={id}><th>{partyName(id)}</th><td>{percent(Math.round(share(id)))}%{e.eligible.includes(id) ? '' : ' (배분 제외)'}</td><td>{e.districtSeats[id] ?? 0}</td><td>{e.listSeats[id] ?? 0}</td><td>{e.totalSeats[id] ?? 0}</td></tr>)}</tbody></table></div>
    <h3>우리 당선인</h3><p>{[...e.playerDistrictElected.map(id => `${person(game.nominations.districts[id]!.politicianId)} (${nameOf(id)})`), ...e.playerListElected.map((id, i) => `${person(id)} (비례 ${i + 1}번)`)].join(', ') || '없음'}</p>
    <h3>권역별 우리 지역구 득표</h3><p className="muted small">{regions.map(r => `${REGION_LABELS[r.region]} ${percent(r.share)}%${r.wins ? ` · ${r.wins}석` : ''}`).join(' / ')}</p>
    <p className="muted small">기탁금 {e.deposits.paid.toLocaleString()}만원 중 {e.deposits.refunded.toLocaleString()}만원 반환 · 유세비용 보전 {e.reimbursement.toLocaleString()}만원 (공직선거법 §57①, §122의2① 기준값).</p>
  </section>;
}
