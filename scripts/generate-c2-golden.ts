// Run deliberately after reviewing model changes; never called by tests/CI. C1 version: generate-c1-golden.ts (historical).
import { existsSync, writeFileSync } from 'node:fs';
import { createGame, dispatchCommand, replay } from '../src/engine/simulation/engine';
import { stateHash } from '../src/engine/simulation/determinism';
import { partyManagement } from '../src/data/seeds/party-management';
import { politicianModel } from '../src/data/seeds/politicians';
import { organizationModel } from '../src/data/seeds/organization';
import { rulesets } from '../src/data/rulesets';
import { politicalModel } from '../src/data/seeds/political-model';
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
const initial = createGame(seed), founded = dispatchCommand(initial, founding);
let end = founded; for (let i = 0; i < 77; i++) end = dispatchCommand(end, { type: 'ADVANCE_WEEK' });
const fixture = { schemaVersion: 4, phase: 'C2', step: 'CAL', modelVersion: partyManagement.modelVersion, peopleModelVersion: politicianModel.modelVersion, organizationModelVersion: organizationModel.modelVersion, rulesetsVersion: rulesets.modelVersion, rulesetId: rulesets.defaultRulesetId, politicalModelVersion: politicalModel.modelVersion, seed,
  initialHash: stateHash(initial), foundedHash: stateHash(founded), seasonEndHash: stateHash(end), managementHash: stateHash(replay(seed, commands)), commands };
writeFileSync(path, JSON.stringify(fixture, null, 2) + '\n');
console.log(JSON.stringify(fixture, null, 2));
