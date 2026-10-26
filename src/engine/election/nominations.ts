import { nominationModel as nm } from '../../data/seeds/nomination';
import { districtPack, type District } from '../../data/reality/districts';
import { REGION_LABELS } from '../../data/content/labels';
import type { Command, DistrictNomination, GameEvent, GameState, NominationMethod, Nominations } from '../../types/game';
import type { Politician } from '../../types/people';
import type { Resources } from '../../types/party';
import { postMessage, recordMoney, shortage, spend } from '../parties/management';
import { breakPromise, keepPromise } from '../people/recruitment';
import { deriveStream, randomInt, streamKey } from '../simulation/rng';
import { fixedMultiply, roundDiv, SCALE } from '../simulation/math';
import { clearDistrict } from './finalPush';

// D3 nominations and list (Slice §6, §17, §20.4, §26). Pure; every command is
// atomic: a refusal throws before any state changes.
export const NOMINATION_STREAM = 'primary';
export const METHOD_LABELS: Record<NominationMethod, string> = { primary: '경선', strategic: '전략공천' };
export const emptyNominations = (): Nominations => ({ targets: [], districts: {}, list: [], primaryParticipants: [], registeredAt: null });
const won = (krw: number) => roundDiv(krw, 10000); // Money is held in 만원
export const districtDeposit = (state: GameState) => won(state.electionRuleset.currentLaw.deposit.perDistrictCandidateKrw);
export const listDeposit = (state: GameState) => won(state.electionRuleset.currentLaw.deposit.perListCandidateKrw);
const districtById = (id: string): District | undefined => districtPack.districts.find(d => d.id === id);

export type Stage = 'closed' | 'targets' | 'nominations' | 'list' | 'registered';
// The latest unlocked stage on this date (Slice §6).
export function nominationStage(state: GameState): Stage {
  if (state.nominations.registeredAt) return 'registered';
  const g = nm.gates;
  return state.date >= g.list ? 'list' : state.date >= g.nominations ? 'nominations' : state.date >= g.targets ? 'targets' : 'closed';
}
const atLeast = (state: GameState, stage: 'targets' | 'nominations' | 'list') => {
  const order: Stage[] = ['closed', 'targets', 'nominations', 'list'];
  const now = nominationStage(state);
  return now !== 'registered' && order.indexOf(now) >= order.indexOf(stage);
};
const gateRefusal = (state: GameState, stage: 'targets' | 'nominations' | 'list') => {
  if (state.nominations.registeredAt) return `후보 등록이 ${state.nominations.registeredAt}에 마감되었습니다.`;
  return atLeast(state, stage) ? null : `${nm.gates[stage]}부터 할 수 있습니다.`;
};

// Where a recruited person currently stands; no dual candidacy (§52③ when the law forbids it).
export function candidacyOf(state: GameState, personId: string): { kind: 'district'; districtId: string } | { kind: 'list'; position: number } | null {
  for (const [districtId, n] of Object.entries(state.nominations.districts)) if (n.politicianId === personId) return { kind: 'district', districtId };
  const position = state.nominations.list.indexOf(personId);
  return position >= 0 ? { kind: 'list', position: position + 1 } : null;
}
// Primary score in Q6 before noise: Slice §26 comparison factors held by the person.
export function primaryScore(person: Politician, district: District): number {
  const w = nm.primary.weights, a = person.attributes;
  const local = person.regionId === district.regionId ? a.localBase : 0;
  return roundDiv(local * w.localBase + a.recognition * w.recognition + a.campaigning * w.campaigning + a.broadAppeal * w.broadAppeal + a.negotiation * w.negotiation, 100);
}
// Candidate quality in Q6; LocalBase counts only in the person's home region.
export function candidateQuality(person: Politician, district: District): number {
  const w = nm.candidate.quality, a = person.attributes;
  const local = person.regionId === district.regionId ? a.localBase : 0;
  return roundDiv(local * w.localBase + a.campaigning * w.campaigning + a.broadAppeal * w.broadAppeal, 100);
}
// List readiness (E2 warning): recruits not standing in a district, and how many
// people and women a minimum-size list needs (women at odd positions).
export function listReadiness(state: GameState) {
  const min = state.electionRuleset.listSizeUi.min;
  const free = state.politicians.filter(p => p.status === 'recruited' && candidacyOf(state, p.id)?.kind !== 'district');
  const women = free.filter(p => p.gender === 'female').length;
  const womenNeeded = Math.ceil(min / 2);
  return { min, available: free.length, women, womenNeeded, ready: free.length >= min && women >= womenNeeded };
}
export function primaryCost(): Partial<Resources> { return { money: nm.primary.money, staffCapacity: nm.primary.staffCapacity }; }
export function strategicCost(): Partial<Resources> { return { staffCapacity: nm.strategic.staffCapacity }; }

