import { useState } from 'react';
import { useGameStore } from '../state/store';
import { districtPack } from '../data/reality/districts';
import { REGION_LABELS } from '../data/content/labels';
import { nominationModel as nm } from '../data/seeds/nomination';
import { candidacyOf, districtDeposit, listDeposit, listRefusal, METHOD_LABELS, nominationRefusal, nominationStage, primaryCost, targetRefusal } from '../engine/election/nominations';
import type { NominationMethod } from '../types/game';

const STAGE_LABELS = { closed: `선거 준비 전 — ${nm.gates.targets}부터 집중 지역 선택`, targets: `1단계 집중 지역 선택 — 공천은 ${nm.gates.nominations}부터`, nominations: `2단계 공천 — 비례명부는 ${nm.gates.list}부터`, list: `3단계 비례명부 — 등록 마감 ${nm.gates.registration}`, registered: '후보 등록 마감됨' } as const;

// D3 nomination and list controls (Slice §26). Every change is a command; refusals are shown, not applied.
export function NominationPanel() {
  const { game, dispatch, busy, ready } = useGameStore();
  const [districtId, setDistrictId] = useState('');
  const [method, setMethod] = useState<NominationMethod>('strategic');
  const [candidates, setCandidates] = useState<string[]>([]);
  const [draft, setDraft] = useState<string[] | null>(null);
  if (!game.playerParty) return null;
  const n = game.nominations, stage = nominationStage(game), disabled = !ready || busy || game.status !== 'active';
  const recruits = game.politicians.filter(p => p.status === 'recruited');
  const name = (id: string) => game.politicians.find(p => p.id === id)?.name ?? id;
  const active = districtPack.districts.filter(d => d.active);
  const chosen = districtId && n.targets.includes(districtId) ? districtId : n.targets.find(id => !n.districts[id]) ?? '';
  const free = recruits.filter(p => !candidacyOf(game, p.id));
  const nominateReason = chosen ? nominationRefusal(game, chosen, method, candidates) : '집중 지역을 먼저 고르세요.';
  const list = draft ?? n.list;
  const listReason = listRefusal(game, list);
  const toggle = (id: string) => setCandidates(c => c.includes(id) ? c.filter(x => x !== id) : method === 'strategic' ? [id] : [...c, id]);
  const move = (i: number, d: number) => { const next = [...list]; [next[i], next[i + d]] = [next[i + d]!, next[i]!]; setDraft(next); };
  return <section className="sim-card" data-testid="nomination-panel"><h2>공천과 비례명부 <span className="outline-badge">SAVE SIMULATION</span></h2>
    <p data-testid="nomination-stage"><strong>{STAGE_LABELS[stage]}</strong></p>
    <p className="muted small">일정은 게임 단순화입니다(실제 후보 등록 기간과 다름). 공천 후보는 영입한 가상 인물입니다. 다른 정당의 후보는 정당 단위 가상 레코드이며 실존 후보가 아닙니다. 기탁금은 현행법 값(지역구 {districtDeposit(game).toLocaleString()}만원, 비례 1인 {listDeposit(game).toLocaleString()}만원)으로 공천 시 내고, 마감 전 철회하면 돌려받습니다. 득표에 따른 반환은 D4에서 계산합니다.</p>
    <h3>집중 지역 (Active 30 중 최대 {nm.targets.max}곳 · {n.targets.length}곳 선택)</h3>
    <div className="table-scroll"><table className="sim-table" data-testid="target-table"><thead><tr><th>지역구</th><th>집중</th><th>우리 후보</th></tr></thead><tbody>{active.map(d => {
      const on = n.targets.includes(d.id), nomination = n.districts[d.id], reason = targetRefusal(game, d.id, !on);
      return <tr key={d.id}><th>{d.name}<br /><small className="muted">{d.sido} · {REGION_LABELS[d.regionId]}</small></th>
        <td><label className="check-row"><input type="checkbox" checked={on} disabled={disabled || !!reason} title={reason ?? undefined} onChange={() => void dispatch({ type: 'SET_TARGET_DISTRICT', districtId: d.id, targeted: !on })} />{on ? '집중' : '—'}</label></td>
        <td>{nomination ? <>{name(nomination.politicianId)} · {METHOD_LABELS[nomination.method]}{nomination.participants.length ? ` (${nomination.participants.length}명 경선)` : ''} <button className="link-button" disabled={disabled || !!nominationRefusal(game, d.id, 'none', [])} onClick={() => void dispatch({ type: 'NOMINATE_DISTRICT', districtId: d.id, method: 'none', candidateIds: [] })}>철회</button></> : on ? '후보 없음' : ''}</td></tr>;
    })}</tbody></table></div>
    <h3>공천</h3>
    <div className="sim-toolbar"><label>지역구 <select value={chosen} onChange={e => setDistrictId(e.target.value)}><option value="">선택</option>{n.targets.filter(id => !n.districts[id]).map(id => <option key={id} value={id}>{active.find(d => d.id === id)!.name}</option>)}</select></label>
      <label>방식 <select value={method} onChange={e => { setMethod(e.target.value as NominationMethod); setCandidates([]); }}><option value="strategic">전략공천 (1명)</option><option value="primary">경선 ({nm.primary.minCandidates}~{nm.primary.maxCandidates}명)</option></select></label></div>
    <p className="muted small">{method === 'primary' ? `경선: 지역 기반(출신 권역만)·인지도·선거운동·대중성·협상 점수에 작은 무작위 변동을 더해 승자를 정합니다. 참가자 신뢰와 권역 조직이 오르고 '총선 경선 보장' 약속이 지켜집니다. 비용 ${primaryCost().money}만원, Staff ${primaryCost().staffCapacity}.` : `전략공천: 같은 권역의 공천받지 못한 영입 인재의 신뢰가 떨어지며 후보의 협상력이 이를 줄입니다. Staff ${nm.strategic.staffCapacity}.`} 출신 권역 지역구에 공천하면 '지역 우선공천' 약속이 지켜집니다.</p>
    {free.length ? <div role="group" aria-label="공천 후보" className="check-grid">{free.map(p => <label key={p.id} className="check-row"><input type="checkbox" checked={candidates.includes(p.id)} onChange={() => toggle(p.id)} />{p.name} · {REGION_LABELS[p.regionId]} · 지역기반 {p.attributes.localBase} · 선거운동 {p.attributes.campaigning} · 대중성 {p.attributes.broadAppeal}</label>)}</div> : <p className="muted">공천할 수 있는 영입 인재가 없습니다.</p>}
    <button className="button primary" disabled={disabled || !!nominateReason} onClick={() => { void dispatch({ type: 'NOMINATE_DISTRICT', districtId: chosen, method, candidateIds: candidates }); setCandidates([]); }}>공천</button>
    {nominateReason && <p className="muted small" data-testid="nomination-refusal">{nominateReason}</p>}
    <h3>비례대표 명부 ({list.length}명 · {game.electionRuleset.listSizeUi.min}~{game.electionRuleset.listSizeUi.max}명)</h3>
    <p className="muted small">홀수 순위 여성, 여성 50% 이상(공직선거법 §47③), 지역구와 중복입후보 불가(§52③). 명부의 득표·의석 효과는 D4 선거 계산에서 쓰입니다.</p>
    <ol data-testid="list-draft">{list.map((id, i) => <li key={id}>{name(id)} · {game.politicians.find(p => p.id === id)?.gender === 'female' ? '여' : '남'}
      <button className="link-button" disabled={i === 0} onClick={() => move(i, -1)}>위로</button><button className="link-button" disabled={i === list.length - 1} onClick={() => move(i, 1)}>아래로</button>
      <button className="link-button" onClick={() => setDraft(list.filter(x => x !== id))}>빼기</button></li>)}</ol>
    <div className="sim-toolbar"><label>추가 <select value="" onChange={e => e.target.value && setDraft([...list, e.target.value])}><option value="">영입 인재 선택</option>{recruits.filter(p => !list.includes(p.id) && candidacyOf(game, p.id)?.kind !== 'district').map(p => <option key={p.id} value={p.id}>{p.name} ({p.gender === 'female' ? '여' : '남'})</option>)}</select></label>
      <button className="button primary" disabled={disabled || !!listReason || draft === null} onClick={() => { void dispatch({ type: 'SET_LIST', politicianIds: list }); setDraft(null); }}>명부 저장</button></div>
    {listReason && <p className="muted small" data-testid="list-refusal">{listReason}</p>}
  </section>;
}
