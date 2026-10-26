// Display-only formatting (never used in outcome paths).

// Money is stored as integer 만원. Korean units: 억 and 만원, no "M/B".
export function formatMoney(manwon: number): string {
  const sign = manwon < 0 ? '−' : '';
  const abs = Math.abs(Math.round(manwon));
  const eok = Math.floor(abs / 10000), man = abs % 10000;
  if (!eok) return man ? `${sign}${man.toLocaleString('ko-KR')}만원` : '0원';
  return `${sign}${eok.toLocaleString('ko-KR')}억${man ? ` ${man.toLocaleString('ko-KR')}만원` : '원'}`;
}
export const formatSignedMoney = (manwon: number) => manwon > 0 ? `+${formatMoney(manwon)}` : formatMoney(manwon);
// Raw KRW (won) to the same Korean units.
export const formatWon = (won: number) => formatMoney(Math.round(won / 10000));

// Q6 shares (1,000,000 = 100%).
export const percent = (value: number) => (value / 10000).toFixed(1);
export const range = (low: number, high: number) => `${percent(low)}–${percent(high)}%`;

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
export function weekdayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
}
export function formatDate(date: string, withWeekday = false): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일${withWeekday ? ` (${weekdayOf(date)})` : ''}`;
}
export const shortDate = (date: string) => { const [, m, d] = date.split('-').map(Number); return `${m}.${d}`; };

// FM-style grade for 0–100 values (1 = poor … 5 = excellent).
export function grade(value: number): 1 | 2 | 3 | 4 | 5 {
  return value >= 80 ? 5 : value >= 65 ? 4 : value >= 50 ? 3 : value >= 35 ? 2 : 1;
}
export const initials = (name: string) => name.slice(0, 1);