export function targetRefusal(state: GameState, districtId: string, targeted: boolean): string | null {
  const gate = gateRefusal(state, 'targets'); if (gate) return gate;
  const d = districtById(districtId);
  if (!d) return '지역구를 찾을 수 없습니다.';
  if (!d.active) return '주요 지역구 30곳만 집중 지역으로 정할 수 있습니다.';
  const has = state.nominations.targets.includes(districtId);
  if (targeted && !has && state.nominations.targets.length >= nm.targets.max) return `집중 지역은 최대 ${nm.targets.max}곳입니다.`;
  if (!targeted && state.nominations.districts[districtId]) return '공천한 지역구는 먼저 공천을 철회해야 집중 지역에서 뺄 수 있습니다.';
  return null;
}
export function nominationRefusal(state: GameState, districtId: string, method: NominationMethod | 'none', candidateIds: readonly string[]): string | null {
  const gate = gateRefusal(state, 'nominations'); if (gate) return gate;
  const d = districtById(districtId);
  if (!d) return '지역구를 찾을 수 없습니다.';
  if (!state.nominations.targets.includes(districtId)) return '집중 지역으로 정한 Active 지역구에만 공천할 수 있습니다.';
  const current = state.nominations.districts[districtId];
  if (method === 'none') return current ? (candidateIds.length ? '후보 없음은 후보를 지정하지 않습니다.' : null) : '이 지역구에는 공천한 후보가 없습니다.';
  if (current) return '이미 공천한 지역구입니다. 먼저 공천을 철회하세요.';
  if (!Array.isArray(candidateIds) || new Set(candidateIds).size !== candidateIds.length) return '후보를 한 번씩만 지정하세요.';
  if (method === 'strategic' && candidateIds.length !== 1) return '전략공천은 후보 1명을 지정합니다.';
  if (method === 'primary' && (candidateIds.length < nm.primary.minCandidates || candidateIds.length > nm.primary.maxCandidates)) return `경선은 ${nm.primary.minCandidates}~${nm.primary.maxCandidates}명이 참여합니다.`;
  if (method !== 'primary' && method !== 'strategic') return '공천 방식을 선택하세요.';
  for (const id of candidateIds) {
    const person = state.politicians.find(p => p.id === id);
    if (!person || person.status !== 'recruited') return '영입한 인재만 공천할 수 있습니다.';
    const where = candidacyOf(state, id);
    if (where) return `${person.name}은(는) 이미 ${where.kind === 'district' ? '다른 지역구 후보' : '비례대표 명부'}입니다 (중복입후보 불가).`;
  }
  return shortage(state, { ...(method === 'primary' ? primaryCost() : strategicCost()), money: (method === 'primary' ? nm.primary.money : 0) + districtDeposit(state) });
}
export function listRefusal(state: GameState, ids: readonly string[]): string | null {
  const gate = gateRefusal(state, 'list'); if (gate) return gate;
  const law = state.electionRuleset.currentLaw, size = state.electionRuleset.listSizeUi;
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length) return '명부에는 한 사람을 한 번만 올릴 수 있습니다.';
  if (ids.length && (ids.length < size.min || ids.length > size.max)) return `비례대표 명부는 ${size.min}~${size.max}명입니다 (비우려면 0명).`;
  const people: Politician[] = [];
  for (const id of ids) {
    const person = state.politicians.find(p => p.id === id);
    if (!person || person.status !== 'recruited') return '영입한 인재만 명부에 올릴 수 있습니다.';
    const where = candidacyOf(state, id);
    if (!law.dualCandidacy && where?.kind === 'district') return `${person.name}은(는) 지역구 후보입니다 (중복입후보 불가).`;
    people.push(person);
  }
  if (law.listGenderRule === 'odd_positions_female' && people.some((p, i) => i % 2 === 0 && p.gender !== 'female')) return '홀수 순위(1·3·5…)에는 여성 후보를 두어야 합니다 (공직선거법 §47③).';
  if (people.length && people.filter(p => p.gender === 'female').length * SCALE < law.listFemaleShareAtLeast * people.length) return `명부의 ${law.listFemaleShareAtLeast / 10000}% 이상을 여성으로 해야 합니다 (공직선거법 §47③).`;
  const extra = (ids.length - state.nominations.list.length) * listDeposit(state);
  return extra > 0 ? shortage(state, { money: extra }) : null;
}

const event = (state: GameState, type: GameEvent['type'], detail: string): GameState =>
  ({ ...state, events: [...state.events, { id: `event-${state.events.length}`, date: state.date, type, detail }] });
