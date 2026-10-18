import { useGameStore } from '../state/store';
import { nextRefillDate } from '../engine/parties/management';
export const moneyLabel = (money: number) => `${(money / 100).toFixed(1)} 백만 원`;
export function ResourceStrip() {
  const game = useGameStore(s => s.game);
  if (!game.resources) return null;
  return <section className="resource-strip" aria-label="정당 자원"><div><span>Money</span><strong>{moneyLabel(game.resources.money)}</strong></div><div><span>Staff Capacity</span><strong>{game.resources.staffCapacity}</strong></div><div><span>Agenda Slots</span><strong>{game.resources.agendaSlots}</strong></div><small>다음 월간 충전 {nextRefillDate(game.date)}<br />Staff·Slots는 누적하지 않고 한도로 충전합니다.</small></section>;
}
