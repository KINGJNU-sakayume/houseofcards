import { useState } from 'react';
import { ResourceStrip } from '../components/Resources';
import { publicationCost, shortage } from '../engine/parties/management';
import { PLAYER_PARTY_ID } from '../types/party';
import { useGameStore } from '../state/store';
import { policyLevers, realityPack } from '../data/reality';
import { DOMAIN_IDS, DOMAIN_LABELS, type DomainId, type LeverDefinition, type PartyPlatform } from '../types/simulation';
import { partyName } from '../components/Simulation';
import { DRIVER_LABELS, PARTY_COLORS, STEP_LABELS } from '../data/content/labels';
import { Icon } from '../components/Icon';
import { PageHeading, Pills, Tabs } from '../components/ui';
import { formatDate } from '../components/format';

const partyColor = (id: string, own: string) => id === PLAYER_PARTY_ID ? own : PARTY_COLORS[id] ?? '#8a8f98';

function CompareTrack({ lever, platforms, own }: { lever: LeverDefinition; platforms: readonly PartyPlatform[]; own: string }) {
  return <div className="compare-track" aria-label={`${lever.name} 정당별 공표 위치`}>
    {lever.steps.map((_, step) => <div key={step} className={`compare-cell ${step === 2 ? 'status-quo' : ''}`}>
      <span className="compare-step">{STEP_LABELS[step]}</span>
      <span className="row" style={{ gap: 4, justifyContent: 'center', minHeight: 22 }}>{platforms.filter(p => p.positions[lever.id]?.publishedValue === step).map(p => <span key={p.partyId} className="party-dot" style={{ background: partyColor(p.partyId, own) }} title={partyName(p.partyId)}>{partyName(p.partyId).slice(0, 1)}</span>)}</span>
    </div>)}
  </div>;
}

