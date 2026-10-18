import { createGame, dispatchCommand } from '../src/engine/simulation/engine';
import { stateHash } from '../src/engine/simulation/determinism';
import { deserializeSave, serializeSave } from '../src/persistence/codec';
import { SCALE } from '../src/engine/simulation/math';
import { addDays, isMonthlyTick } from '../src/engine/calendar';
import { policyLevers } from '../src/data/reality';
import { politicalModel as model } from '../src/data/seeds/political-model';
import { partyManagement as management } from '../src/data/seeds/party-management';
import { DOMAIN_IDS } from '../src/types/simulation';
import type { Command, GameState } from '../src/types/game';
import { platformDiversity } from '../src/engine/parties/ai';
import { publicationCost, shortage } from '../src/engine/parties/management';
const strategies = ['idle', 'balanced', 'housing-focused', 'spender'] as const;
let refused = 0;
const refusals: Record<string, number> = {};
function attempt(state: GameState, command: Command): GameState {
  // Every reachable object is deeply frozen by the reducer. A thrown command
  // cannot mutate it; also assert that the log/resource references remain intact.
  const before = state, log = state.commandLog, resources = state.resources;
  try { return dispatchCommand(state, command); }
  catch (error) {
    if (!(error instanceof Error) || !/부족|이미 연구/.test(error.message)) throw error;
    if (state !== before || state.commandLog !== log || state.resources !== resources || !Object.isFrozen(state) || !Object.isFrozen(log) || !Object.isFrozen(resources)) throw new Error('Refused command mutated state');
    refused++; refusals[command.type] = (refusals[command.type] ?? 0) + 1;
    return state;
  }
}
function assertState(state: GameState) {
  const inspect = (value: unknown): void => {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('Non-integer or non-finite state');
    if (value && typeof value === 'object') for (const v of Object.values(value)) inspect(v);
  }; inspect(state);
  if (state.cohorts.length !== 96 || state.cohorts.reduce((s, c) => s + c.weight, 0) !== SCALE || state.cohorts.some(c => c.weight < 0)) throw new Error('Invalid cohorts');
  for (const issue of state.issues) for (const value of [issue.severity, issue.salience, ...Object.values(issue.drivers)]) if (value < 0 || value > 10000) throw new Error(`Invalid issue ${issue.id}`);
  const analysis = state.politics.analysis;
  if (analysis.playerPartyId !== 'player' || !analysis.barriers) throw new Error('Missing founded-party analysis');
  for (const vector of [analysis.currentSupport, analysis.potentialSupport, ...Object.values(analysis.byAge), ...Object.values(analysis.byRegion)]) {
    if (Object.values(vector).some(p => p < 0 || p > SCALE) || Object.values(vector).reduce((a, b) => a + b, 0) !== SCALE) throw new Error('Invalid choice probabilities');
  }
  for (const [id, share] of Object.entries(analysis.currentSupport)) if (share > model.smoke.maxPartySupport || (['dp', 'ppp'].includes(id) && share < model.smoke.minMajorSupport)) throw new Error(`Implausible support ${id}: ${share}`);
  if (platformDiversity(state.platforms) < model.ai.diversityFloor) throw new Error('AI platforms collapsed');
  for (const party of state.politics.parties) if (party.ai.changesThisMonth > model.ai.monthlyCap || party.ai.changesThisQuarter > model.ai.quarterlyCap) throw new Error('AI cap exceeded');
  const r = state.resources!, f = state.finance!;
  if (r.money < 0 || r.staffCapacity < 0 || r.staffCapacity > management.finance.baseStaffCapacity + Math.max(...management.staffLevels.map(s => s.capacity)) || r.agendaSlots < 0 || r.agendaSlots > management.finance.agendaCap || f.arrears < 0 || f.ledger.length > 100) throw new Error('Invalid resources');
  if (r.money !== f.initialMoney + f.ledgerTruncatedSum + f.ledger.reduce((sum, e) => sum + e.amount, 0)) throw new Error('Ledger conservation failed');
  if (Object.values(state.regionalOrganization).reduce((sum, region) => sum + region.members, 0) !== f.members) throw new Error('Regional members do not sum');
  if (state.internalSurveys.length > 12 || state.inbox.length > 60 || new Set(state.research.map(r => r.domain)).size !== state.research.length) throw new Error('Bounded storage failed');
}
function publishBot(state: GameState, domain: string, stress = false): GameState {
  for (const lever of policyLevers.filter(l => stress || l.domain === domain)) {
    const desired = stress ? (state.tick % 2 ? 4 : 0) : 3;
    const position = state.platforms.find(p => p.partyId === 'player')!.positions[lever.id]!;
    if (position.draftValue !== desired) state = dispatchCommand(state, { type: 'SET_PLATFORM_DRAFT', leverId: lever.id, value: desired });
    if (stress || !shortage(state, publicationCost(state, lever.id))) state = attempt(state, { type: 'PUBLISH_PLATFORM', leverId: lever.id });
  }
  return state;
}
const position = process.argv.indexOf('--seeds');
const count = position < 0 ? 20 : Number(process.argv[position + 1]);
if (!Number.isInteger(count) || count < 1 || count > 10000) throw new Error('--seeds must be an integer in [1, 10000]');
const hashes: string[] = [], results: Record<string, number[]> = {}, money: Record<string, number[]> = {};
for (let seed = 0; seed < count; seed++) {
  for (const strategy of strategies) {
    let state = dispatchCommand(createGame(seed), { type: 'CREATE_PARTY', name: '내일의 정당', shortName: '내일', color: management.palette[0]!, values: ['housing', 'safety-net', 'science'] }), month = 0;
    const refusedBefore = refused;
    assertState(state);
    if (strategy === 'balanced') state = attempt(state, { type: 'SET_STAFF_LEVEL', level: 1 });
    while (state.status === 'active') {
      const monthly = isMonthlyTick(addDays(state.date, 7));
      if (strategy === 'spender') {
        state = attempt(state, { type: 'SET_STAFF_LEVEL', level: 4 });
        state = publishBot(state, 'housing', true);
        for (const domain of DOMAIN_IDS) state = attempt(state, { type: 'START_POLICY_RESEARCH', domain });
        state = attempt(state, { type: 'COMMISSION_INTERNAL_SURVEY' });
      } else if (monthly && strategy !== 'idle') {
        state = publishBot(state, strategy === 'balanced' ? DOMAIN_IDS[month % DOMAIN_IDS.length]! : 'housing');
        if (month % 3 === 0) {
          state = attempt(state, { type: 'COMMISSION_INTERNAL_SURVEY' });
          state = attempt(state, { type: 'START_POLICY_RESEARCH', domain: strategy === 'balanced' ? DOMAIN_IDS[Math.floor(month / 3) % DOMAIN_IDS.length]! : 'housing' });
        }
      }
      const before = state.politics.analysis.currentSupport;
      state = dispatchCommand(state, { type: 'ADVANCE_WEEK' });
      if (monthly) {
        for (const id of Object.keys(before)) if (Math.abs(state.politics.analysis.currentSupport[id]! - before[id]!) > model.smoke.monthlySupportChangeCap) throw new Error(`Monthly support change at ${seed}/${strategy}/${id}`);
        month++;
      }
      assertState(state);
    }
    const hash = stateHash(state);
    if (state.tick !== 78 || state.date !== '2028-04-10' || stateHash(deserializeSave(serializeSave(state))) !== hash) throw new Error(`C1 replay/save regression at ${seed}/${strategy}`);
    if (strategy === 'idle' && (state.finance!.arrears !== 0 || state.resources!.money <= 0)) throw new Error('Idle insolvency');
    if (strategy === 'spender' && refused === refusedBefore) throw new Error('Stress constraints never bound');
    hashes.push(hash); (results[strategy] ??= []).push(state.politics.analysis.currentSupport.player!); (money[strategy] ??= []).push(state.resources!.money);
  }
  if (count >= 20 && (seed + 1) % 5 === 0) console.log(`Verified ${seed + 1}/${count} seeds × four C1 strategies`);
}
console.log(JSON.stringify({ phase: 'C1', scope: 'national chain and resources; NOT election balance or prediction', seeds: count, strategies, advancesPerRun: 77, passed: true, refusedCommands: refused, refusals,
  playerCurrentSupportRanges: Object.fromEntries(Object.entries(results).map(([id, values]) => [id, [Math.min(...values), Math.max(...values)]])),
  finalMoneyRanges: Object.fromEntries(Object.entries(money).map(([id, values]) => [id, [Math.min(...values), Math.max(...values)]])), batchHash: stateHash(hashes) }, null, 2));
