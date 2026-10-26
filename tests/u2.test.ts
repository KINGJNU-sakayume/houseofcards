import { describe, expect, it } from 'vitest';
import { articles, recentChanges } from '../src/engine/issues/stories';
import { dispatchCommand } from '../src/engine/simulation/engine';
import { stateHash } from '../src/engine/simulation/determinism';
import { MASTHEAD } from '../src/data/content/stories';
import { forbiddenNamesIn } from '../src/validation/forbidden-names';
import type { GameState } from '../src/types/game';
import { createFoundedGame } from './helpers';

const advance = (s: GameState, weeks: number) => { for (let i = 0; i < weeks; i++) s = dispatchCommand(s, { type: 'ADVANCE_WEEK' }); return s; };
const later = advance(createFoundedGame(11), 30);

describe('U2 briefing (pure view)', () => {
  it('writes one article per issue, most salient first, deterministically and without changing state', () => {
    const before = stateHash(later);
    const a = articles(later);
    expect(a).toHaveLength(6);
    expect(a.map(x => x.salience)).toEqual([...a.map(x => x.salience)].sort((x, y) => y - x));
    expect(articles(later)).toEqual(a);
    expect(stateHash(later)).toBe(before);
    for (const x of a) { expect(x.headline.length).toBeGreaterThan(4); expect(x.lede).toContain('심각도'); expect(x.history.length).toBe(later.history.length); }
  });
  it('tone follows the three-month severity change', () => {
    for (const x of articles(later)) {
      const base = x.history.length > 3 ? x.history[x.history.length - 4]! : x.history[0]!;
      const change = x.severity - base;
      expect(x.tone).toBe(change >= 50 ? 'up' : change <= -50 ? 'down' : 'flat');
    }
  });
  it('lists last month’s polls, enactments and party shifts, newest first', () => {
    const changes = recentChanges(later);
    expect(changes.some(c => c.kind === 'poll')).toBe(true);
    expect(changes.map(c => c.date)).toEqual([...changes.map(c => c.date)].sort().reverse());
  });
  it('uses a fictional outlet name only', () => {
    expect(forbiddenNamesIn(MASTHEAD.name)).toEqual([]);
    expect(MASTHEAD.note).toContain('가상');
  });
});
