import { policyLevers, realityPack, seedPack } from '../../data/reality';
import { DRIVER_LABELS } from '../../data/content/labels';
import { DRIVER_STORIES, ISSUE_KICKERS } from '../../data/content/stories';
import type { GameState } from '../../types/game';
import type { DomainId } from '../../types/simulation';
import { addDays, daysBetween } from '../calendar';

// U2 "정국 브리핑": a pure, deterministic view over the save (no state change).
// Articles explain an issue's movement by the driver furthest from its starting value.
export interface Article {
  id: string; issueId: DomainId; kicker: string; headline: string; lede: string;
  tone: 'up' | 'down' | 'flat'; severity: number; salience: number; trend: number;
  driver: { id: string; label: string; delta: number } | null;
  history: number[];
}
export interface BriefingChange { date: string; kind: 'government' | 'party' | 'poll'; title: string; body: string }

const MOVE = 50; // half an index point over three months counts as a movement
const HIGH = 6000; // a driver at or above 60 is reported as persistently high
const point = (v: number) => (v / 100).toFixed(1);

export function articles(state: GameState): Article[] {
  return [...state.issues].sort((a, b) => b.salience - a.salience || (a.id < b.id ? -1 : 1)).map((issue, index) => {
    const config = seedPack.issueConfigs.find(c => c.id === issue.id)!;
    const history = state.history.map(h => h.issues[issue.id]?.[0]).filter((v): v is number => v !== undefined);
    // Three-month severity change (or since the season start while history is short).
    const base = history.length > 3 ? history[history.length - 4]! : history[0] ?? config.severity;
    const change = issue.severity - base;
    const tone: Article['tone'] = change >= MOVE ? 'up' : change <= -MOVE ? 'down' : 'flat';
    const drivers = config.drivers.map(d => ({ id: d.id, value: issue.drivers[d.id] ?? d.initial, delta: (issue.drivers[d.id] ?? d.initial) - d.initial }));
    // The driver that moved most in the article's direction; when flat, the heaviest current driver.
    const pick = [...drivers].sort((a, b) => (tone === 'up' ? b.delta - a.delta : tone === 'down' ? a.delta - b.delta : b.value - a.value) || (a.id < b.id ? -1 : 1))[0]!;
    const label = DRIVER_LABELS[pick.id] ?? pick.id;
    const kicker = ISSUE_KICKERS[issue.id] ?? issue.id;
    const persistent = [`'${label}' 여전히 높은 수준… ${kicker} 해법 논쟁 계속`, `${kicker} 현장, "${label}" 호소 이어져`, `${label}, 좀처럼 꺾이지 않아`];
    const headline = tone === 'flat'
      ? pick.value >= HIGH ? persistent[(index + history.length) % persistent.length]! : `${kicker} 이슈, 큰 변화 없이 관심 이어져`
      : DRIVER_STORIES[pick.id]?.[tone] ?? `${label} ${tone === 'up' ? '심화' : '완화'}`;
    const span = history.length > 3 ? '석 달 전' : '시즌 시작';
    const move = change === 0 ? `${span}과 같습니다` : `${span}보다 ${point(Math.abs(change))} ${change > 0 ? '높아졌습니다' : '낮아졌습니다'}`;
    const reason = tone === 'flat' ? ` 가장 무거운 요인은 '${label}'(${point(pick.value)})입니다.` : ` 가장 크게 움직인 요인은 '${label}'로, 시즌 시작보다 ${point(Math.abs(pick.delta))} ${pick.delta > 0 ? '나빠졌습니다' : '나아졌습니다'}.`;
    return { id: `article-${issue.id}`, issueId: issue.id, kicker, headline, tone, severity: issue.severity, salience: issue.salience, trend: issue.trend,
      driver: { id: pick.id, label, delta: pick.delta },
      lede: `심각도 ${point(issue.severity)}로 ${move}. 대중의 관심도는 ${point(issue.salience)}입니다.${reason}`, history };
  });
}

const partyLabel = (id: string) => realityPack.parties.find(p => p.id === id)?.shortName.value ?? '기타 세력 묶음';
const leverName = (id: string) => policyLevers.find(l => l.id === id)?.name ?? id;

// Government enactments, AI platform shifts and polls from the last month, newest first.
export function recentChanges(state: GameState, days = 35): BriefingChange[] {
  const since = addDays(state.date, -days);
  const out: BriefingChange[] = [];
  for (const event of state.events) {
    if (event.date < since || daysBetween(event.date, state.date) < 0) continue;
    if (event.type === 'GOVERNMENT_ENACTED') for (const id of event.detail.split('|')) {
      const lever = policyLevers.find(l => l.id === id);
      const value = state.governmentPolicy.levers[id]?.value ?? 2;
      out.push({ date: event.date, kind: 'government', title: `정부, '${leverName(id)}' ${value > 2 ? '강화' : value < 2 ? '축소' : '원상 복귀'} 결정`, body: `집행은 결정됐지만 효과는 약 ${lever?.implementationDelayMonths ?? 0}개월 뒤에 사회 이슈에 나타납니다.` });
    }
    if (event.type === 'AI_PLATFORM_SHIFT') for (const change of event.detail.split('|')) {
      const [party, lever] = change.split(':');
      out.push({ date: event.date, kind: 'party', title: `${partyLabel(party!)}, '${leverName(lever!)}' 입장 조정`, body: '조사 흐름과 유권자 선호를 보고 공약 한 가지를 한 단계 옮겼습니다. 공식 입장 발표가 아닌 게임 모형의 선택입니다.' });
    }
    if (event.type === 'POLL_PUBLISHED') {
      const poll = state.politics.polls.find(p => p.id === event.detail);
      if (!poll) continue;
      const ranked = Object.entries(poll.national.results).filter(([id]) => id !== 'none').sort((a, b) => b[1].point - a[1].point);
      const [lead, second] = ranked;
      if (!lead || !second) continue;
      out.push({ date: event.date, kind: 'poll', title: `가상 조사: ${partyLabel(lead[0])} ${point(lead[1].point / 100)}%, ${partyLabel(second[0])} ${point(second[1].point / 100)}%`, body: `${poll.houseName} · 표본 ${poll.national.sampleSize}명. 현실 여론조사가 아닙니다.` });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
