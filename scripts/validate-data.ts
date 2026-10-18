import { realityPack, seedPack } from '../src/data/reality';
import { validateData } from '../src/data/reality/validate';

const report = validateData(realityPack, seedPack, process.argv.includes('--release'));
for (const warning of report.warnings) console.warn(`WARNING: ${warning}`);
for (const error of report.errors) console.error(`ERROR: ${error}`);
if (report.errors.length) process.exitCode = 1;
else console.log('Data validation passed (Phase A foundation pack; not a complete reality baseline).');
