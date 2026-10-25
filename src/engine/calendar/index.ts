import type { CalendarConfig, ISODate } from '../../types/game';

const DAY_MS = 86_400_000;
export const CALENDAR: Readonly<CalendarConfig> = Object.freeze({
  startDate: '2026-10-19', lastWeeklyDate: '2028-04-10', electionDate: '2028-04-12',
});
export const MILESTONES = Object.freeze([
  { date: '2027-07-05', label: '목표 지역구 탐색', phase: 'D' },
  { date: '2027-10-04', label: '후보 탐색 · 공천 준비', phase: 'C / D' },
  { date: '2027-12-06', label: '비례명부 편성', phase: 'D' },
  { date: '2028-01-17', label: 'Final Push', phase: 'D' },
  { date: '2028-03-20', label: '후보 등록 마감', phase: 'D' },
  { date: '2028-04-12', label: '선거일 · Election Night', phase: 'D' },
]);
// Pure memo of validated dates (hot path in perception updates); bounded size.
const parsed = new Map<string, number>();
function timestamp(date: ISODate): number {
  const cached = parsed.get(date);
  if (cached !== undefined) return cached;
  const result = Date.parse(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(result) || new Date(result).toISOString().slice(0, 10) !== date) {
    throw new Error('유효하지 않은 날짜입니다.');
  }
  if (parsed.size > 4096) parsed.clear();
  parsed.set(date, result);
  return result;
}
export function addDays(date: ISODate, days: number): ISODate {
  if (!Number.isInteger(days)) throw new Error('날짜 간격은 정수여야 합니다.');
  return new Date(timestamp(date) + days * DAY_MS).toISOString().slice(0, 10);
}
export function daysBetween(from: ISODate, to: ISODate): number {
  return (timestamp(to) - timestamp(from)) / DAY_MS;
}
export function isMonday(date: ISODate): boolean { return new Date(timestamp(date)).getUTCDay() === 1; }
export function isMonthlyTick(date: ISODate): boolean {
  return isMonday(date) && addDays(date, 7).slice(0, 7) !== date.slice(0, 7);
}
export function weekCount(calendar: CalendarConfig): number {
  return daysBetween(calendar.startDate, calendar.lastWeeklyDate) / 7 + 1;
}
