import { describe, expect, it } from 'vitest';
import legacyU0 from './fixtures/phase-u0-v15.json' with { type: 'json' };
import { dispatchCommand, HISTORY_MONTHS } from '../src/engine/simulation/engine';
import { isMonthlyTick } from '../src/engine/calendar';
import { stateHash } from '../src/engine/simulation/determinism';
import { deserializeSave, serializeSave } from '../src/persistence/codec';
import type { GameState } from '../src/types/game';
import { createFoundedGame } from './helpers';

const advance = (s: GameState, weeks: number) => { for (let i = 0; i < weeks; i++) s = dispatchCommand(s, { type: 'ADVANCE_WEEK' }); return s; };
const founded = createFoundedGame(3);

describe('U1 inbox links', () => {
  it('founding messages point at the screen they are about', () => {
    const byTitle = Object.fromEntries(founded.inbox.map(m => [m.title, m.link?.route]));
    expect(byTitle['첫 공약과 내부조사를 준비하세요']).toBe('/policy');
    expect(Object.values(byTitle)).toContain('/politicians');
    expect(founded.inbox.every(m => m.link === null || m.link.route.startsWith('/'))).toBe(true);
  });
  it('monthly reports link to the briefing, polls and talent screens', () => {
    let s = founded; while (!isMonthlyTick(s.date)) s = dispatchCommand(s, { type: 'ADVANCE_WEEK' });
    const routes = s.inbox.filter(m => m.date === s.date).map(m => m.link?.route);
    expect(routes).toContain('/korea');
    expect(routes).toContain('/data');
  });
});

describe('U1 monthly history', () => {
  it('records one entry per monthly tick, bounded, from the state after the month', () => {
    const s = advance(founded, 30);
    const months = Array.from({ length: 30 }, (_, i) => i).filter(i => isMonthlyTick(advance(founded, i + 1).date)).length;
    expect(s.history).toHaveLength(Math.min(months, HISTORY_MONTHS));
    const last = s.history.at(-1)!;
    expect(isMonthlyTick(last.date)).toBe(true);
    expect(Object.keys(last.issues).sort()).toEqual(s.issues.map(i => i.id).sort());
    expect(last.support).toBeGreaterThanOrEqual(0);
    expect(stateHash(deserializeSave(serializeSave(s)))).toBe(stateHash(s));
  });
  it('is empty before founding', () => {
    expect(founded.history).toEqual([]);
  });
});

describe('U1 saves', () => {
  it('rejects real U0 saves (schema 15) with Korean keep-JSON guidance', () => {
    expect(legacyU0.state.schemaVersion).toBe(15); expect(legacyU0.checksum).toBe(stateHash(legacyU0.state as never));
    expect(() => deserializeSave(JSON.stringify(legacyU0))).toThrow('U0 세이브(스키마 15)는 편지 바로가기와 월간 기록이 추가된 현재 버전(스키마 16)과 호환되지 않습니다. 기존 JSON을 보관');
  });
});