const setNominations = (state: GameState, change: (n: Nominations) => Nominations): GameState => ({ ...state, nominations: change(state.nominations) });
const adjustTrust = (state: GameState, id: string, delta: number): GameState =>
  ({ ...state, politicians: state.politicians.map(p => p.id === id ? { ...p, trust: Math.max(0, Math.min(100, p.trust + delta)) } : p) });
const adjustOrganization = (state: GameState, regionId: string, delta: number): GameState => {
  const r = state.regionalOrganization[regionId]!;
  return { ...state, regionalOrganization: { ...state.regionalOrganization, [regionId]: { ...r, level: Math.max(0, Math.min(100, r.level + delta)), lastActivity: state.date } } };
};

// Primary: score + bounded noise from a named stream; ties by id.
function runPrimary(state: GameState, district: District, ids: readonly string[]): { state: GameState; winner: string } {
  const key = streamKey(NOMINATION_STREAM, state.date);
  let rng = state.rngState[key] ?? deriveStream(state.seed, NOMINATION_STREAM, state.date);
  const scored = [...ids].sort().map(id => {
    const draw = randomInt(rng, 2 * nm.primary.noise + 1); rng = draw.state;
    return { id, score: primaryScore(state.politicians.find(p => p.id === id)!, district) + draw.value - nm.primary.noise };
  }).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  return { state: { ...state, rngState: { ...state.rngState, [key]: rng } }, winner: scored[0]!.id };
}

export function nominationCommand(state: GameState, command: Command): { state: GameState; event: GameEvent['type']; detail: string } | null {
  if (command.type === 'SET_TARGET_DISTRICT') {
    const reason = targetRefusal(state, command.districtId, command.targeted);
    if (reason) throw new Error(reason);
    const targets = state.nominations.targets.filter(id => id !== command.districtId);
    if (command.targeted) targets.push(command.districtId);
    if (targets.length === state.nominations.targets.length && command.targeted === state.nominations.targets.includes(command.districtId)) return { state, event: 'TARGET_SET', detail: command.districtId };
    return { state: setNominations(state, n => ({ ...n, targets: targets.sort() })), event: 'TARGET_SET', detail: `${command.districtId}:${command.targeted ? 'on' : 'off'}` };
  }
  if (command.type === 'NOMINATE_DISTRICT') {
    const reason = nominationRefusal(state, command.districtId, command.method, command.candidateIds);
    if (reason) throw new Error(reason);
    const district = districtById(command.districtId)!;
    if (command.method === 'none') {
      const current = state.nominations.districts[command.districtId]!;
      const rest = Object.fromEntries(Object.entries(state.nominations.districts).filter(([id]) => id !== command.districtId));
      let next = recordMoney(clearDistrict(setNominations(state, n => ({ ...n, districts: rest })), command.districtId), 'deposit', districtDeposit(state), `${command.districtId}:refund`);
      next = postMessage(next, `${district.name} 공천을 철회했습니다`, `${state.politicians.find(p => p.id === current.politicianId)!.name}의 기탁금이 반환되었습니다. 이 지역구에는 우리 정당 후보가 없습니다.`, 'Report');
      return { state: next, event: 'NOMINATION_WITHDRAWN', detail: command.districtId };
    }
    let next = state, winner: string, participants: string[] = [];
    if (command.method === 'primary') {
      next = spend(next, primaryCost(), 'nomination', `${command.districtId}:primary`);
      const result = runPrimary(next, district, command.candidateIds);
      next = result.state; winner = result.winner; participants = [...command.candidateIds].sort();
      for (const id of participants) next = adjustTrust(next, id, nm.primary.participantTrust + (id === winner ? nm.primary.winnerTrust : 0));
      next = adjustOrganization(next, district.regionId, nm.primary.organizationLevel);
      next = setNominations(next, n => ({ ...n, primaryParticipants: [...new Set([...n.primaryParticipants, ...participants])].sort() }));
      next = event(next, 'PRIMARY_HELD', `${command.districtId}:${participants.join('|')}`);
    } else {
      next = spend(next, strategicCost(), 'nomination', `${command.districtId}:strategic`);
      winner = command.candidateIds[0]!;
      // Passed-over recruits from the district's region resent it; the nominee's Negotiation softens that.
      const nominee = state.politicians.find(p => p.id === winner)!;
      const loss = roundDiv(nm.strategic.passedOverTrust * (SCALE - fixedMultiply(nominee.attributes.negotiation * 10000, nm.strategic.negotiationSoftening)), SCALE);
      const passedOver = state.politicians.filter(p => p.status === 'recruited' && p.id !== winner && p.regionId === district.regionId && !candidacyOf(state, p.id)).map(p => p.id).sort();
      for (const id of passedOver) next = adjustTrust(next, id, -loss);
      if (passedOver.length) next = adjustOrganization(next, district.regionId, -nm.strategic.organizationLevel);
    }
    next = spend(next, { money: districtDeposit(state) }, 'deposit', command.districtId);
    const nomination: DistrictNomination = { politicianId: winner, method: command.method, participants, nominatedAt: state.date };
    next = setNominations(next, n => ({ ...n, districts: Object.fromEntries(Object.entries({ ...n.districts, [command.districtId]: nomination }).sort(([a], [b]) => a < b ? -1 : 1)) }));
    const person = state.politicians.find(p => p.id === winner)!;
    next = postMessage(next, `${district.name} 후보: ${person.name}`, `${METHOD_LABELS[command.method]}으로 공천했습니다${participants.length > 1 ? ` (경선 참여 ${participants.length}명)` : ''}. 기탁금 ${districtDeposit(state)}만원을 냈으며 등록 마감(${nm.gates.registration}) 전에 철회하면 돌려받습니다. 가상 인물입니다.`, 'Important');
    return { state: next, event: 'NOMINATED', detail: `${command.districtId}:${winner}` };
  }
  if (command.type === 'SET_LIST') {
    const reason = listRefusal(state, command.politicianIds);
    if (reason) throw new Error(reason);
    const delta = (command.politicianIds.length - state.nominations.list.length) * listDeposit(state);
    let next = setNominations(state, n => ({ ...n, list: [...command.politicianIds] }));
    if (delta) next = recordMoney(next, 'deposit', -delta, `list:${command.politicianIds.length}`);
    return { state: next, event: 'LIST_SET', detail: String(command.politicianIds.length) };
  }
  return null;
}

