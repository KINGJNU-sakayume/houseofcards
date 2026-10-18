import { politicalModel as model } from '../../data/seeds/political-model';
import type { PollGroup, PollHouse, SimulatedPoll, SupportAnalysis, SupportVector } from '../../types/politics';
import { fixedMultiply, roundDiv, SCALE } from '../simulation/math';
import { deriveStream, randomInt, streamKey } from '../simulation/rng';
import { normalizeMasses } from '../voters/cohorts';

export function integerSqrt(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Square root needs a nonnegative safe integer');
  if (value < 2) return value;
  const n = BigInt(value);
  let x = n, next = (x + 1n) / 2n;
  while (next < x) { x = next; next = (x + n / x) / 2n; }
  return Number(x);
}
export function samplingDeviation(share: number, sampleSize: number, designEffectPermille = model.polling.designEffectPermille): number {
  if (!Number.isInteger(share) || share < 0 || share > SCALE || !Number.isInteger(sampleSize) || sampleSize < 1) throw new Error('Invalid poll parameters');
  return integerSqrt(roundDiv(share * (SCALE - share) * designEffectPermille, sampleSize * 1000));
}
export function pollMargin(share: number, sampleSize: number, designEffectPermille = model.polling.designEffectPermille): number {
  // A half-observation adjustment avoids zero uncertainty at a rounded 0%/100%.
  const adjusted = roundDiv(share * sampleSize + SCALE / 2, sampleSize + 1);
  const sampling = samplingDeviation(adjusted, sampleSize, designEffectPermille);
  const combined = integerSqrt(sampling * sampling + roundDiv(model.polling.houseEffectBound * model.polling.houseEffectBound, 3));
  return roundDiv(combined * 196, 100);
}
export function initializePollHouses(seed: number, date: string, ids: readonly string[]) {
  const key = streamKey('poll-house-effects', date);
  let rng = deriveStream(seed, 'poll-house-effects', date);
  const houses = [...model.polling.houses].sort((a, b) => a.id < b.id ? -1 : 1).map(house => {
    const effects: SupportVector = {};
    for (const id of [...ids].sort()) {
      const draw = randomInt(rng, model.polling.houseEffectBound * 2 + 1); rng = draw.state;
      effects[id] = draw.value - model.polling.houseEffectBound;
    }
    const average = roundDiv(Object.values(effects).reduce((a, b) => a + b, 0), ids.length);
    for (const id of Object.keys(effects)) effects[id]! -= average;
    return { ...house, effects };
  });
  return { houses, rngState: { [key]: rng } };
}
export function makePoll(analysis: SupportAnalysis, house: PollHouse, seed: number, date: string, rngState: Record<string, number>, sequence: number) {
  const key = streamKey('poll-sampling', date);
  let rng = rngState[key] ?? deriveStream(seed, 'poll-sampling', date);
  const group = (truth: SupportVector, sampleSize: number): PollGroup => {
    const masses = Object.keys(truth).sort().map(id => {
      let normal = -6 * SCALE;
      for (let i = 0; i < 12; i++) { const draw = randomInt(rng, SCALE + 1); rng = draw.state; normal += draw.value; }
      const noise = fixedMultiply(samplingDeviation(truth[id]!, sampleSize), normal);
      return { id, mass: Math.max(0, truth[id]! + (house.effects[id] ?? 0) + noise) };
    });
    const points = normalizeMasses(masses);
    return { sampleSize, results: Object.fromEntries(Object.keys(points).sort().map(id => {
      const point = points[id]!, margin = pollMargin(point, sampleSize);
      return [id, { point, margin, low: Math.max(0, point - margin), high: Math.min(SCALE, point + margin) }];
    })) };
  };
  const subgroupSample = (id: string) => Math.max(1, roundDiv(model.polling.sampleSize * analysis.groupMass[id]!, analysis.groupMass.national!));
  const national = group(analysis.currentSupport, model.polling.sampleSize);
  const byAge = Object.fromEntries(Object.keys(analysis.byAge).sort().map(id => [id, group(analysis.byAge[id]!, subgroupSample(`age:${id}`))]));
  const byRegion = Object.fromEntries(Object.keys(analysis.byRegion).sort().map(id => [id, group(analysis.byRegion[id]!, subgroupSample(`region:${id}`))]));
  const poll: SimulatedPoll = { id: `poll-${sequence}`, date, houseId: house.id, houseName: house.name,
    designEffectPermille: model.polling.designEffectPermille, houseEffects: { ...house.effects }, national, byAge, byRegion };
  return { poll, rngState: { ...rngState, [key]: rng } };
}
