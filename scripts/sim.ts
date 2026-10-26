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
import { districtPack } from '../src/data/reality/districts';
import { electionModel } from '../src/data/seeds/election';
import { nominationModel } from '../src/data/seeds/nomination';
import { candidacyOf, candidateQuality, nominationStage } from '../src/engine/election/nominations';
import { PLAYER_PARTY_ID } from '../src/types/party';
const strategies = ['idle', 'balanced', 'housing-focused', 'regional', 'spender', 'ai-only'] as const;
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
const VALUES: Record<Strategy, [CoreValue, CoreValue, CoreValue]> = { idle: ['housing', 'safety-net', 'science'], balanced: ['housing', 'safety-net', 'science'], 'housing-focused': ['housing', 'decentralization', 'safety-net'], regional: ['housing', 'safety-net', 'science'], spender: ['housing', 'safety-net', 'science'], 'ai-only': ['reform', 'safety-net', 'market'] };
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
  // Slice §30 AI-only: the player's seat is run by a plain balanced-platform bot (no investments, research or surveys).
  if (strategy === 'ai-only') return recruitBest(publishBot(state, rotating), match(state));
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
// Women at odd positions; once men run out the remaining places go to women. Empty if fewer than the minimum.
function pickList(state: GameState, people: readonly Politician[]): string[] {
  const women = people.filter(p => p.gender === 'female'), men = people.filter(p => p.gender === 'male');
  const size = Math.min(state.electionRuleset.listSizeUi.max, women.length + Math.min(men.length, women.length));
  if (size < state.electionRuleset.listSizeUi.min) return [];
  const list: string[] = [];
  for (let i = 0, w = 0, m = 0; i < size; i++) list.push(i % 2 === 0 || m >= men.length ? women[w++]!.id : men[m++]!.id);
  return list;
}
// D3/D4 electoral play for every non-idle bot (E2: the list comes first, user decision 2026-10-26):
// recruit one more person a week in the year before the list gate (women first while short of the list rule),
// reserve a 10–15 list, nominate the remaining recruits in targeted Active districts, campaign in the Final Push.
function electoralPlay(state: GameState, strategy: Strategy): GameState {
  if (strategy === 'idle') return state;
  const stage = nominationStage(state), n = state.nominations;
  const free = () => state.politicians.filter(p => p.status === 'recruited' && !candidacyOf(state, p.id)).sort((a, b) => a.id < b.id ? -1 : 1);
  if (state.date >= '2027-01-04' && state.date < nominationModel.gates.list) {
    const women = state.politicians.filter(p => p.status === 'recruited' && p.gender === 'female').length;
    const prospects = state.politicians.filter(p => p.status === 'prospect').sort((a, b) => (women < 8 ? Number(b.gender === 'female') - Number(a.gender === 'female') : 0) || match(state)(b) - match(state)(a) || (a.id < b.id ? -1 : 1));
    if (prospects[0]) state = attempt(state, { type: 'RECRUIT_POLITICIAN', politicianId: prospects[0].id, role: 'member', promises: [] });
  }
  if (stage === 'closed' || stage === 'registered' && state.date < electionModel.finalPush.start) return state;
  const active = districtPack.districts.filter(d => d.active);
  const recruitRegions = new Set(state.politicians.filter(p => p.status === 'recruited').map(p => p.regionId));
  if (stage !== 'registered' && n.targets.length < 10) {
    const preferred = active.filter(d => strategy === 'regional' ? d.regionId === 'pk' : recruitRegions.has(d.regionId));
    for (const d of [...preferred, ...active].slice(0, 30)) if (state.nominations.targets.length < 10) state = attempt(state, { type: 'SET_TARGET_DISTRICT', districtId: d.id, targeted: true });
  }
  if (stage === 'list' && !state.nominations.list.length) {
    const list = pickList(state, free());
    if (list.length) state = attempt(state, { type: 'SET_LIST', politicianIds: list });
  }
  if (stage === 'nominations' || stage === 'list') {
    const reserve = new Set(state.nominations.list.length ? [] : pickList(state, free()));
    for (const id of state.nominations.targets) {
      if (state.nominations.districts[id]) continue;
      const d = active.find(x => x.id === id)!;
      const best = free().filter(p => !reserve.has(p.id)).sort((a, b) => candidateQuality(b, d) - candidateQuality(a, d) || (a.id < b.id ? -1 : 1))[0];
      if (best) state = attempt(state, { type: 'NOMINATE_DISTRICT', districtId: id, method: 'strategic', candidateIds: [best.id] });
    }
  }
  if (state.date >= electionModel.finalPush.start && !state.election) {
    if (!state.finalPush.nationalMessage) state = attempt(state, { type: 'SET_MESSAGES', national: 'housing', secondary: [] });
    for (const id of Object.keys(state.nominations.districts)) if (!state.finalPush.campaign[id]) state = attempt(state, { type: 'SET_CAMPAIGN', districtId: id, intensity: 2 });
  }
  return state;
}
const hashes: string[] = [];
const elections: Record<string, { firstParty: Record<string, number>; majorityRuns: number; thirdPartySeats: number[]; playerBands: Record<string, number> }> = {};
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
      state = electoralPlay(play(state, strategy, month, monthly), strategy);
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
    if (!state.election) throw new Error(`No election result at ${seed}/${strategy}`);
    record(strategy, 'nominees', Object.keys(state.nominations.districts).length);
    record(strategy, 'listSize', state.nominations.list.length);
    record(strategy, 'seats', state.election.totalSeats[PLAYER_PARTY_ID] ?? 0);
    const listTotal = Object.values(state.election.listVotes).reduce((a, b) => a + b, 0);
    record(strategy, 'listVoteShareQ6', roundDiv((state.election.listVotes[PLAYER_PARTY_ID] ?? 0) * SCALE, listTotal));
    // Slice §30 election checks: integer seats summing to the ruleset house, first party, majority, third party.
    const e = state.election, house = state.electionRuleset.districtSeats + state.electionRuleset.listSeats;
    const seats = Object.values(e.totalSeats);
    if (seats.some(v => !Number.isSafeInteger(v) || v < 0) || seats.reduce((a, b) => a + b, 0) !== house) throw new Error(`Seat sum at ${seed}/${strategy}`);
    const ranked = Object.entries(e.totalSeats).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    const summary = elections[strategy] ??= { firstParty: {}, majorityRuns: 0, thirdPartySeats: [], playerBands: { '0-1': 0, '2-6': 0, '7-12': 0, '13+': 0 } };
    summary.firstParty[ranked[0]![0]] = (summary.firstParty[ranked[0]![0]] ?? 0) + 1;
    if (ranked[0]![1] > house / 2) summary.majorityRuns++;
    summary.thirdPartySeats.push(ranked[2]?.[1] ?? 0);
    const mine = e.totalSeats[PLAYER_PARTY_ID] ?? 0;
    summary.playerBands[mine <= 1 ? '0-1' : mine <= 6 ? '2-6' : mine <= 12 ? '7-12' : '13+']!++;
    record(strategy, 'generated', state.politicians.length);
    record(strategy, 'money', state.resources!.money);
    record(strategy, 'arrears', state.finance!.arrears > 0 ? 1 : 0);
    record(strategy, 'meanRegionLevel', roundDiv(Object.values(state.regionalOrganization).reduce((sum, r) => sum + r.level, 0), 8));
  }
  if (count >= 20 && (seed + 1) % 5 === 0) console.log(`Verified ${seed + 1}/${count} seeds × ${strategies.length} strategies`);
}
// Reporting only (not an outcome path): floats are fine here.
const sd = (values: number[]) => { const m = values.reduce((a, b) => a + b, 0) / values.length; return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length); };
const supportBy = (strategy: string) => metrics[strategy]!.currentSupport!;
const withinStrategy = strategies.reduce((sum, st) => sum + sd(supportBy(st)), 0) / strategies.length;
const acrossStrategies = Array.from({ length: count }, (_, seed) => sd(strategies.map(st => supportBy(st)[seed]!))).reduce((a, b) => a + b, 0) / count;
const ranges = Object.fromEntries(strategies.map(st => [st, Object.fromEntries(Object.entries(metrics[st]!).map(([key, values]) => [key, key === 'arrears' ? values.reduce((a, b) => a + b, 0) : [Math.min(...values), Math.max(...values)]]))]));
const firstParties: Record<string, number> = {};
for (const s of Object.values(elections)) for (const [id, n] of Object.entries(s.firstParty)) firstParties[id] = (firstParties[id] ?? 0) + n;
if (Object.keys(firstParties).length === 1) {
  const message = `First party is ${Object.keys(firstParties)[0]} in every run (Slice §30 asks for no 100% concentration)`;
  if (count >= 500) throw new Error(message); else console.warn(`WARNING: ${message}`);
}
const electionSummary = Object.fromEntries(Object.entries(elections).map(([st, s]) => [st, { firstParty: s.firstParty, majorityRuns: s.majorityRuns, thirdPartySeats: [Math.min(...s.thirdPartySeats), Math.max(...s.thirdPartySeats)], playerSeatBands: s.playerBands }]));
const seatSpread = { sameStrategyAcrossSeeds: Number((strategies.reduce((sum, st) => sum + sd(metrics[st]!.seats!), 0) / strategies.length).toFixed(3)),
  sameSeedAcrossStrategies: Number((Array.from({ length: count }, (_, seed) => sd(strategies.map(st => metrics[st]!.seats![seed]!))).reduce((a, b) => a + b, 0) / count).toFixed(3)) };
console.log(JSON.stringify({ phase: 'E2', electionSummary, seatSpread, scope: 'national chain, resources, people, organization, nominations and the scheduled election under simple bots; development-seed model outputs, NOT election balance or prediction', seeds: count, strategies, advancesPerRun: 77, passed: true, refusedCommands: refused, refusals,
  ranges, supportSpreadQ6: { sameStrategyAcrossSeeds: Math.round(withinStrategy), sameSeedAcrossStrategies: Math.round(acrossStrategies) }, batchHash: stateHash(hashes) }, null, 2));
