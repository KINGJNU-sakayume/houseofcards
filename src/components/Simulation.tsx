import { useGameStore } from '../state/store';
import { PLAYER_PARTY_ID } from '../types/party';
import { realityPack } from '../data/reality';
import { politicalModel } from '../data/seeds/political-model';
import type { PollGroup } from '../types/politics';
export const partyName = (id: string) => id === 'none' ? '없음·미정' : id === 'independent' ? '무소속' : id === PLAYER_PARTY_ID ? (useGameStore.getState().game.playerParty?.shortName ?? '우리 정당') : realityPack.parties.find(p => p.id === id)?.shortName.value ?? '기타 세력 묶음';
import { percent, range } from './format';
export { percent, range };
export function estimateRange(value: number, signed = false, margin = politicalModel.polling.analysisMargin) {
  return `${percent(signed ? value - margin : Math.max(0, value - margin))}–${percent(signed ? value + margin : Math.min(1000000, value + margin))}${signed ? ' %p' : '%'}`;
}
export function SimulationNotice({ children }: { children?: React.ReactNode }) {
  return <div className="model-notice"><span className="badge">가상 시뮬레이션</span><p>{children ?? '현실 여론조사나 선거 예측이 아닙니다. 모든 수치는 이 세이브의 게임 모형이 만든 값입니다.'}</p></div>;
}
export function PollTable({ group }: { group: PollGroup }) {
  const ids = Object.keys(group.results).sort((a, b) => a === 'none' ? 1 : b === 'none' ? -1 : group.results[b]!.point - group.results[a]!.point || (a < b ? -1 : 1));
  return <div className="table-scroll"><table className="sim-table"><thead><tr><th>정당</th><th>조사 범위</th></tr></thead><tbody>{ids.map(id => <tr key={id}><th scope="row">{partyName(id)}</th><td><span className="support-range">{range(group.results[id]!.low, group.results[id]!.high)}</span><div className="range-track" aria-hidden="true"><span style={{ left: `${group.results[id]!.low / 10000}%`, width: `${(group.results[id]!.high - group.results[id]!.low) / 10000}%` }} /></div></td></tr>)}</tbody></table></div>;
}
