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
for (const warning of report.warnings) console.warn(`WARNING: ${warning}`);
for (const error of report.errors) console.error(`ERROR: ${error}`);
if (report.errors.length) process.exitCode = 1;
else console.log('Data validation passed (B1 foundations; inspect UNVERIFIED warnings before release).');
