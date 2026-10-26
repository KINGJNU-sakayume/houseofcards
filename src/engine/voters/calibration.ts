import type { RealityPack } from '../../data/reality/schema';
import { politicalModel } from '../../data/seeds/political-model';
import type { SupportAnalysis } from '../../types/politics';
import { roundDiv, SCALE } from '../simulation/math';
// Targets are shares of valid party votes, so the comparable model value is a
// party's share among voters who choose some party ('none' excluded).
export function partyShareExcludingNone(vector: Record<string, number>, partyId: string): number {
  const none = vector.none ?? 0;
  return none >= SCALE ? 0 : roundDiv(vector[partyId]! * SCALE, SCALE - none);
}
// Target values, when verified, are Q6 vote shares. Unavailable measurements
// remain null and are reported, never turned into a zero calibration target.
export function checkCalibration(analysis: SupportAnalysis, reality: RealityPack, tolerance = politicalModel.smoke.calibrationTolerance) {
  const checked: string[] = [], unverified: string[] = [], errors: string[] = [];
  for (const row of reality.calibrationTargets ?? []) {
    const target = row.target;
    if (target.status !== 'REAL_FACT' || target.value === null) { unverified.push(target.id); continue; }
    if (typeof target.value !== 'number' || !Number.isInteger(target.value) || target.value < 0 || target.value > 1_000_000) { errors.push(`${target.id}: target must be a Q6 share`); continue; }
    const group = row.regionId === 'national' ? analysis.currentSupport : analysis.byRegion[row.regionId];
    if (group?.[row.partyId] === undefined) { errors.push(`${target.id}: missing simulated group/party`); continue; }
    const simulated = partyShareExcludingNone(group, row.partyId);
    checked.push(target.id);
    if (Math.abs(simulated - target.value) > tolerance) errors.push(`${target.id}: simulated ${simulated}, target ${target.value}, tolerance ${tolerance}`);
  }
  return { checked, unverified, errors };
}
