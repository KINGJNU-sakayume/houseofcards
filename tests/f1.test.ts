import { describe, expect, it } from 'vitest';
import legacyE3 from './fixtures/phase-e3-v12.json' with { type: 'json' };
import { politicalModel as model } from '../src/data/seeds/political-model';
import { electionModel as em } from '../src/data/seeds/election';
import { newsExposure } from '../src/engine/voters/dynamics';
import { dispatchCommand } from '../src/engine/simulation/engine';
import { stateHash } from '../src/engine/simulation/determinism';
import { fixedMultiply } from '../src/engine/simulation/math';
import { deserializeSave } from '../src/persistence/codec';
import type { GameState } from '../src/types/game';
import { createFoundedGame } from './helpers';

const founded = createFoundedGame(42);
let month: GameState = founded;
for (let i = 0; i < 6; i++) month = dispatchCommand(month, { type: 'ADVANCE_WEEK' });
const lastPoll = (s: GameState) => s.politics.polls.filter(p => p.date < s.date).at(-1)!;

describe('F1 news exposure (awareness path only, same rule for every party)', () => {
  it('follows the latest published national poll, capped, for AI parties and the player alike', () => {
    const poll = lastPoll(month);
    for (const id of Object.keys(poll.national.results).filter(id => id !== 'none')) {
      expect(newsExposure(month, id)).toBe(Math.min(model.dynamics.coverageCap, fixedMultiply(poll.national.results[id]!.point, model.dynamics.coverageSlope)));
    }
    const ranked = Object.keys(poll.national.results).filter(id => id !== 'none').sort((a, b) => poll.national.results[a]!.point - poll.national.results[b]!.point);
    expect(newsExposure(month, ranked[0]!)).toBeLessThanOrEqual(newsExposure(month, ranked.at(-1)!));
    expect(newsExposure(month, 'dp')).toBe(model.dynamics.coverageCap);
  });
  it('adds the official campaign period only for parties on the ballot, and only before the election', () => {
    const campaign = { ...month, date: em.finalPush.start };
    expect(newsExposure(campaign, 'dp') - newsExposure({ ...campaign, date: '2028-01-10' }, 'dp')).toBe(em.finalPush.campaignPeriodExposure);
    // No list and no nominee: the player is not on the ballot.
    expect(newsExposure(campaign, 'player') - newsExposure({ ...campaign, date: '2028-01-10' }, 'player')).toBe(0);
    const listed = { ...campaign, nominations: { ...campaign.nominations, list: ['pol-001'] } };
    expect(newsExposure(listed, 'player') - newsExposure({ ...listed, date: '2028-01-10' }, 'player')).toBe(em.finalPush.campaignPeriodExposure);
    expect(newsExposure({ ...listed, election: {} as GameState['election'] }, 'player')).toBe(newsExposure({ ...listed, date: '2028-01-10' }, 'player'));
  });
  it('is zero before any poll exists for the party', () => {
    expect(newsExposure({ ...founded, politics: { ...founded.politics, polls: [] } }, 'player')).toBe(0);
  });
});

describe('F1 saves', () => {
  it('rejects real E3 saves (schema 12) with Korean keep-JSON guidance', () => {
    expect(legacyE3.state.schemaVersion).toBe(12); expect(legacyE3.checksum).toBe(stateHash(legacyE3.state));
    expect(() => deserializeSave(JSON.stringify(legacyE3))).toThrow('E3 세이브(스키마 12)는 언론 보도·선거운동 기간 인지도가 추가된 현재 버전(스키마 13)과 호환되지 않습니다. 기존 JSON을 보관');
  });
});
