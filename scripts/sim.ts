import { createGame, dispatchCommand } from '../src/engine/simulation/engine';
import { stateHash } from '../src/engine/simulation/determinism';
import { deserializeSave, serializeSave } from '../src/persistence/codec';
import { SCALE } from '../src/engine/simulation/math';
import { addDays, isMonthlyTick } from '../src/engine/calendar';
import { policyLevers } from '../src/data/reality';
import { politicalModel as model } from '../src/data/seeds/political-model';
import { DOMAIN_IDS } from '../src/types/simulation';
import type { GameState } from '../src/types/game';
import { platformDiversity } from '../src/engine/parties/ai';
const strategies = ['balanced', 'idle', 'housing-focused'] as const;
function assertState(state: GameState) {
  if (state.cohorts.length !== 96 || state.cohorts.reduce((s, c) => s + c.weight, 0) !== SCALE || state.cohorts.some(c => c.weight < 0)) throw new Error('Invalid cohorts');
  for (const issue of state.issues) for (const value of [issue.severity, issue.salience, ...Object.values(issue.drivers)]) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 10000) throw new Error(`Invalid issue ${issue.id}`);
  }
  for (const vector of [state.politics.analysis.currentSupport, ...Object.values(state.politics.analysis.byAge), ...Object.values(state.politics.analysis.byRegion)]) {
    if (Object.values(vector).some(p => !Number.isInteger(p) || p < 0 || p > SCALE) || Object.values(vector).reduce((a, b) => a + b, 0) !== SCALE) throw new Error('Invalid choice probabilities');
  }
  for (const [id, share] of Object.entries(state.politics.analysis.currentSupport)) {
    if (share > model.smoke.maxPartySupport || (['dp', 'ppp'].includes(id) && share < model.smoke.minMajorSupport)) throw new Error(`Implausible support ${id}: ${share}`);
  }
  if (platformDiversity(state.platforms) < model.ai.diversityFloor) throw new Error('AI platforms collapsed');
  for (const party of state.politics.parties) if (party.ai.changesThisMonth > model.ai.monthlyCap || party.ai.changesThisQuarter > model.ai.quarterlyCap) throw new Error('AI cap exceeded');
}
function publishBot(state: GameState, domain: string): GameState {
  for (const lever of policyLevers.filter(l => l.domain === domain)) {
    const position = state.platforms.find(p => p.partyId === 'player-preview')!.positions[lever.id]!;
    if (position.draftValue !== 3) state = dispatchCommand(state, { type: 'SET_PLATFORM_DRAFT', leverId: lever.id, value: 3 });
    if (position.publishedValue !== 3) state = dispatchCommand(state, { type: 'PUBLISH_PLATFORM', leverId: lever.id });
  }
  return state;
}
const position = process.argv.indexOf('--seeds');
const count = position < 0 ? 20 : Number(process.argv[position + 1]);
if (!Number.isInteger(count) || count < 1 || count > 10000) throw new Error('--seeds must be an integer in [1, 10000]');
const hashes: string[] = [], results: Record<string, number[]> = {};
let responsiveHousingRuns = 0;
for (let seed = 0; seed < count; seed++) {
  const firstMonth: Record<string, { potential: number; current: number }> = {};
  for (const strategy of strategies) {
    let state = createGame(seed), month = 0;
    assertState(state);
    while (state.status === 'active') {
      const monthly = isMonthlyTick(addDays(state.date, 7));
      if (monthly && strategy !== 'idle') state = publishBot(state, strategy === 'balanced' ? DOMAIN_IDS[month % DOMAIN_IDS.length]! : 'housing');
      const before = state.politics.analysis.currentSupport;
      state = dispatchCommand(state, { type: 'ADVANCE_WEEK' });
      if (monthly) {
        for (const id of Object.keys(before)) if (Math.abs(state.politics.analysis.currentSupport[id]! - before[id]!) > model.smoke.monthlySupportChangeCap) throw new Error(`Monthly support change at ${seed}/${strategy}/${id}`);
        if (month === 0) firstMonth[strategy] = { potential: state.politics.analysis.potentialSupport['player-preview']!, current: state.politics.analysis.currentSupport['player-preview']! };
        month++;
      }
      assertState(state);
    }
    const hash = stateHash(state);
    // The codec verifies command replay before accepting a restored save.
    if (state.tick !== 78 || state.date !== '2028-04-10' || stateHash(deserializeSave(serializeSave(state))) !== hash) throw new Error(`B2 replay/save regression at ${seed}/${strategy}`);
    hashes.push(hash);
    (results[strategy] ??= []).push(state.politics.analysis.currentSupport['player-preview']!);
  }
  const idle = firstMonth.idle!, housing = firstMonth['housing-focused']!;
  if (Math.abs(housing.potential - idle.potential) > Math.abs(housing.current - idle.current)) responsiveHousingRuns++;
  if (count >= 20 && (seed + 1) % 10 === 0) console.log(`Verified ${seed + 1}/${count} seeds × three strategies`);
}
if (responsiveHousingRuns !== count) throw new Error(`Housing publication response: ${responsiveHousingRuns}/${count}`);
console.log(JSON.stringify({ phase: 'B2', scope: 'national political chain; NOT district/election balance', seeds: count, strategies, advancesPerRun: 77, responsiveHousingRuns, passed: true,
  playerCurrentSupportRanges: Object.fromEntries(Object.entries(results).map(([id, values]) => [id, [Math.min(...values), Math.max(...values)]])), batchHash: stateHash(hashes) }, null, 2));