export function Policy() {
  const { game, dispatch, busy, ready } = useGameStore();
  const [partyId, setPartyId] = useState<string>(PLAYER_PARTY_ID);
  const [domain, setDomain] = useState<DomainId>('housing');
  const own = game.playerParty?.color ?? '#3550a8';
  const order = [PLAYER_PARTY_ID, ...game.platforms.map(p => p.partyId).filter(id => id !== PLAYER_PARTY_ID)];
  const platform = game.platforms.find(p => p.partyId === partyId)!;
  const baseline = realityPack.parties.find(p => p.id === partyId);
  const editable = partyId === PLAYER_PARTY_ID, disabled = !ready || busy || game.status !== 'active';
  const publishedIn = (d: DomainId) => policyLevers.filter(l => l.domain === d && platform.positions[l.id]?.publishedValue !== null).length;
  return <>
    <PageHeading eyebrow="정책 · 공약" title="어떤 입장을 공표할까요?" sub="초안은 자유롭게 고치고, 공표는 일관성을 생각하며. 공약은 정부 정책이 아니며 지표를 직접 바꾸지 않습니다." />
    <ResourceStrip />
    <Pills label="정당 선택" value={partyId} onChange={setPartyId} options={order.map(id => ({ id, label: partyName(id), color: partyColor(id, own) }))} />
    <div className="policy-context">
      {editable ? <p className="muted small">공표하면 의제 슬롯 1과 실무 인력이 듭니다(단계 차이만큼 더, 최근 방향을 뒤집으면 추가). 유권자 인식은 월말 보고에서 갱신됩니다.</p>
        : <p className="muted small">{baseline ? <><span className="badge">현실 기준 자료</span> {baseline.name.value} · <a className="link-button" href={baseline.platformTags!.source} target="_blank" rel="noreferrer">공식 강령 출처</a> · 단계 위치는 강령 주제를 해석한 게임 모형 추정입니다.</> : '가상 세력 묶음의 게임 모형 입장입니다.'}</p>}
      <span className="badge info">게임 공약 문안 · 실제 정당 공약·예산 추계 아님</span>
    </div>
    <Tabs label="정책 영역" value={domain} onChange={setDomain} options={DOMAIN_IDS.map(id => ({ id, label: DOMAIN_LABELS[id], count: publishedIn(id) }))} />
    <div className="lever-grid">{policyLevers.filter(l => l.domain === domain).map(lever => {
      const position = platform.positions[lever.id]!;
      const published = position.publishedValue;
      const cost = editable ? publicationCost(game, lever.id) : {};
      const reason = editable ? shortage(game, cost) : null;
      const delta = position.draftValue - 2;
      const fiscal = delta * lever.fiscalImplication.costPerStep;
      const changed = editable && position.draftValue !== published;
      return <article className="lever-card" key={lever.id} style={{ borderLeftColor: published === null ? 'var(--line-strong)' : partyColor(partyId, own) }}>
        <header className="spread"><h3>{lever.name}</h3><span className="row" style={{ gap: 6 }}>
          {position.reversalPenalty > 0 && <span className="badge warn">최근 반전 · 신뢰 부담</span>}
          {changed && <span className="badge accent">초안 수정됨</span>}
          <span className="badge" data-testid={`published-${lever.id}`}>{published === null ? '미공표' : `공표 ${published}단계 · ${STEP_LABELS[published]}`}</span>
        </span></header>
        <p className="pledge">{published === null ? <span className="muted">아직 이 사안에 대한 입장을 공표하지 않았습니다.</span> : `“${lever.steps[published]}”`}</p>
        {published !== null && position.publishedAt && <p className="muted small">{formatDate(position.publishedAt)} 공표</p>}
        {editable && <fieldset className="step-picker" role="radiogroup" aria-label={`${lever.name} 초안`} disabled={disabled}>
          {lever.steps.map((text, step) => <label key={step} className={`step-card ${position.draftValue === step ? 'selected' : ''} ${published === step ? 'published' : ''}`}>
            <input type="radio" name={`draft-${lever.id}`} aria-label={`${lever.name} ${step}단계`} checked={position.draftValue === step} onChange={() => void dispatch({ type: 'SET_PLATFORM_DRAFT', leverId: lever.id, value: step })} />
            <span className="step-head">{STEP_LABELS[step]}{published === step && <i>공표</i>}</span>
            <span className="step-text">{text}</span>
          </label>)}
        </fieldset>}
        {editable && <div className="lever-foot">
          <div className="row" style={{ gap: 6 }}>
            {lever.effectChannels.map(channel => { const dir = channel.coefficient * delta; return <span key={channel.driverId} className={`chip ${dir < 0 ? 'gain' : dir > 0 ? 'loss' : ''}`} title="집행될 경우 이 요인의 방향(게임 모형)"><Icon name={dir < 0 ? 'down' : dir > 0 ? 'up' : 'flat'} size={12} />{DRIVER_LABELS[channel.driverId] ?? channel.driverId}</span>; })}
            <span className={`chip ${fiscal > 0 ? 'warn' : fiscal < 0 ? 'gain' : ''}`}>재정 부담 {fiscal > 0 ? '증가' : fiscal < 0 ? '감소' : '변화 없음'}</span>
            <span className="chip">시행 시차 {lever.implementationDelayMonths}개월</span>
          </div>
          <div className="row">
            <span className="muted small">{changed ? `공표 비용: 실무 인력 ${cost.staffCapacity} · 의제 슬롯 ${cost.agendaSlots}` : '초안이 공표 입장과 같습니다'}{reason ? ` · ${reason}` : ''}</span>
            <button className="button primary compact" title={reason ?? undefined} disabled={disabled || !!reason || !changed} onClick={() => void dispatch({ type: 'PUBLISH_PLATFORM', leverId: lever.id })} aria-label={`${lever.name} 공표`}>공표</button>
          </div>
        </div>}
        <details className="compare"><summary>다른 정당의 입장</summary><CompareTrack lever={lever} platforms={game.platforms} own={own} /></details>
      </article>;
    })}</div>
    <p className="muted small" style={{ marginTop: 12 }}>칩의 화살표는 이 초안이 정부 정책으로 집행될 경우 요인이 움직일 방향입니다(초록은 이슈 완화). 현실 예측이 아닙니다.</p>
  </>;
}