// Weekly: unlock notices and, on the registration date, close registration and
// resolve the Phase C nomination promises.
export function weeklyNominations(state: GameState): GameState {
  if (!state.playerParty) return state;
  const g = nm.gates;
  let next = state;
  if (state.date === g.targets) next = postMessage(next, '선거 준비 1단계: 집중 지역 선택', `주요 지역구 30곳 가운데 최대 ${nm.targets.max}곳을 집중 지역으로 정할 수 있습니다. 공천은 ${g.nominations}부터, 비례명부는 ${g.list}부터입니다.`, 'Action Required');
  if (state.date === g.nominations) next = postMessage(next, '선거 준비 2단계: 공천', `집중 지역에 경선(${nm.primary.minCandidates}~${nm.primary.maxCandidates}명) 또는 전략공천으로 후보를 정할 수 있습니다. 후보를 내지 않은 지역구에는 우리 정당 후보가 없습니다. 등록 마감 ${g.registration}.`, 'Action Required');
  if (state.date === g.list) next = postMessage(next, '선거 준비 3단계: 비례대표 명부', `${state.electionRuleset.listSizeUi.min}~${state.electionRuleset.listSizeUi.max}명. 홀수 순위 여성, 여성 50% 이상(공직선거법 §47③), 지역구와 중복입후보 불가(§52③).`, 'Action Required');
  if (state.date === g.registration && !state.nominations.registeredAt) {
    next = setNominations(next, n => ({ ...n, registeredAt: state.date }));
    for (const promise of next.promises) {
      if (promise.status !== 'pending' || promise.due !== 'NOMINATION') continue;
      const person = next.politicians.find(p => p.id === promise.politicianId)!;
      const where = candidacyOf(next, person.id);
      const kept = promise.type === 'primary_guarantee' ? next.nominations.primaryParticipants.includes(person.id)
        : where?.kind === 'district' && districtById(where.districtId)!.regionId === person.regionId;
      next = kept ? keepPromise(next, promise) : breakPromise(next, promise, promise.type === 'primary_guarantee' ? '경선 없이 등록이 마감되어 깨졌습니다' : `${REGION_LABELS[person.regionId]} 지역구 공천 없이 등록이 마감되어 깨졌습니다`);
    }
    const n = next.nominations;
    next = postMessage(next, '후보 등록 마감', `지역구 후보 ${Object.keys(n.districts).length}명, 비례대표 명부 ${n.list.length}명으로 등록을 마쳤습니다. 이후 공천과 명부는 바꿀 수 없습니다. 선거는 마지막 주(2028-04-10) 진행 시 2028-04-12 기준으로 계산됩니다.`, 'Important');
    next = event(next, 'REGISTRATION_CLOSED', `${Object.keys(n.districts).length}|${n.list.length}`);
  }
  return next;
}
