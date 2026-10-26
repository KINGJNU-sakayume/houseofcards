// CAL: deterministic offline coefficient search (ROADMAP §4). Run deliberately:
//   node --import tsx scripts/calibrate.ts [--write]
// Without --write it only reports. Targets and tolerance are never changed.
import { readFileSync, writeFileSync } from 'node:fs';
import { createGame, type CalibrationOverride } from '../src/engine/simulation/engine';
import { realityPack, seedPack } from '../src/data/reality';
import { politicalModel } from '../src/data/seeds/political-model';
import { partyShareExcludingNone } from '../src/engine/voters/calibration';
import type { SeedPack } from '../src/data/reality/schema';

const tunables = JSON.parse(readFileSync('scripts/calibration-tunables.json', 'utf8'));
const train: number[] = tunables.objective.trainingSeeds;
const heldOut = Array.from({ length: 20 }, (_, i) => i + 5);
const targets = (realityPack.calibrationTargets ?? []).filter(r => r.target.status === 'REAL_FACT' && typeof r.target.value === 'number')
  .map(r => ({ id: r.target.id, region: r.regionId, party: r.partyId, value: r.target.value as number }));
type Parties = typeof politicalModel.parties;
interface Params { seeds: SeedPack; parties: Parties }
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
function simulate(p: Params, seed: number) {
  const a = createGame(seed, undefined, { seeds: p.seeds, parties: p.parties } as CalibrationOverride).politics.analysis;
  return targets.map(t => partyShareExcludingNone(t.region === 'national' ? a.currentSupport : a.byRegion[t.region]!, t.party));
}
function loss(p: Params, seeds = train) {
  let sse = 0;
  for (const s of seeds) simulate(p, s).forEach((v, i) => { sse += (v - targets[i]!.value) ** 2; });
  return sse / seeds.length;
}
function mean(p: Params, seeds: number[]) {
  const sums = targets.map(() => 0);
  for (const s of seeds) simulate(p, s).forEach((v, i) => { sums[i] = sums[i]! + v; });
  return sums.map(v => Math.round(v / seeds.length));
}
interface Knob { path: string; get: (p: Params) => number; set: (p: Params, v: number) => void; min: number; max: number }
const knobs: Knob[] = [];
for (const region of Object.keys(seedPack.regionalAttachmentWeights).sort()) for (const party of Object.keys(seedPack.partyAttachmentMasses).sort())
  knobs.push({ path: `seeds.regionalAttachmentWeights.${region}.${party}`, min: 1, max: 10000,
    get: p => p.seeds.regionalAttachmentWeights[region as 'seoul']![party]!, set: (p, v) => { p.seeds.regionalAttachmentWeights[region as 'seoul']![party] = v; } });
for (const party of Object.keys(politicalModel.parties).sort()) for (const [key, min, max] of [['awareness', 50000, 980000], ['viability', 50000, 950000]] as const)
  knobs.push({ path: `politicalModel.parties.${party}.${key}`, min, max,
    get: p => p.parties[party]![key], set: (p, v) => { (p.parties[party] as Record<string, number>)[key] = v; } });
if (knobs.length !== tunables.parameters.reduce((n: number, x: { count: number }) => n + x.count, 0)) throw new Error('Knob list differs from scripts/calibration-tunables.json');

const before: Params = { seeds: clone(seedPack), parties: clone(politicalModel.parties) };
let best = clone(before), bestLoss = loss(best);
const startLoss = bestLoss;
for (const step of tunables.search.multiplicativeSteps as number[]) for (let sweep = 0; sweep < tunables.search.maxSweepsPerStep; sweep++) {
  let improved = false;
  for (const knob of knobs) for (const factor of [step, 1 / step]) {
    const v = knob.get(best), next = Math.max(knob.min, Math.min(knob.max, Math.round(v * factor)));
    if (next === v) continue;
    const candidate = clone(best); knob.set(candidate, next);
    const l = loss(candidate);
    if (l < bestLoss) { best = candidate; bestLoss = l; improved = true; }
  }
  console.error(`step ${step} sweep ${sweep} loss ${Math.round(bestLoss)}`);
  if (!improved) break;
}
const tol = politicalModel.smoke.calibrationTolerance;
const row = (p: Params, seeds: number[]) => mean(p, seeds);
const [b42, a42, bHeld, aHeld] = [row(before, [42]), row(best, [42]), row(before, heldOut), row(best, heldOut)];
const table = targets.map((t, i) => ({ id: t.id, target: t.value, beforeSeed42: b42[i], afterSeed42: a42[i], beforeHeldOutMean: bHeld[i], afterHeldOutMean: aHeld[i] }));
const within = (vals: number[]) => vals.filter((v, i) => Math.abs(v - targets[i]!.value) <= tol).length;
// Held-out reality: 2024 list vote by region (DD3), reported only.
const light = JSON.parse(readFileSync('docs/data/districts-light-2024.json', 'utf8'));
const listByRegion: Record<string, Record<string, number>> = {};
for (const d of light.districts) {
  const r = listByRegion[d.regionId] ??= {};
  const w = d.turnout2024 as number;
  for (const [party, share] of Object.entries(d.baseline2024.listShare as Record<string, number>)) r[party] = (r[party] ?? 0) + share * w;
}
const after42 = createGame(42, undefined, { seeds: best.seeds, parties: best.parties }).politics.analysis;
const heldOutReality = Object.entries(listByRegion).sort().map(([region, sums]) => {
  const total = Object.values(sums).reduce((a, b) => a + b, 0);
  return { region, list2024: Object.fromEntries(['dp', 'ppp'].map(p => [p, Math.round(sums[p]! * 1e6 / total)])),
    modelSeed42: Object.fromEntries(['dp', 'ppp'].map(p => [p, partyShareExcludingNone(after42.byRegion[region]!, p)])) };
});
const report = { id: 'calibration-cal', tolerance: tol, trainingSeeds: train, heldOutSeeds: '5..24', lossBefore: Math.round(startLoss), lossAfter: Math.round(bestLoss),
  withinToleranceSeed42: { before: within(b42), after: within(a42) }, withinToleranceHeldOutMean: { before: within(bHeld), after: within(aHeld) },
  targets: table, heldOutReality2024List: heldOutReality,
  calibrated: { regionalAttachmentWeights: best.seeds.regionalAttachmentWeights, parties: Object.fromEntries(Object.entries(best.parties).map(([id, p]) => [id, { awareness: p.awareness, viability: p.viability }])) } };
console.log(JSON.stringify(report, null, 1));
if (process.argv.includes('--write')) {
  writeFileSync('docs/data/calibration-cal.json', JSON.stringify(report, null, 1) + '\n');
  const seedsJson = JSON.parse(readFileSync('src/data/seeds/b1.json', 'utf8'));
  seedsJson.regionalAttachmentWeights = best.seeds.regionalAttachmentWeights;
  writeFileSync('src/data/seeds/b1.json', JSON.stringify(seedsJson, null, 2) + '\n');
  const modelJson = JSON.parse(readFileSync('src/data/seeds/political-model.json', 'utf8'));
  for (const [id, p] of Object.entries(best.parties)) { modelJson.parties[id].awareness = p.awareness; modelJson.parties[id].viability = p.viability; }
  modelJson.modelVersion = 'B3';
  writeFileSync('src/data/seeds/political-model.json', JSON.stringify(modelJson, null, 2) + '\n');
}
