import { describe, expect, it } from 'vitest';
import legacyE1 from './fixtures/phase-e1-v10.json' with { type: 'json' };
import { partyManagement } from '../src/data/seeds/party-management';
import { brandAlignment, brandTarget, brandTrustFactor, monthlyBrand } from '../src/engine/parties/brand';
import { evaluateSupport } from '../src/engine/voters/model';
import { voteFlow } from '../src/engine/voters/voteFlow';
import { listReadiness } from '../src/engine/election/nominations';
import { dispatchCommand } from '../src/engine/simulation/engine';
import { stateHash } from '../src/engine/simulation/determinism';
import { deserializeSave } from '../src/persistence/codec';
import { policyLevers } from '../src/data/reality';
import type { Command, GameState } from '../src/types/game';
import { createFoundedGame } from './helpers';

const run = (s: GameState, ...commands: Command[]) => commands.reduce(dispatchCommand, s);
const founded = createFoundedGame(42); // values: housing, safety-net, science
// Publish every lever tagged with a declared value at the opposite end (0) to contradict it.
const against = (s: GameState, value: 'housing' | 'safety-net' | 'science') => {
  for (const l of policyLevers.filter(l => (l.valueTags[value] ?? 0) > 0).slice(0, 2)) {
    s = { ...s, resources: { ...s.resources!, agendaSlots: 6, staffCapacity: 50 } };
    s = run(s, { type: 'SET_PLATFORM_DRAFT', leverId: l.id, value: 0 }, { type: 'PUBLISH_PLATFORM', leverId: l.id });
  }
  return s;
};

describe('E2 brand consistency', () => {
  it('starts consistent, treats unproven values as neutral and rises slowly when the platform contradicts declared values', () => {
    expect(founded.brandInconsistency).toBe(0);
    expect(brandAlignment(founded).every(r => r.platform === null && r.gap === 0)).toBe(true);
    const contradicted = against(founded, 'housing');
    expect(brandAlignment(contradicted).find(r => r.value === 'housing')!.platform).not.toBeNull();
    const target = brandTarget(contradicted);
    expect(target).toBeGreaterThan(0);
    const once = monthlyBrand(contradicted);
    expect(once.brandInconsistency).toBeGreaterThan(0); expect(once.brandInconsistency).toBeLessThan(target);
    // Recovery is gradual too.
    const healed = monthlyBrand({ ...founded, brandInconsistency: once.brandInconsistency });
    expect(healed.brandInconsistency).toBeLessThan(once.brandInconsistency); expect(healed.brandInconsistency).toBeGreaterThan(0);
  });
  it("lowers only the player's trust input, bounded by the configured maximum", () => {
    const base = evaluateSupport(founded), hit = evaluateSupport({ ...founded, brandInconsistency: 1_000_000 });
    const player = base.ids.indexOf('player');
    expect(brandTrustFactor({ ...founded, brandInconsistency: 1_000_000 })).toBe(1_000_000 - partyManagement.brand.maxTrustPenalty);
    for (let c = 0; c < base.prepared.length; c++) {
      base.ids.forEach((_, i) => { if (i !== player) expect(hit.prepared[c]!.inputs[i]).toEqual(base.prepared[c]!.inputs[i]); });
      expect(hit.prepared[c]!.inputs[player]!.trust).toBeLessThanOrEqual(base.prepared[c]!.inputs[player]!.trust);
    }
    expect(hit.aggregated.national!.player!).toBeLessThanOrEqual(base.aggregated.national!.player!);
  });
});

describe('E2 Vote Flow', () => {
  it("conserves each prior party's mass up to rounding, is deterministic and is stored with the internal survey", () => {
    const flow = voteFlow(founded);
    expect(voteFlow(founded)).toEqual(flow);
    const { prepared } = evaluateSupport(founded);
    const weight = prepared.reduce((s, r) => s + r.weight, 0);
    for (const [p, row] of Object.entries(flow)) {
      const prior = Math.round(prepared.reduce((s, r) => s + (r.cohort.partyAttachment[p] ?? 0) * r.weight, 0) / weight);
      expect(Math.abs(Object.values(row).reduce((a, b) => a + b, 0) - prior)).toBeLessThanOrEqual(prepared.length * 8);
    }
    expect(Object.values(flow.player!).reduce((a, b) => a + b, 0)).toBe(0); // no prior loyalty for a new party
    const surveyed = run(founded, { type: 'COMMISSION_INTERNAL_SURVEY' });
    expect(surveyed.internalSurveys.at(-1)!.voteFlow).toEqual(flow);
  });
});

describe('E2 list readiness and saves', () => {
  it('counts people and women a minimum list needs', () => {
    const r = listReadiness(founded);
    expect(r).toMatchObject({ min: 10, available: 0, women: 0, womenNeeded: 5, ready: false });
  });
  it('rejects real E1 saves (schema 10) with Korean keep-JSON guidance', () => {
    expect(legacyE1.state.schemaVersion).toBe(10); expect(legacyE1.checksum).toBe(stateHash(legacyE1.state));
    expect(() => deserializeSave(JSON.stringify(legacyE1))).toThrow('E1 세이브(스키마 10)는 브랜드 일관성이 추가된 현재 버전(스키마 13)과 호환되지 않습니다. 기존 JSON을 보관');
  });
});
