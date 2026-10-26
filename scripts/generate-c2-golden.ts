// Run deliberately after reviewing model changes; never called by tests/CI. C1 version: generate-c1-golden.ts (historical).
import { existsSync, writeFileSync } from 'node:fs';
import { createGame, dispatchCommand, replay } from '../src/engine/simulation/engine';
import { stateHash } from '../src/engine/simulation/determinism';
import { partyManagement } from '../src/data/seeds/party-management';
import { politicianModel } from '../src/data/seeds/politicians';
import { organizationModel } from '../src/data/seeds/organization';
import { rulesets } from '../src/data/rulesets';
import { politicalModel } from '../src/data/seeds/political-model';
import { nominationModel } from '../src/data/seeds/nomination';
import { districtPack } from '../src/data/reality/districts';
import { electionModel } from '../src/data/seeds/election';
import type { Command } from '../src/types/game';
const path = 'tests/fixtures/c2-golden.json';
if (existsSync(path)) throw new Error('C2 fixture already exists. Review and remove it explicitly before regeneration.');
const seed = 42;
const founding: Command = { type: 'CREATE_PARTY', name: '내일의 정당', shortName: '내일', color: partyManagement.palette[0]!, values: ['housing', 'safety-net', 'science'] };
const commands: Command[] = [founding, { type: 'SET_PLATFORM_DRAFT', leverId: 'housing.rent-support', value: 4 }, { type: 'PUBLISH_PLATFORM', leverId: 'housing.rent-support' },
  { type: 'COMMISSION_INTERNAL_SURVEY' }, { type: 'START_POLICY_RESEARCH', domain: 'housing' }, { type: 'SET_STAFF_LEVEL', level: 1 },
  ...Array.from({ length: 4 }, (): Command => ({ type: 'ADVANCE_WEEK' })),
  { type: 'SET_PLATFORM_DRAFT', leverId: 'housing.rent-support', value: 0 }, { type: 'PUBLISH_PLATFORM', leverId: 'housing.rent-support' }, { type: 'COMMISSION_INTERNAL_SURVEY' },
  ...Array.from({ length: 2 }, (): Command => ({ type: 'ADVANCE_WEEK' })),
  { type: 'RECRUIT_POLITICIAN', politicianId: 'pol-001', role: 'member', promises: ['primary_guarantee'] }, { type: 'INVEST_REGION', regionId: 'seoul', kind: 'policy_forum', intensity: 1 }];
// D3: the management sequence continued to the nomination stage, real recruitment attempts until someone is recruited, one target and a strategic nomination.
let managed = replay(seed, commands);
const nominationCommands: Command[] = [...commands];
while (managed.date < nominationModel.gates.nominations) { nominationCommands.push({ type: 'ADVANCE_WEEK' }); managed = dispatchCommand(managed, { type: 'ADVANCE_WEEK' }); }
const target = districtPack.districts.find(d => d.active)!.id;
for (const p of managed.politicians.filter(x => x.status === 'prospect')) {
  if (managed.politicians.some(x => x.status === 'recruited')) break;
  const attempt: Command = { type: 'RECRUIT_POLITICIAN', politicianId: p.id, role: 'member', promises: ['primary_guarantee', 'regional_priority'] };
  try { managed = dispatchCommand(managed, attempt); nominationCommands.push(attempt); } catch { /* refused: not recorded */ }
}
const nominee = managed.politicians.find(x => x.status === 'recruited')!.id;
nominationCommands.push({ type: 'SET_TARGET_DISTRICT', districtId: target, targeted: true }, { type: 'NOMINATE_DISTRICT', districtId: target, method: 'strategic', candidateIds: [nominee] });
// D4: the nomination sequence continued through the Final Push (message and campaign) to the election.
let pushed = replay(seed, nominationCommands);
const electionCommands: Command[] = [...nominationCommands];
const step = (c: Command) => { electionCommands.push(c); pushed = dispatchCommand(pushed, c); };
while (pushed.date < electionModel.finalPush.start) step({ type: 'ADVANCE_WEEK' });
step({ type: 'SET_MESSAGES', national: 'housing', secondary: [] }); step({ type: 'SET_CAMPAIGN', districtId: target, intensity: 2 });
while (pushed.status === 'active') step({ type: 'ADVANCE_WEEK' });
if (!pushed.election) throw new Error('election missing');
const initial = createGame(seed), founded = dispatchCommand(initial, founding);
let end = founded; for (let i = 0; i < 77; i++) end = dispatchCommand(end, { type: 'ADVANCE_WEEK' });
const fixture = { schemaVersion: 4, phase: 'C2', step: 'E3', modelVersion: partyManagement.modelVersion, nominationModelVersion: nominationModel.modelVersion, electionModelVersion: electionModel.modelVersion, peopleModelVersion: politicianModel.modelVersion, organizationModelVersion: organizationModel.modelVersion, rulesetsVersion: rulesets.modelVersion, rulesetId: rulesets.defaultRulesetId, politicalModelVersion: politicalModel.modelVersion, seed,
  initialHash: stateHash(initial), foundedHash: stateHash(founded), seasonEndHash: stateHash(end), managementHash: stateHash(replay(seed, commands)), nominationHash: stateHash(replay(seed, nominationCommands)), electionHash: stateHash(pushed), electionSeats: pushed.election.totalSeats, commands, nominationCommands, electionCommands };
writeFileSync(path, JSON.stringify(fixture, null, 2) + '\n');
console.log(JSON.stringify(fixture, null, 2));
