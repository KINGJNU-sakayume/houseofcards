import { describe, expect, it } from 'vitest';
import legacyF1 from './fixtures/phase-f1-v13.json' with { type: 'json' };
import { partyManagement as data } from '../src/data/seeds/party-management';
import { monthlyDonations } from '../src/engine/parties/management';
import { dispatchCommand } from '../src/engine/simulation/engine';
import { isMonthlyTick } from '../src/engine/calendar';
import { stateHash } from '../src/engine/simulation/determinism';
import { roundDiv, SCALE } from '../src/engine/simulation/math';
import { deserializeSave } from '../src/persistence/codec';
import type { GameState } from '../src/types/game';
import { createFoundedGame } from './helpers';

const founded = createFoundedGame(42);
const withSupport = (s: GameState, share: number): GameState => ({ ...s, politics: { ...s.politics, analysis: { ...s.politics.analysis, currentSupport: { ...s.politics.analysis.currentSupport, player: share } } } });

describe('F2 donations (GAME_MODEL money only)', () => {
  it('are proportional to current support and zero without support', () => {
    expect(monthlyDonations(withSupport(founded, 0))).toBe(0);
    expect(monthlyDonations(withSupport(founded, 50_000))).toBe(roundDiv(50_000 * data.donations.monthlyPerSupport, SCALE));
    expect(monthlyDonations(withSupport(founded, 100_000))).toBeGreaterThan(monthlyDonations(withSupport(founded, 50_000)));
  });
  it('are booked once on each monthly tick, from the support before the tick, and keep ledger conservation', () => {
    let s = founded, seen = 0;
    while (seen < 2) {
      const expected = monthlyDonations(s), next = dispatchCommand(s, { type: 'ADVANCE_WEEK' });
      const entries = next.finance!.ledger.filter(e => e.kind === 'donations' && e.date === next.date);
      if (isMonthlyTick(next.date)) { expect(entries.map(e => e.amount)).toEqual(expected ? [expected] : []); seen++; } else expect(entries).toEqual([]);
      s = next;
    }
    const f = s.finance!;
    expect(s.resources!.money).toBe(data.newParty.money + f.ledgerTruncatedSum + f.ledger.reduce((a, e) => a + e.amount, 0));
  });
  it('are deterministic for the same state', () => {
    const next = dispatchCommand(founded, { type: 'ADVANCE_WEEK' });
    expect(next.platforms).toEqual(dispatchCommand(founded, { type: 'ADVANCE_WEEK' }).platforms);
    expect(stateHash(next)).toBe(stateHash(dispatchCommand(founded, { type: 'ADVANCE_WEEK' })));
  });
});

describe('F2 saves', () => {
  it('rejects real F1 saves (schema 13) with Korean keep-JSON guidance', () => {
    expect(legacyF1.state.schemaVersion).toBe(13); expect(legacyF1.checksum).toBe(stateHash(legacyF1.state));
    expect(() => deserializeSave(JSON.stringify(legacyF1))).toThrow('F1 세이브(스키마 13)는 후원금 수입이 추가된 현재 버전(스키마 14)과 호환되지 않습니다. 기존 JSON을 보관');
  });
});
