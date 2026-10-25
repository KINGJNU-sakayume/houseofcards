import { partyManagement } from '../src/data/seeds/party-management';
import { politicianModel } from '../src/data/seeds/politicians';
import { validateRulesets } from '../src/data/rulesets/validate';
import rulesetData from '../src/data/rulesets/rulesets.json' with { type: 'json' };
import { realityPack, seedPack } from '../src/data/reality';
import { validateData } from '../src/data/reality/validate';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { forbiddenNamesIn } from '../src/validation/forbidden-names';

const report = validateData(realityPack, seedPack, process.argv.includes('--release'));
function scanData(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) scanData(path);
    else for (const name of forbiddenNamesIn(readFileSync(path, 'utf8'))) report.errors.push(`${path}: forbidden poll/media name ${name}`);
  }
}
scanData('src/data');
report.errors.push(...validateRulesets(rulesetData, JSON.parse(readFileSync('docs/data/law-review-phase-d.json', 'utf8'))));
for (const name of forbiddenNamesIn(readFileSync('src/validation/real-name-denylist.json', 'utf8'))) report.errors.push(`real-name-denylist: forbidden poll/media name ${name}`);
for (const warning of report.warnings) console.warn(`WARNING: ${warning}`);
for (const error of report.errors) console.error(`ERROR: ${error}`);
if (report.errors.length) process.exitCode = 1;
else console.log(`Data validation passed (D1 / ${partyManagement.modelVersion} / people ${politicianModel.modelVersion} / rulesets D1.0 vs law review; strict release rules retained).`);
