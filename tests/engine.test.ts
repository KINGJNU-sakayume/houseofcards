import { createFoundedGame as createGame } from './helpers';
import { describe, expect, it } from 'vitest';
import { addDays, CALENDAR, daysBetween, isMonday, isMonthlyTick, weekCount } from '../src/engine/calendar';
import { canonicalJson, deepFreeze, stateHash } from '../src/engine/simulation/determinism';
import { dispatchCommand, replay } from '../src/engine/simulation/engine';
import { fixedExp, fixedMultiply, roundDiv, SCALE } from '../src/engine/simulation/math';
import { handleEngineRequest } from '../src/engine/simulation/protocol';
import { deriveStream, nextUint32, randomInt, streamKey } from '../src/engine/simulation/rng';

describe('calendar foundation', () => {
  it('has 78 inclusive Mondays / 77 advances and stops before election simulation', () => {
    let game = createGame(42);
    const dates = [game.date];
    const months: string[] = [];
    for (let i = 0; i < 77; i++) {
      const before = game;
      game = dispatchCommand(game, { type: 'ADVANCE_WEEK' });
      expect(daysBetween(before.date, game.date)).toBe(7);
      expect(isMonday(game.date)).toBe(true);
      dates.push(game.date);
      if (isMonthlyTick(game.date)) months.push(game.date.slice(0, 7));
    }
    expect(weekCount(CALENDAR)).toBe(78);
    expect(dates).toHaveLength(78);
    expect(game.date).toBe('2028-04-10');
    expect(game.status).toBe('phase_complete');
    expect(game.tick).toBe(78);
    expect(new Set(months).size).toBe(18);
    expect(months).toHaveLength(18);
    expect(daysBetween(game.date, CALENDAR.electionDate)).toBe(2);
    expect(dispatchCommand(game, { type: 'ADVANCE_WEEK' })).toBe(game);
  });
  it('handles leap days, year rollover, month-end Mondays and invalid dates', () => {
    expect(addDays('2028-02-28', 7)).toBe('2028-03-06');
    expect(addDays('2027-12-27', 7)).toBe('2028-01-03');
    expect(isMonthlyTick('2026-10-26')).toBe(true);
    expect(isMonthlyTick('2026-10-19')).toBe(false);
    expect(isMonthlyTick('2026-10-27')).toBe(false);
    expect(() => addDays('2027-02-29', 1)).toThrow();
  });
});
describe('named RNG streams', () => {
  it('matches an explicit xorshift32 reference sequence', () => {
    let state = 1;
    const actual: number[] = [];
    for (let i = 0; i < 3; i++) { const draw = nextUint32(state); actual.push(draw.value); state = draw.state; }
    expect(actual).toEqual([270369, 67634689, 2647435461]);
  });
  it('isolates subsystem, date and seed without ambiguous keys', () => {
    const base = deriveStream(42, 'polls', '2026-10-19');
    expect(deriveStream(42, 'polls', '2026-10-19')).toBe(base);
    expect(deriveStream(42, 'ai', '2026-10-19')).not.toBe(base);
    expect(deriveStream(42, 'polls', '2026-10-26')).not.toBe(base);
    expect(deriveStream(43, 'polls', '2026-10-19')).not.toBe(base);
    expect(streamKey('a:b', 'c')).not.toBe(streamKey('a', 'b:c'));
    expect(nextUint32(base)).toEqual(nextUint32(base));
  });
  it('draws bounded integers and validates states', () => {
    let state = deriveStream(0, 'test', '2026-10-19');
    for (let i = 0; i < 1000; i++) { const draw = randomInt(state, 7); expect(draw.value).toBeGreaterThanOrEqual(0); expect(draw.value).toBeLessThan(7); state = draw.state; }
    expect(() => randomInt(state, 0)).toThrow();
    expect(() => nextUint32(0)).toThrow();
  });
});
describe('fixed precision math and state hashes', () => {
  it('uses symmetric half-away-from-zero integer rounding', () => {
    expect(roundDiv(5, 2)).toBe(3);
    expect(roundDiv(-5, 2)).toBe(-3);
    expect(roundDiv(4, 3)).toBe(1);
    expect(fixedMultiply(1_500_000, 2_000_000)).toBe(3_000_000);
    expect(() => roundDiv(Number.MAX_SAFE_INTEGER + 1, 1)).toThrow();
  });
  it('approximates exp with fixed operations and is monotone', () => {
    expect(fixedExp(0)).toBe(SCALE);
    expect(fixedExp(SCALE) / SCALE).toBeCloseTo(2.71828, 3);
    expect(fixedExp(-SCALE) / SCALE).toBeCloseTo(0.367879, 4);
    let previous = 0;
    for (let x = -8 * SCALE; x <= 8 * SCALE; x += SCALE / 4) {
      const value = fixedExp(x); expect(value).toBeGreaterThan(previous); previous = value;
    }
    expect(() => fixedExp(9 * SCALE)).toThrow();
  });
  it('sorts keys, preserves array order and refuses non-JSON state', () => {
    expect(stateHash({ z: 3, a: { y: 1, x: 2 } })).toBe(stateHash({ a: { x: 2, y: 1 }, z: 3 }));
    expect(stateHash([1, 2])).not.toBe(stateHash([2, 1]));
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(() => stateHash({ a: NaN })).toThrow();
    expect(() => stateHash({ a: undefined })).toThrow();
  });
});
describe('commands and replay', () => {
  it('never mutates input and reproduces the exact final hash', () => {
    const initial = createGame(765);
    const originalHash = stateHash(initial);
    let game = dispatchCommand(initial, { type: 'RESPOND_INBOX', messageId: initial.inbox[0]!.id });
    expect(dispatchCommand(game, { type: 'RESPOND_INBOX', messageId: initial.inbox[0]!.id })).toBe(game);
    for (let i = 0; i < 77; i++) game = dispatchCommand(game, { type: 'ADVANCE_WEEK' });
    game = dispatchCommand(game, { type: 'RESPOND_INBOX', messageId: game.inbox[0]!.id });
    expect(stateHash(initial)).toBe(originalHash);
    expect(Object.isFrozen(game.inbox[0])).toBe(true);
    expect(game.inbox.length).toBeLessThanOrEqual(60);
    expect(stateHash(replay(game.seed, game.commandLog))).toBe(stateHash(game));
    expect(() => dispatchCommand(game, { type: 'RESPOND_INBOX', messageId: 'missing' })).toThrow();
  });
  it('worker protocol is a thin wrapper around the same pure engine', () => {
    const state = deepFreeze(createGame(2));
    const response = handleEngineRequest({ id: 1, state, command: { type: 'ADVANCE_WEEK' } });
    expect(response.ok).toBe(true);
    if (response.ok) expect(response.hash).toBe(stateHash(dispatchCommand(state, { type: 'ADVANCE_WEEK' })));
    expect(handleEngineRequest({ id: 2, state, command: { type: 'RESPOND_INBOX', messageId: 'no' } }).ok).toBe(false);
  });
  it.each([-1, 0x100000000, NaN, 1.5])('rejects invalid seed %s', seed => expect(() => createGame(seed)).toThrow());
});
