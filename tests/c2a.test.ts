import { describe, expect, it } from 'vitest';
import legacyC1 from './fixtures/phase-c1-v3.json' with { type: 'json' };
import legacyB2 from './fixtures/phase-b2-v2.json' with { type: 'json' };
import { createGame, dispatchCommand, replay, simulationFields } from '../src/engine/simulation/engine';
import { createFoundedGame, foundingCommand } from './helpers';
import { stateHash } from '../src/engine/simulation/determinism';
import { deserializeSave, serializeSave } from '../src/persistence/codec';
import { politicianModel } from '../src/data/seeds/politicians';
import { realityPack, seedPack } from '../src/data/reality';
import { REGION_IDS } from '../src/data/reality/schema';
import { validateData } from '../src/data/reality/validate';
import { blockedNames, generatePoliticians, isBlockedName, monthlySupply, nameTableCollisions, POOL_STREAM } from '../src/engine/people/generator';
import { addDays, isMonthlyTick } from '../src/engine/calendar';
import { ATTRIBUTE_IDS } from '../src/types/people';
import { DOMAIN_IDS } from '../src/types/simulation';
import type { GameState } from '../src/types/game';

const g = politicianModel.generator;
const advance = (s: GameState, n = 1) => { for (let i = 0; i < n; i++) s = dispatchCommand(s, { type: 'ADVANCE_WEEK' }); return s; };
// Supply schedule without the rest of the monthly chain (fast property checks).
function supplyUntil(seed: number, until: string): GameState {
  let s = createFoundedGame(seed);
  for (let date = addDays(s.date, 7); date <= until; date = addDays(date, 7)) if (isMonthlyTick(date)) s = monthlySupply({ ...s, date }).state;
  return s;
}

