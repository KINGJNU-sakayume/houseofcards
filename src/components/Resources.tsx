import { useGameStore } from '../state/store';
import { nextRefillDate } from '../engine/parties/management';
import { formatMoney } from './format';
export const moneyLabel = formatMoney;
export function ResourceStrip() {
  const game = useGameStore(s => s.game);
  if (!game.resources) return null;
  return <section className="resource-strip" aria-label="정당 자원"><div><span>자금</span><strong>{moneyLabel(game.resources.money)}</strong></div><div><span>실무 인력</span><strong>{game.resources.staffCapacity}</strong></div><div><span>의제 슬롯</span><strong>{game.resources.agendaSlots}</strong></div><small>다음 월간 충전 {nextRefillDate(game.date)}<br />인력·슬롯는 누적하지 않고 한도로 충전합니다.</small></section>;
}
