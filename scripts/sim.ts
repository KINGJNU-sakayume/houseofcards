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
import { politicianModel as people } from '../src/data/seeds/politicians';
import { recruitmentInputs, recruitmentProbability, roleHolder } from '../src/engine/people/recruitment';
import { organizationModel as organization } from '../src/data/seeds/organization';
import { REGION_IDS } from '../src/data/reality/schema';
import { roundDiv } from '../src/engine/simulation/math';
import type { Politician } from '../src/types/people';
import type { CoreValue } from '../src/types/simulation';
const strategies = ['idle', 'balanced', 'housing-focused', 'regional', 'spender'] as const;
let refused = 0;
const refusals: Record<string, number> = {};
function attempt(state: GameState, command: Command): GameState {
  // Every reachable object is deeply frozen by the reducer. A thrown command
  // cannot mutate it; also assert that the log/resource references remain intact.
  const before = state, log = state.commandLog, resources = state.resources;
  try { return dispatchCommand(state, command); }
  catch (error) {
    if (!(error instanceof Error) || !/부족|이미 연구|맡고 있습니다|약속했습니다|이미 진행 중|이미 지역사무소/.test(error.message)) throw error;
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
  if (r.money < 0 || r.staffCapacity < 0 || r.staffCapacity > management.finance.baseStaffCapacity + Math.max(...management.staffLevels.map(s => s.capacity)) + 8 * organization.officeStaff || r.agendaSlots < 0 || r.agendaSlots > management.finance.agendaCap || f.arrears < 0 || f.ledger.length > 100) throw new Error('Invalid resources');
  if (r.money !== f.initialMoney + f.ledgerTruncatedSum + f.ledger.reduce((sum, e) => sum + e.amount, 0)) throw new Error('Ledger conservation failed');
  if (Object.values(state.regionalOrganization).reduce((sum, region) => sum + region.members, 0) !== f.members) throw new Error('Regional members do not sum');
  for (const region of Object.values(state.regionalOrganization)) if (region.level < 0 || region.level > 100 || new Set(region.investments.map(i => i.kind)).size !== region.investments.length) throw new Error('Organization invariant failed');
  const pool = state.politicians;
  if (pool.length > people.generator.cap || new Set(pool.map(p => p.name)).size !== pool.length || new Set(pool.map(p => p.id)).size !== pool.length ||
    (state.date >= people.generator.guaranteeBy && pool.length < people.generator.guaranteeCount)) throw new Error('Politician pool invariant failed');
  for (const role of ['policy_chair', 'secretary_general']) if (pool.filter(p => p.status === 'recruited' && p.role === role).length > 1) throw new Error('Role slot exceeded');
  if (pool.some(p => (p.status === 'recruited') !== (p.role !== null) || (p.status === 'declined') !== (p.cooldownUntil !== null) || p.trust < 0 || p.trust > 100)) throw new Error('Person status invariant failed');
  if (state.promises.some(pr => pool.find(p => p.id === pr.politicianId)?.status !== 'recruited') || state.recruitmentReputation! < people.recruitment.reputationFloor || state.recruitmentReputation! > 100) throw new Error('Promise/reputation invariant failed');
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
type Strategy = typeof strategies[number];
const VALUES: Record<Strategy, [CoreValue, CoreValue, CoreValue]> = { idle: ['housing', 'safety-net', 'science'], balanced: ['housing', 'safety-net', 'science'], 'housing-focused': ['housing', 'decentralization', 'safety-net'], regional: ['housing', 'safety-net', 'science'], spender: ['housing', 'safety-net', 'science'] };
const KINDS = ['member_drive', 'policy_forum', 'candidate_scouting', 'local_office'] as const;
function recruitBest(state: GameState, pick: (p: Politician) => number, filter: (p: Politician) => boolean = () => true): GameState {
  const best = state.politicians.filter(p => p.status === 'prospect' && filter(p)).sort((a, b) => pick(b) - pick(a) || (a.id < b.id ? -1 : 1))[0];
  if (!best) return state;
  const chair = !roleHolder(state, 'policy_chair');
  return attempt(state, { type: 'RECRUIT_POLITICIAN', politicianId: best.id, role: chair ? 'policy_chair' : 'member', promises: chair ? ['policy_chair'] : [] });
}
const match = (state: GameState) => (p: Politician) => recruitmentProbability(recruitmentInputs(state, p, 'member', []));
function play(state: GameState, strategy: Strategy, month: number, monthly: boolean): GameState {
  if (strategy === 'spender') {
    for (const person of state.politicians.filter(p => p.status === 'prospect')) state = attempt(state, { type: 'RECRUIT_POLITICIAN', politicianId: person.id, role: 'member', promises: [] });
    for (const regionId of REGION_IDS) for (const kind of KINDS) state = attempt(state, { type: 'INVEST_REGION', regionId, kind, intensity: kind === 'local_office' ? 1 : 3 });
    state = attempt(state, { type: 'SET_STAFF_LEVEL', level: 4 });
    state = publishBot(state, 'housing', true);
    for (const domain of DOMAIN_IDS) state = attempt(state, { type: 'START_POLICY_RESEARCH', domain });
    return attempt(state, { type: 'COMMISSION_INTERNAL_SURVEY' });
  }
  if (!monthly || strategy === 'idle') return state;
  const rotating = DOMAIN_IDS[month % DOMAIN_IDS.length]!;
  if (strategy === 'balanced') {
    state = publishBot(state, rotating);
    state = recruitBest(state, match(state));
    state = attempt(state, { type: 'INVEST_REGION', regionId: REGION_IDS[month % REGION_IDS.length]!, kind: month % 2 ? 'policy_forum' : 'member_drive', intensity: 1 });
  } else if (strategy === 'housing-focused') {
    state = publishBot(state, 'housing');
    state = recruitBest(state, p => p.policyExpertise.housing);
    state = attempt(state, { type: 'INVEST_REGION', regionId: month % 2 ? 'gyeonggi-incheon' : 'seoul', kind: 'policy_forum', intensity: 1 });
  } else {
    state = publishBot(state, rotating);
    state = recruitBest(state, match(state), p => p.regionId === 'pk');
    state = attempt(state, { type: 'INVEST_REGION', regionId: 'pk', kind: KINDS[month % KINDS.length]!, intensity: 1 });
  }
  if (month % 3 === 0) {
    state = attempt(state, { type: 'COMMISSION_INTERNAL_SURVEY' });
    state = attempt(state, { type: 'START_POLICY_RESEARCH', domain: strategy === 'housing-focused' ? 'housing' : DOMAIN_IDS[Math.floor(month / 3) % DOMAIN_IDS.length]! });
  }
  return state;
}
const hashes: string[] = [];
const metrics: Record<string, Record<string, number[]>> = {};
const record = (strategy: string, key: string, value: number) => ((metrics[strategy] ??= {})[key] ??= []).push(value);
for (let seed = 0; seed < count; seed++) {
  for (const strategy of strategies) {
    let state = dispatchCommand(createGame(seed), { type: 'CREATE_PARTY', name: '내일의 정당', shortName: '내일', color: management.palette[0]!, values: VALUES[strategy] }), month = 0;
    const refusedBefore = refused;
    assertState(state);
    if (strategy === 'balanced' || strategy === 'regional') state = attempt(state, { type: 'SET_STAFF_LEVEL', level: 1 });
    while (state.status === 'active') {
      const monthly = isMonthlyTick(addDays(state.date, 7));
      state = play(state, strategy, month, monthly);
      const before = state.politics.analysis.currentSupport;
      state = dispatchCommand(state, { type: 'ADVANCE_WEEK' });
      if (monthly) {
        for (const id of Object.keys(before)) if (Math.abs(state.politics.analysis.currentSupport[id]! - before[id]!) > model.smoke.monthlySupportChangeCap) throw new Error(`Monthly support change at ${seed}/${strategy}/${id}`);
        month++;
      }
      assertState(state);
    }
    const hash = stateHash(state);
    if (state.tick !== 78 || state.date !== '2028-04-10' || stateHash(deserializeSave(serializeSave(state))) !== hash) throw new Error(`C2 replay/save regression at ${seed}/${strategy}`);
    if (strategy === 'idle' && (state.finance!.arrears !== 0 || state.resources!.money <= 0)) throw new Error('Idle insolvency');
    if (strategy === 'spender' && refused === refusedBefore) throw new Error('Stress constraints never bound');
    if (state.politicians.length < people.generator.guaranteeCount) throw new Error('Pool guarantee failed');
    const player = state.politics.parties.find(p => p.partyId === 'player')!;
    hashes.push(hash);
    record(strategy, 'currentSupport', state.politics.analysis.currentSupport.player!);
    record(strategy, 'awareness', roundDiv(state.cohorts.reduce((sum, c) => sum + c.weight * state.politics.perceptions[c.id]!.player!.awareness, 0), SCALE));
    for (const domain of DOMAIN_IDS) record(strategy, `ownership:${domain}`, player.ownership[domain]);
    record(strategy, 'recruits', state.politicians.filter(p => p.status === 'recruited').length);
    record(strategy, 'generated', state.politicians.length);
    record(strategy, 'money', state.resources!.money);
    record(strategy, 'arrears', state.finance!.arrears > 0 ? 1 : 0);
    record(strategy, 'meanRegionLevel', roundDiv(Object.values(state.regionalOrganization).reduce((sum, r) => sum + r.level, 0), 8));
  }
  if (count >= 20 && (seed + 1) % 5 === 0) console.log(`Verified ${seed + 1}/${count} seeds × five C2 strategies`);
}
// Reporting only (not an outcome path): floats are fine here.
const sd = (values: number[]) => { const m = values.reduce((a, b) => a + b, 0) / values.length; return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length); };
const supportBy = (strategy: string) => metrics[strategy]!.currentSupport!;
const withinStrategy = strategies.reduce((sum, st) => sum + sd(supportBy(st)), 0) / strategies.length;
const acrossStrategies = Array.from({ length: count }, (_, seed) => sd(strategies.map(st => supportBy(st)[seed]!))).reduce((a, b) => a + b, 0) / count;
const ranges = Object.fromEntries(strategies.map(st => [st, Object.fromEntries(Object.entries(metrics[st]!).map(([key, values]) => [key, key === 'arrears' ? values.reduce((a, b) => a + b, 0) : [Math.min(...values), Math.max(...values)]]))]));
console.log(JSON.stringify({ phase: 'C2', scope: 'national chain, resources, people and organization; development-seed model outputs, NOT election balance or prediction', seeds: count, strategies, advancesPerRun: 77, passed: true, refusedCommands: refused, refusals,
  ranges, supportSpreadQ6: { sameStrategyAcrossSeeds: Math.round(withinStrategy), sameSeedAcrossStrategies: Math.round(acrossStrategies) }, batchHash: stateHash(hashes) }, null, 2));
