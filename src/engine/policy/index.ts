import type { GovernmentPolicy, LeverDefinition, LeverValue, PartyPlatform } from '../../types/simulation';
import { daysBetween } from '../calendar';

export function requireLeverValue(value: number): asserts value is LeverValue {
  if (!Number.isInteger(value) || value < 0 || value > 4) throw new Error('공약 값은 0~4의 정수여야 합니다.');
}
export function createPlatform(partyId: string, levers: readonly LeverDefinition[]): PartyPlatform {
  return { partyId, positions: Object.fromEntries([...levers].sort((a, b) => a.id < b.id ? -1 : 1).map(lever => [lever.id, {
    draftValue: 2, publishedValue: null, publishedAt: null,
    lastDirectionalValue: null, lastDirectionalAt: null, reversalPenalty: 0,
  }])) };
}
export function editDraft(platform: PartyPlatform, leverId: string, value: number): PartyPlatform {
  requireLeverValue(value);
  const previous = platform.positions[leverId];
  if (!previous) throw new Error('공약 레버를 찾을 수 없습니다.');
  return { ...platform, positions: { ...platform.positions, [leverId]: { ...previous, draftValue: value } } };
}
export function publishPlatform(platform: PartyPlatform, leverId: string, date: string): PartyPlatform {
  const previous = platform.positions[leverId];
  if (!previous) throw new Error('공약 레버를 찾을 수 없습니다.');
  if (previous.publishedValue === previous.draftValue) return platform;
  const directional = previous.draftValue !== 2;
  const reversal = directional && previous.lastDirectionalValue !== null && previous.lastDirectionalAt !== null &&
    (previous.draftValue - 2) * (previous.lastDirectionalValue - 2) < 0 &&
    daysBetween(previous.lastDirectionalAt, date) >= 0 && date <= addMonths(previous.lastDirectionalAt, 6);
  // Agenda Slot / Staff Capacity publication costs are deferred to Phase C.
  return { ...platform, positions: { ...platform.positions, [leverId]: { ...previous,
    publishedValue: previous.draftValue, publishedAt: date,
    lastDirectionalValue: directional ? previous.draftValue : previous.lastDirectionalValue,
    lastDirectionalAt: directional ? date : previous.lastDirectionalAt,
    reversalPenalty: Math.min(10000, previous.reversalPenalty + (reversal ? 2500 : 0)),
  } } };
}
export function decayConsistency(platform: PartyPlatform): PartyPlatform {
  return { ...platform, positions: Object.fromEntries(Object.keys(platform.positions).sort().map(id => [id, {
    ...platform.positions[id]!, reversalPenalty: Math.max(0, platform.positions[id]!.reversalPenalty - 400),
  }])) };
}
// Outcome projection excludes drafts and command/event logs, while preserving publication memory.
export function publishedPlatform(platform: PartyPlatform) {
  return Object.fromEntries(Object.keys(platform.positions).sort().map(id => [id, {
    value: platform.positions[id]!.publishedValue, publishedAt: platform.positions[id]!.publishedAt,
    lastDirectionalValue: platform.positions[id]!.lastDirectionalValue, lastDirectionalAt: platform.positions[id]!.lastDirectionalAt,
    reversalPenalty: platform.positions[id]!.reversalPenalty,
  }]));
}
export function createGovernmentPolicy(partyId: string, levers: readonly LeverDefinition[]): GovernmentPolicy {
  return { partyId, levers: Object.fromEntries([...levers].sort((a, b) => a.id < b.id ? -1 : 1)
    .map(lever => [lever.id, { value: 2 as const, history: [] }])) };
}
// Engine-only transition for B2's government AI. No player enactment command exists.
export function enactPolicy(policy: GovernmentPolicy, actorId: string, leverId: string, value: number, date: string): GovernmentPolicy {
  requireLeverValue(value);
  if (actorId !== policy.partyId) throw new Error('집권당만 정부 정책을 집행할 수 있습니다.');
  const lever = policy.levers[leverId];
  if (!lever) throw new Error('정부 정책 레버를 찾을 수 없습니다.');
  if (lever.history.length && date < lever.history[lever.history.length - 1]!.enactedAt) throw new Error('집행 이력의 날짜가 역전되었습니다.');
  if (lever.value === value) return policy;
  return { ...policy, levers: { ...policy.levers, [leverId]: { value, history: [...lever.history, { value, enactedAt: date }] } } };
}
export function addMonths(date: string, months: number): string {
  if (!Number.isInteger(months) || months < 0) throw new Error('집행 시차는 음수가 아닌 정수여야 합니다.');
  daysBetween(date, date); // Validate ISO date using the shared calendar.
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const total = year * 12 + month - 1 + months;
  const nextYear = Math.floor(total / 12), nextMonth = total % 12 + 1;
  const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}
export function effectiveValue(policy: GovernmentPolicy, lever: LeverDefinition, date: string): LeverValue {
  let value: LeverValue = 2;
  for (const change of policy.levers[lever.id]!.history) {
    if (addMonths(change.enactedAt, lever.implementationDelayMonths) <= date) value = change.value;
  }
  return value;
}
