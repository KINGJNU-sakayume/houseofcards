import { politicianModel as defaultModel, type PoliticianModel } from '../../data/seeds/politicians';
import { realityPack } from '../../data/reality';
import { REGION_IDS } from '../../data/reality/schema';
import { realNameDenylist, type NameDenylist } from '../../validation/real-name-denylist';
import { forbiddenNamesIn } from '../../validation/forbidden-names';
import type { GameState } from '../../types/game';
import { ATTRIBUTE_IDS, type Politician } from '../../types/people';
import { CORE_VALUES, DOMAIN_IDS, type CoreValue } from '../../types/simulation';
import { addDays, isMonthlyTick } from '../calendar';
import { deriveStream, randomInt, streamKey } from '../simulation/rng';

export const POOL_STREAM = 'politician-pool';
const normalizeName = (name: string) => name.normalize('NFKC').replace(/\s/g, '').toLowerCase();
const clamp100 = (n: number) => Math.max(0, Math.min(100, n));
export function blockedNames(denylist: NameDenylist = realNameDenylist): Set<string> {
  return new Set([...realityPack.parties.flatMap(p => [p.name.value, p.shortName.value]), ...realityPack.politicians.map(p => p.name.value), ...denylist.map(d => d.name)].map(normalizeName));
}
export function isBlockedName(name: string, blocked: ReadonlySet<string>): boolean {
  return blocked.has(normalizeName(name)) || forbiddenNamesIn(name).length > 0;
}
export interface GeneratorOptions {
  denylist?: NameDenylist;
  model?: PoliticianModel;
  // Probability weight multiplier per region (C2c candidate scouting); never changes counts.
  regionWeight?: (regionId: string) => number;
}
function weighted<T>(items: readonly T[], weight: (item: T) => number, draw: (max: number) => number): T {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  let pick = draw(total);
  for (const item of items) { pick -= weight(item); if (pick < 0) return item; }
  throw new Error('Invalid weighted draw');
}
export function generatePoliticians(state: GameState, count: number, options: GeneratorOptions = {}): GameState {
  const model = options.model ?? defaultModel, g = model.generator;
  const room = Math.max(0, Math.min(count, g.cap - state.politicians.length));
  if (!room) return state;
  const key = streamKey(POOL_STREAM, state.date);
  let rng = state.rngState[key] ?? deriveStream(state.seed, POOL_STREAM, state.date);
  const draw = (max: number) => { const r = randomInt(rng, max); rng = r.state; return r.value; };
  const blocked = blockedNames(options.denylist);
  const used = new Set(state.politicians.map(p => normalizeName(p.name)));
  const partyValues: readonly CoreValue[] = state.playerParty?.values ?? [];
  const regionMass = Object.fromEntries(REGION_IDS.map(id => [id, state.cohorts.filter(c => c.regionId === id).reduce((s, c) => s + c.weight, 0)]));
  const combos = model.surnames.length * model.givenNames.length;
  const created: Politician[] = [];
  for (let i = 0; i < room; i++) {
    // Declared values tilt who is interested in the party (probability weights only).
    const background = weighted(model.backgrounds, b => b.weight * (1 + g.valueInterestWeight * b.values.filter(v => partyValues.includes(v)).length), draw);
    const regionId = weighted([...REGION_IDS], id => regionMass[id]! * Math.max(1, options.regionWeight?.(id) ?? 1), draw);
    const gender = draw(2) ? 'male' as const : 'female' as const;
    const age = g.ageMin + draw(g.ageMax - g.ageMin + 1);
    const attributes = Object.fromEntries(ATTRIBUTE_IDS.map(id => [id, clamp100(g.attributeBase + draw(g.attributeSpread) + (background.attributes[id] ?? 0))])) as Politician['attributes'];
    const policyExpertise = Object.fromEntries(DOMAIN_IDS.map(d => [d, clamp100(g.expertiseBase + draw(g.expertiseSpread) + (background.domains[d] ?? 0))])) as Politician['policyExpertise'];
    const domainInterest = Object.fromEntries(DOMAIN_IDS.map(d => [d, clamp100(draw(g.interestSpread) + 2 * (background.domains[d] ?? 0))])) as Politician['domainInterest'];
    const valueLean: Politician['valueLean'] = {};
    const pool = [...CORE_VALUES];
    for (let v = 0; v < g.leanValues; v++) {
      const value = weighted(pool, c => 1 + (background.values.includes(c) ? 4 : 0) + (partyValues.includes(c) ? g.valueInterestWeight : 0), draw);
      pool.splice(pool.indexOf(value), 1);
      valueLean[value] = g.leanMin + draw(g.leanMax - g.leanMin + 1);
    }
    // Deterministic linear probe through the name table; validator guarantees the table is clean.
    let index = draw(combos), name = '';
    for (let probe = 0; probe < combos; probe++, index = (index + 1) % combos) {
      const candidate = model.surnames[Math.floor(index / model.givenNames.length)]! + model.givenNames[index % model.givenNames.length]!;
      if (!used.has(normalizeName(candidate)) && !isBlockedName(candidate, blocked)) { name = candidate; break; }
    }
    if (!name) throw new Error('가상 인물 이름 표가 부족합니다.');
    used.add(normalizeName(name));
    created.push({ id: `pol-${String(state.politicians.length + created.length + 1).padStart(3, '0')}`, name, gender, age, background: background.id, regionId,
      origin: 'GENERATED', generatedAt: state.date, attributes, policyExpertise, valueLean: Object.fromEntries(Object.entries(valueLean).sort(([a], [b]) => a < b ? -1 : 1)),
      domainInterest, status: 'prospect', availableUntil: addDays(state.date, g.availabilityWeeks * 7), cooldownUntil: null, trust: g.initialTrust, role: null, recruitedAt: null });
  }
  return { ...state, politicians: [...state.politicians, ...created], rngState: { ...state.rngState, [key]: rng } };
}
export function remainingMonthlyTicks(date: string, until: string): number {
  let count = 0;
  for (let d = date; d <= until; d = addDays(d, 7)) if (isMonthlyTick(d)) count++;
  return count;
}
// Monthly supply: drawn 1–3, topped up deterministically so the cumulative
// supply reaches the guarantee by its date, never above the cap.
export function monthlySupply(state: GameState, options: GeneratorOptions = {}): { state: GameState; added: number } {
  const model = options.model ?? defaultModel, g = model.generator;
  const key = streamKey(POOL_STREAM, state.date);
  let rng = state.rngState[key] ?? deriveStream(state.seed, POOL_STREAM, state.date);
  const r = randomInt(rng, g.monthlyMax - g.monthlyMin + 1); rng = r.state;
  let count = g.monthlyMin + r.value;
  const ticks = state.date <= g.guaranteeBy ? remainingMonthlyTicks(state.date, g.guaranteeBy) : 0;
  if (ticks) count = Math.max(count, Math.ceil(Math.max(0, g.guaranteeCount - state.politicians.length) / ticks));
  const before = state.politicians.length;
  const next = generatePoliticians({ ...state, rngState: { ...state.rngState, [key]: rng } }, count, options);
  return { state: next, added: next.politicians.length - before };
}
// Weekly: unrecruited people expire after their window; a refusal's cooldown ends
// back in the prospect list while the person is still available.
export function updatePoolStatus(state: GameState): GameState {
  const status = (p: Politician): Politician['status'] => {
    if (p.status === 'declined' && p.cooldownUntil !== null && p.cooldownUntil <= state.date) return p.availableUntil < state.date ? 'unavailable' : 'prospect';
    if (p.status === 'prospect' && p.availableUntil < state.date) return 'unavailable';
    return p.status;
  };
  if (state.politicians.every(p => status(p) === p.status)) return state;
  return { ...state, politicians: state.politicians.map(p => status(p) === p.status ? p : { ...p, status: status(p), cooldownUntil: status(p) === 'declined' ? p.cooldownUntil : null }) };
}
// Every name the table can produce; the validator fails CI if any is blocked.
export function nameTableCollisions(model: PoliticianModel = defaultModel, denylist: NameDenylist = realNameDenylist): string[] {
  const blocked = blockedNames(denylist);
  return model.surnames.flatMap(s => model.givenNames.map(g => s + g)).filter(name => isBlockedName(name, blocked));
}
