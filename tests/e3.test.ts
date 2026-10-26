import { describe, expect, it } from 'vitest';
import legacyE2 from './fixtures/phase-e2-v11.json' with { type: 'json' };
import { electionModel as em } from '../src/data/seeds/election';
import { computeElection } from '../src/engine/election/election';
import { stateHash } from '../src/engine/simulation/determinism';
import { fixedMultiply } from '../src/engine/simulation/math';
import { deserializeSave } from '../src/persistence/codec';
import { createFoundedGame } from './helpers';

describe('E3 election-day national swing', () => {
  it('is bounded relative to each party\'s current support, so a small party\'s swing stays small', () => {
    for (const seed of [0, 1, 42]) {
      const s = createFoundedGame(seed), support = s.politics.analysis.currentSupport;
      const e = computeElection(s);
      for (const [id, v] of Object.entries(e.nationalSwing)) expect(Math.abs(v)).toBeLessThanOrEqual(fixedMultiply(support[id] ?? 0, em.electionDay.nationalSwingRelative) + 1);
      expect(Math.abs(e.nationalSwing.player!)).toBeLessThan(fixedMultiply(support.dp!, em.electionDay.nationalSwingRelative));
    }
  });
  it('is deterministic for the same state and differs between seeds', () => {
    const a = createFoundedGame(7), b = createFoundedGame(8);
    expect(computeElection(a)).toEqual(computeElection(a));
    expect(computeElection(a).nationalSwing).not.toEqual(computeElection(b).nationalSwing);
    expect(stateHash(a)).toBe(stateHash(createFoundedGame(7)));
  });
});

describe('E3 saves', () => {
  it('rejects real E2 saves (schema 11) with Korean keep-JSON guidance', () => {
    expect(legacyE2.state.schemaVersion).toBe(11); expect(legacyE2.checksum).toBe(stateHash(legacyE2.state));
    expect(() => deserializeSave(JSON.stringify(legacyE2))).toThrow('E2 세이브(스키마 11)는 선거일 변동이 바뀐 현재 버전(스키마 16)과 호환되지 않습니다. 기존 JSON을 보관');
  });
});
