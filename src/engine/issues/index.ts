import type { GovernmentPolicy, IssueState, LeverDefinition } from '../../types/simulation';
import { effectiveValue } from '../policy';
import { roundDiv } from '../simulation/math';
import { deriveStream, randomInt, streamKey } from '../simulation/rng';

export interface IssueConfig {
  id: IssueState['id']; severity: number; salience: number; structuralPressure: number;
  inertia: number; salienceInertia: number; shockBound: number;
  drivers: { id: string; initial: number; weight: number }[];
  crossDrivers: { domain: IssueState['id']; coefficient: number }[];
}
const clamp = (value: number) => Math.max(0, Math.min(10000, value));
export function createIssues(config: readonly IssueConfig[], date: string): IssueState[] {
  return [...config].sort((a, b) => a.id < b.id ? -1 : 1).map(c => ({
    id: c.id, severity: c.severity, salience: c.salience, structuralPressure: c.structuralPressure,
    trend: 0, lastUpdated: date, drivers: Object.fromEntries(c.drivers.map(d => [d.id, d.initial])),
  }));
}
export function updateIssues(issues: readonly IssueState[], government: GovernmentPolicy, levers: readonly LeverDefinition[],
  config: readonly IssueConfig[], seed: number, date: string, rngState: Record<string, number>) {
  const key = streamKey('issue-shocks', date);
  let rng = rngState[key] ?? deriveStream(seed, 'issue-shocks', date);
  const next = [...issues].sort((a, b) => a.id < b.id ? -1 : 1).map(issue => {
    const c = config.find(item => item.id === issue.id)!;
    const shock = randomInt(rng, c.shockBound * 2 + 1); rng = shock.state;
    const shockValue = shock.value - c.shockBound;
    const drivers = Object.fromEntries([...c.drivers].sort((a, b) => a.id < b.id ? -1 : 1).map(driver => {
      let policyEffect = 0;
      for (const lever of [...levers].sort((a, b) => a.id < b.id ? -1 : 1)) {
        const delta = effectiveValue(government, lever, date) - 2;
        for (const channel of lever.effectChannels) {
          if (channel.driverId === driver.id) policyEffect += delta * channel.coefficient;
        }
      }
      // Conditions relax toward a structural target. Policy shifts that target only after its delay.
      const target = clamp(driver.initial + issue.structuralPressure * 10 + policyEffect);
      const current = issue.drivers[driver.id]!;
      return [driver.id, clamp(current + roundDiv((target - current) * (1000 - c.inertia), 1000) + shockValue)];
    }));
    const driverWeight = c.drivers.reduce((sum, d) => sum + d.weight, 0);
    const weightedDrivers = roundDiv(c.drivers.reduce((sum, d) => sum + drivers[d.id]! * d.weight, 0), driverWeight);
    // Read all cross-domain inputs from the previous month, never partially updated domains.
    const cross = c.crossDrivers.reduce((sum, d) => sum + roundDiv((issues.find(i => i.id === d.domain)!.severity - 5000) * d.coefficient, 1000), 0);
    const targetSeverity = clamp(weightedDrivers + cross);
    const severity = clamp(issue.severity + roundDiv((targetSeverity - issue.severity) * (1000 - c.inertia), 1000));
    const trend = severity - issue.severity;
    const targetSalience = clamp(roundDiv(severity * 6 + c.salience * 4, 10) + Math.abs(trend) * 3 + Math.abs(shockValue) * 2);
    const salience = clamp(issue.salience + roundDiv((targetSalience - issue.salience) * (1000 - c.salienceInertia), 1000));
    return { ...issue, severity, salience, trend, drivers, lastUpdated: date };
  });
  return { issues: next, rngState: { ...rngState, [key]: rng } };
}
