import { ResourceStrip } from '../components/Resources';
import { publicationCost, shortage } from '../engine/parties/management';
import { PLAYER_PARTY_ID } from '../types/party';
import { useState } from 'react';
import { useGameStore } from '../state/store';
import { policyLevers, realityPack } from '../data/reality';
import { DOMAIN_IDS, DOMAIN_LABELS, type DomainId } from '../types/simulation';
import { SimulationNotice, partyName } from '../components/Simulation';
import { DRIVER_LABELS } from '../data/content/labels';
export function Policy() {
  const { game, dispatch, busy, ready } = useGameStore();
  const [partyId, setPartyId] = useState(PLAYER_PARTY_ID);
  const [domain, setDomain] = useState<DomainId>('housing');
  const platform = game.platforms.find(p => p.partyId === partyId)!;
  const baseline = realityPack.parties.find(p => p.id === partyId);
  const editable = partyId === PLAYER_PARTY_ID, disabled = !ready || busy || game.status !== 'active';
  return <>
    <div className="page-heading"><div><p className="eyebrow">POLICY / PLATFORM</p><h1>어떤 입장을 공표할까요?</h1><p className="muted">초안은 자유롭게, 공표는 일관성을 생각하며.</p></div></div>
    <ResourceStrip /><SimulationNotice>공약은 정부 집행과 다릅니다. 지지 분석·전달·인식은 월간 보고일에 갱신됩니다. 공표에는 Agenda Slots와 Staff Capacity가 필요합니다. 최근 방향 반전에는 추가 인력이 듭니다.</SimulationNotice>
    <div className="sim-toolbar"><label>정당 <select value={partyId} onChange={event => setPartyId(event.target.value)}>{game.platforms.map(p => <option key={p.partyId} value={p.partyId}>{partyName(p.partyId)}</option>)}</select></label><span className="outline-badge">{editable ? '우리 정당' : '게임 모델 추정'}</span></div>
    {baseline && <p className="model-source"><span className="badge">REAL-WORLD BASELINE</span> {baseline.name.value} · <a href={baseline.platformTags!.source} target="_blank" rel="noreferrer">공식 강령 출처</a><br /><span className="muted">레버 위치는 공식 강령의 주제를 해석한 GAME MODEL 추정이며 실제 공식 입장 수치가 아닙니다.</span></p>}
    <div className="sim-tabs" role="group" aria-label="정책 영역">{DOMAIN_IDS.map(id => <button key={id} aria-pressed={domain === id} className={domain === id ? 'active' : ''} onClick={() => setDomain(id)}>{DOMAIN_LABELS[id]}</button>)}</div>
    <section className="sim-card"><div className="section-heading"><h2>{DOMAIN_LABELS[domain]} 공약</h2><span className="muted small">0 축소·완화 / 2 현행 / 4 확대·강화</span></div>
      <div className="lever-list">{policyLevers.filter(l => l.domain === domain).map(lever => {
        const position = platform.positions[lever.id]!;
        const cost = editable ? publicationCost(game, lever.id) : {};
        const reason = editable ? shortage(game, cost) : null;
        const delta = position.draftValue - 2;
        const fiscal = delta * lever.fiscalImplication.costPerStep;
        return <article className="lever-row" key={lever.id}><div><h3>{lever.name}</h3><p className="muted small">{lever.axis}</p><p className="published-position" data-testid={`published-${lever.id}`}>공표 {position.publishedValue ?? '미공표'}{position.publishedAt ? ` · ${position.publishedAt}` : ''}{position.reversalPenalty > 0 ? ' · 최근 반전의 일관성 부담 있음' : ''}</p></div>
          <div className="lever-controls">{editable ? <><label htmlFor={lever.id}>초안 {position.draftValue}</label><input id={lever.id} aria-label={`${lever.name} 초안`} type="range" min={0} max={4} step={1} value={position.draftValue} disabled={disabled} onChange={event => void dispatch({ type: 'SET_PLATFORM_DRAFT', leverId: lever.id, value: Number(event.target.value) })} /><button className="button compact" title={reason ?? undefined} disabled={disabled || !!reason || position.draftValue === position.publishedValue} onClick={() => void dispatch({ type: 'PUBLISH_PLATFORM', leverId: lever.id })} aria-label={`${lever.name} 공표`}>공표</button></> : <strong>{position.publishedValue ?? '미공표'}</strong>}</div>
          {editable && <p className="small">공표 비용: Staff {cost.staffCapacity} · Slots {cost.agendaSlots}{reason ? ` · ${reason}` : ''}</p>}
          {editable && <p className="forecast small">집행될 경우의 전망: {lever.effectChannels.map(channel => `${DRIVER_LABELS[channel.driverId] ?? channel.driverId} ${channel.coefficient * delta < 0 ? '↓' : channel.coefficient * delta > 0 ? '↑' : '→'}`).join(' · ')} / 상대 재정부담 {fiscal > 0 ? '↑' : fiscal < 0 ? '↓' : '→'} / 구현 시차 {lever.implementationDelayMonths}개월. 현실 예측 아님.</p>}
        </article>;
      })}</div>
    </section>
  </>;
}