describe('C2a virtual politician generator', () => {
  it('creates no one before founding, about 30 prospects at founding, deterministic per seed', () => {
    expect(createGame(42).politicians).toEqual([]);
    const a = createFoundedGame(42), b = createFoundedGame(42), c = createFoundedGame(43);
    expect(a.politicians).toHaveLength(g.initial);
    expect(a.politicians).toEqual(b.politicians);
    expect(a.politicians.map(p => p.name)).not.toEqual(c.politicians.map(p => p.name));
    expect(a.politicians.map(p => p.id)).toEqual([...a.politicians.map(p => p.id)].sort());
    expect(a.inbox.some(m => m.sender === '영입 책임자' && m.body.includes('가상 인물'))).toBe(true);
  });
  it('stores exactly the Slice §20.4 attributes and no personal judgement fields', () => {
    for (const p of createFoundedGame(7).politicians) {
      expect(Object.keys(p).sort()).toEqual(['age', 'attributes', 'availableUntil', 'background', 'cooldownUntil', 'domainInterest', 'gender', 'generatedAt', 'id', 'name', 'origin', 'policyExpertise', 'recruitedAt', 'regionId', 'role', 'status', 'trust', 'valueLean']);
      expect(Object.keys(p.attributes).sort()).toEqual([...ATTRIBUTE_IDS].sort());
      expect(Object.keys(p.policyExpertise).sort()).toEqual([...DOMAIN_IDS].sort());
      for (const v of [...Object.values(p.attributes), ...Object.values(p.policyExpertise), ...Object.values(p.domainInterest), p.trust]) { expect(Number.isInteger(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); }
      expect(Object.keys(p.valueLean)).toHaveLength(g.leanValues);
      expect(p).toMatchObject({ origin: 'GENERATED', status: 'prospect', cooldownUntil: null, role: null, recruitedAt: null });
      expect(JSON.stringify(p)).not.toMatch(/intelligence|moral|honest|patriot|corrupt|mental|stability/i);
    }
  });
  it('keeps names unique and blocks Reality, denylisted and forbidden names (synthetic denylist)', () => {
    const base = createFoundedGame(11);
    expect(new Set(base.politicians.map(p => p.name)).size).toBe(base.politicians.length);
    const blocked = blockedNames();
    for (const party of realityPack.parties) expect(isBlockedName(party.name.value, blocked)).toBe(true);
    expect(isBlockedName('KBS', blocked)).toBe(true);
    const target = base.politicians[0]!.name;
    const denylist = [{ name: target, note: 'synthetic test entry' }];
    const regenerated = generatePoliticians({ ...createGame(11), playerParty: base.playerParty, politicians: [] }, g.initial, { denylist });
    expect(regenerated.politicians.map(p => p.name)).not.toContain(target);
    expect(isBlockedName(` ${target} `, blockedNames(denylist))).toBe(true);
    expect(nameTableCollisions()).toEqual([]);
    expect(nameTableCollisions(politicianModel, denylist)).toEqual([target]);
    expect(validateData(realityPack, seedPack).errors).toEqual([]);
    expect(validateData(realityPack, seedPack, false, undefined, undefined, { model: politicianModel, denylist }).errors).toEqual([`politicians: generated name collision ${target}`]);
    expect(validateData(realityPack, seedPack, false, undefined, undefined, { model: politicianModel, denylist: [{ name: '' }] }).errors.length).toBeGreaterThan(0);
  });
  it('guarantees at least 50 cumulative prospects by 2027-12-06 and never exceeds 80, over 60 seeds', () => {
    for (let seed = 0; seed < 60; seed++) {
      const by = supplyUntil(seed, g.guaranteeBy);
      expect(by.politicians.length, `seed ${seed}`).toBeGreaterThanOrEqual(g.guaranteeCount);
      const end = supplyUntil(seed, '2028-04-10');
      expect(end.politicians.length).toBeLessThanOrEqual(g.cap);
      expect(new Set(end.politicians.map(p => p.name)).size).toBe(end.politicians.length);
    }
  });
  it('adds 1-3 per monthly tick through the real engine, expires prospects, and respects the cap', () => {
    let s = createFoundedGame(42), last = s.politicians.length;
    while (s.status === 'active') {
      s = advance(s);
      const added = s.politicians.length - last; last = s.politicians.length;
      if (!isMonthlyTick(s.date)) expect(added).toBe(0);
      else if (s.date > g.guaranteeBy && s.politicians.length < g.cap) { expect(added).toBeGreaterThanOrEqual(g.monthlyMin); expect(added).toBeLessThanOrEqual(g.monthlyMax); }
      if (s.date === g.guaranteeBy) expect(s.politicians.length).toBeGreaterThanOrEqual(g.guaranteeCount);
      for (const p of s.politicians) expect(p.status === 'unavailable').toBe(p.availableUntil < s.date);
    }
    expect(s.politicians.length).toBeLessThanOrEqual(g.cap);
    const full = generatePoliticians({ ...s, politicians: s.politicians }, 500);
    expect(full.politicians).toHaveLength(g.cap);
  });
  it('follows regional population weights loosely; scouting weights shift probability only', () => {
    const base = createFoundedGame(1), mass = Object.fromEntries(REGION_IDS.map(id => [id, base.cohorts.filter(c => c.regionId === id).reduce((s, c) => s + c.weight, 0)]));
    const counts: Record<string, number> = {}, boosted: Record<string, number> = {};
    let total = 0;
    for (let seed = 0; seed < 40; seed++) {
      const s = { ...createFoundedGame(seed), politicians: [] };
      const plain = generatePoliticians(s, g.initial), scouted = generatePoliticians(s, g.initial, { regionWeight: id => id === 'jeju' ? 20 : 1 });
      expect(scouted.politicians).toHaveLength(plain.politicians.length);
      for (const p of plain.politicians) { counts[p.regionId] = (counts[p.regionId] ?? 0) + 1; total++; }
      for (const p of scouted.politicians) boosted[p.regionId] = (boosted[p.regionId] ?? 0) + 1;
    }
    for (const id of REGION_IDS) expect(Math.abs((counts[id] ?? 0) / total - mass[id]! / 1_000_000)).toBeLessThan(0.05);
    expect(boosted.jeju ?? 0).toBeGreaterThan((counts.jeju ?? 0) * 3);
  });
  it('tilts background interest toward declared values without changing stats ranges', () => {
    const share = (values: typeof foundingCommand.values) => {
      let matched = 0, total = 0;
      for (let seed = 0; seed < 30; seed++) for (const p of dispatchCommand(createGame(seed), { ...foundingCommand, values }).politicians) {
        total++; if (politicianModel.backgrounds.find(b => b.id === p.background)!.values.includes('housing')) matched++;
      }
      return matched / total;
    };
    expect(share(['housing', 'decentralization', 'climate'])).toBeGreaterThan(share(['market', 'efficiency', 'labour']));
  });
  it('never feeds the voter chain, AI, polls or other RNG streams in C2a', () => {
    let withPool = createFoundedGame(42), stripped: GameState = withPool;
    const strip = (s: GameState): GameState => ({ ...s, politicians: [], rngState: Object.fromEntries(Object.entries(s.rngState).filter(([k]) => !k.includes(POOL_STREAM))) });
    stripped = strip(stripped);
    for (let i = 0; i < 20; i++) { withPool = advance(withPool); stripped = strip(advance(stripped)); }
    expect(simulationFields(strip(withPool))).toEqual(simulationFields(stripped));
    expect(withPool.politicians.length).toBeGreaterThan(g.initial);
  });
  it('survives save, load and replay, and rejects real C1 and B2 saves with Korean guidance', () => {
    const s = advance(createFoundedGame(42), 9);
    expect(stateHash(deserializeSave(serializeSave(s)))).toBe(stateHash(s));
    expect(stateHash(replay(42, s.commandLog))).toBe(stateHash(s));
    expect(legacyC1.state.schemaVersion).toBe(3); expect(legacyC1.checksum).toBe(stateHash(legacyC1.state));
    expect(() => deserializeSave(JSON.stringify(legacyC1))).toThrow('C1 세이브(스키마 3)는 현재 버전(스키마 8)과 호환되지 않습니다. 기존 JSON을 보관');
    expect(() => deserializeSave(JSON.stringify(legacyB2))).toThrow('B2 세이브(스키마 2)');
    const tampered = JSON.parse(serializeSave(s)); tampered.state.politicians[0].attributes.honesty = 50;
    expect(() => deserializeSave(JSON.stringify(tampered))).toThrow();
  });
});
