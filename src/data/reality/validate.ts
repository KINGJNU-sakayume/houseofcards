import { PROVINCE_IDS, realityPackSchema, seedPackSchema } from './schema';

export interface ValidationReport { errors: string[]; warnings: string[] }
export function validateData(reality: unknown, seeds: unknown, release = false): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = realityPackSchema.safeParse(reality);
  const parsedSeeds = seedPackSchema.safeParse(seeds);
  if (!parsed.success) errors.push(...parsed.error.issues.map(issue => `reality.${issue.path.join('.')}: ${issue.message}`));
  if (!parsedSeeds.success) errors.push(...parsedSeeds.error.issues.map(issue => `seeds.${issue.path.join('.')}: ${issue.message}`));
  if (!parsed.success || !parsedSeeds.success) return { errors, warnings };
  const pack = parsed.data;
  const seed = parsedSeeds.data;
  const unique = (ids: string[], context: string) => {
    if (new Set(ids).size !== ids.length) errors.push(`${context}: duplicate ID`);
  };
  unique(pack.parties.map(p => p.id), 'parties');
  unique([...pack.politicians.map(p => p.id), ...seed.fictionalPoliticians.map(p => p.id)], 'politicians');
  const parties = new Set(pack.parties.map(p => p.id));
  for (const person of pack.politicians) {
    if (person.partyId !== null && !parties.has(person.partyId)) errors.push(`${person.id}: invalid party ID`);
  }
  if (pack.governingPartyId !== null && !parties.has(pack.governingPartyId)) errors.push('governingPartyId: invalid party ID');
  if (seed.realityPackId !== pack.id) errors.push('Seed/reality pack mismatch');
  const realNames = new Set(pack.politicians.map(p => p.name.value.normalize('NFC').replace(/\s/g, '')));
  for (const person of seed.fictionalPoliticians) {
    if (realNames.has(person.name.normalize('NFC').replace(/\s/g, ''))) errors.push(`${person.id}: fictional/real name collision`);
  }
  for (const id of PROVINCE_IDS) {
    if (pack.provinceRegions.filter(p => p.provinceId === id).length !== 1) errors.push(`${id}: province must map to exactly one region`);
  }
  if (pack.completeness === 'FOUNDATION_ONLY') {
    if (pack.assembly || pack.parties.length || pack.politicians.length || pack.indicators.length || pack.facts.length || pack.governingPartyId !== null) {
      errors.push('Foundation pack must not masquerade as a political baseline');
    }
    warnings.push('FOUNDATION_ONLY: no real political baseline loaded; simulation systems are not implemented in Phase A.');
  } else if (!pack.assembly || pack.parties.length === 0 || pack.governingPartyId === null) {
    errors.push('Baseline requires an assembly, parties and governing party');
  }
  if (pack.assembly) {
    const { statutorySeats, occupiedSeats, vacancies } = pack.assembly;
    // Spec §33 validation invariant, NOT an election allocation parameter.
    if (statutorySeats.value !== 300 || occupiedSeats.value + vacancies.value !== statutorySeats.value ||
      ![statutorySeats.value, occupiedSeats.value, vacancies.value].every(Number.isInteger)) {
      errors.push('Assembly: statutory seats must be 300 and occupied + vacant must equal total');
    }
  }
  const facts = [
    ...pack.facts, ...pack.indicators,
    ...pack.parties.flatMap(p => [p.name, p.shortName]), ...pack.politicians.map(p => p.name),
    ...(pack.assembly ? Object.values(pack.assembly) : []),
  ];
  unique(facts.map(f => f.id), 'facts');
  const metrics = new Set([...pack.indicators, ...(pack.assembly ? Object.values(pack.assembly) : [])].map(f => f.id));
  for (const f of facts) {
    if (f.status === 'REAL_FACT' && (!f.source?.trim() || !f.verifiedAt)) errors.push(`${f.id}: REAL_FACT needs source and verifiedAt`);
    if ((f.metric || metrics.has(f.id)) && !f.asOf) errors.push(`${f.id}: metric needs asOf`);
    if (f.asOf && f.asOf > pack.asOf) errors.push(`${f.id}: metric is newer than pack snapshot`);
    if (f.status === 'UNVERIFIED_ASSUMPTION') (release ? errors : warnings).push(`${f.id}: UNVERIFIED_ASSUMPTION`);
  }
  return { errors, warnings };
}
