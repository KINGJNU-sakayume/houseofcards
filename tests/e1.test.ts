import { describe, expect, it } from 'vitest';
import golden from './fixtures/c2-golden.json' with { type: 'json' };
import { replay } from '../src/engine/simulation/engine';
import { stateHash } from '../src/engine/simulation/determinism';
import { computeElection } from '../src/engine/election/election';
import { callOrder, EXIT_POLL_ERROR, exitPoll, listShare, marginOf, seasonReview } from '../src/engine/review';
import { cohortLabel } from '../src/data/content/labels';
import type { Command, GameState } from '../src/types/game';

const labels = { region: (id: string) => id, domain: (id: string) => id, cohort: cohortLabel };
const elected = replay(golden.seed, golden.electionCommands as Command[]);
const e = elected.election!;

describe('E1 Election Night', () => {
  it('has a deterministic exit poll with its own bounded error, and calls districts from the widest margin', () => {
    const poll = exitPoll(elected, e);
    expect(exitPoll(elected, e)).toEqual(poll);
    expect(Object.keys(poll).sort()).toEqual(Object.keys(e.listVotes).sort());
    for (const [id, p] of Object.entries(poll)) { expect(Math.abs(p.point - listShare(e, id))).toBeLessThanOrEqual(EXIT_POLL_ERROR); expect(p.low).toBeLessThanOrEqual(p.point); expect(p.high).toBeGreaterThanOrEqual(p.point); }
    const order = callOrder(e);
    expect(new Set(order).size).toBe(e.districts.length);
    const margins = order.map(id => marginOf(e.districts.find(r => r.id === id)!.votes));
    for (let i = 1; i < margins.length; i++) expect(margins[i]!).toBeLessThanOrEqual(margins[i - 1]!);
  });
});

describe('E1 Season Review', () => {
  it('is unavailable before the election and pure after it', () => {
    expect(seasonReview(replay(golden.seed, golden.nominationCommands as Command[]), labels)).toBeNull();
    const before = stateHash(elected);
    const r = seasonReview(elected, labels)!;
    expect(seasonReview(elected, labels)).toEqual(r); expect(stateHash(elected)).toBe(before);
    expect(r.cards.map(c => c.id)).toEqual(['best_policy', 'strongest_region', 'best_recruitment', 'biggest_miss', 'voter_growth', 'lost_opportunity']);
    expect(r.totalSeats).toBe(e.totalSeats.player ?? 0);
    expect(r.cards.find(c => c.id === 'best_policy')!.value).toBe('housing');
    const nominated = Object.keys(elected.nominations.districts)[0]!;
    if (e.districts.find(d => d.id === nominated)!.winner !== 'player') expect(r.cards.find(c => c.id === 'lost_opportunity')!.detail).toContain('차이로 졌습니다');
    expect(r.cohortGrowth).toHaveLength(5);
    expect(r.cohortGrowth[0]!.to - r.cohortGrowth[0]!.from).toBeGreaterThanOrEqual(r.cohortGrowth[4]!.to - r.cohortGrowth[4]!.from);
    expect(r.preview[0]).toContain('원외 정당');
  });
  it('explains the list seats from the vote share under the parallel ruleset', () => {
    const boosted: GameState = { ...elected, nominations: { ...elected.nominations, list: elected.politicians.slice(0, 10).map(p => p.id) },
      politics: { ...elected.politics, perceptions: Object.fromEntries(Object.entries(elected.politics.perceptions).map(([c, v]) => [c, { ...v, player: { ...v.player!, awareness: 1_000_000 } }])) } };
    const strong = { ...boosted, election: computeElection(boosted) };
    const r = seasonReview(strong, labels)!;
    expect(r.listSeats).toBeGreaterThan(0);
    expect([r.ruleset.seatsByQuota, r.ruleset.seatsByQuota + 1]).toContain(r.listSeats);
    expect(r.ruleset.effectiveThreshold).toBe(Math.round(1_000_000 / strong.electionRuleset.listSeats));
    expect(r.preview[0]).toContain('상임위');
    expect(r.cards.find(c => c.id === 'best_recruitment')!.detail).toContain('당선');
  });
});
