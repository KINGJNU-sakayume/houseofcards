import { PROVINCE_IDS, REGION_IDS, leverSchema, realityPackSchema, seedPackSchema } from './schema';
import { AGE_BANDS, CORE_VALUES, DOMAIN_IDS, PROFILE_IDS } from '../../types/simulation';
import { forbiddenNamesIn } from '../../validation/forbidden-names';
import leverData from '../policy/levers.json' with { type: 'json' };
import { politicalModel } from '../seeds/political-model';
import { politicianModel, politicianModelSchema } from '../seeds/politicians';
import { denylistSchema, realNameDenylist, type NameDenylist } from '../../validation/real-name-denylist';
import { nameTableCollisions } from '../../engine/people/generator';

export interface ValidationReport { errors: string[]; warnings: string[] }
export function validateData(reality: unknown, seeds: unknown, release = false, levers: unknown = leverData, politicalSeeds: typeof politicalModel = politicalModel,
  people: { model: unknown; denylist: unknown } = { model: politicianModel, denylist: realNameDenylist }): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const name of forbiddenNamesIn([reality, seeds, levers, politicalSeeds])) errors.push(`Forbidden poll/media name: ${name}`);
  const parsed = realityPackSchema.safeParse(reality);
  const parsedSeeds = seedPackSchema.safeParse(seeds);
  const parsedLevers = leverSchema.array().safeParse(levers);
  if (!parsedLevers.success) errors.push(...parsedLevers.error.issues.map(issue => `levers.${issue.path.join('.')}: ${issue.message}`));
  if (!parsed.success) errors.push(...parsed.error.issues.map(issue => `reality.${issue.path.join('.')}: ${issue.message}`));
  if (!parsedSeeds.success) errors.push(...parsedSeeds.error.issues.map(issue => `seeds.${issue.path.join('.')}: ${issue.message}`));
  if (!parsed.success || !parsedSeeds.success || !parsedLevers.success) return { errors, warnings };
  const pack = parsed.data;
  const seed = parsedSeeds.data;
  if (pack.electionDate?.status === 'REAL_FACT' && !pack.electionDate.scheduleStatus) errors.push('election-date: REAL_FACT election date needs scheduleStatus');
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
  } else if (pack.completeness === 'BASELINE' && (!pack.assembly || pack.parties.length === 0 || pack.governingPartyId === null)) {
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
    ...pack.parties.flatMap(p => [p.name, p.shortName, ...(p.platformTags ? [p.platformTags] : [])]), ...pack.politicians.map(p => p.name),
    ...(pack.electionDate ? [pack.electionDate] : []),
    ...(pack.regionAgeMarginals ?? []).map(row => row.mass), ...(pack.calibrationTargets ?? []).map(row => row.target),
    ...(pack.assembly ? Object.values(pack.assembly) : []),
  ];
  unique(facts.map(f => f.id), 'facts');
  const metrics = new Set([...pack.indicators, ...(pack.assembly ? Object.values(pack.assembly) : [])].map(f => f.id));
  for (const f of facts) {
    if (f.status === 'REAL_FACT' && (!f.source?.trim() || !f.verifiedAt)) errors.push(`${f.id}: REAL_FACT needs source and verifiedAt`);
    if (f.status === 'REAL_FACT' && f.metric && typeof f.value !== 'number') errors.push(`${f.id}: REAL_FACT metric needs a numeric measurement`);
    if ((f.metric || metrics.has(f.id)) && !f.asOf) errors.push(`${f.id}: metric needs asOf`);
    if (f.asOf && f.asOf > pack.asOf) errors.push(`${f.id}: metric is newer than pack snapshot`);
    if (f.verifiedAt && f.verifiedAt > pack.asOf) errors.push(`${f.id}: verification is newer than pack snapshot`);
    if (f.status === 'UNVERIFIED_ASSUMPTION') (release ? errors : warnings).push(`${f.id}: UNVERIFIED_ASSUMPTION`);
    if (f.status === 'GAME_ASSUMPTION' && pack.completeness !== 'FOUNDATION_ONLY') errors.push(`${f.id}: Seed interpretation does not belong in Reality`);
  }
  if (pack.completeness === 'SIMULATION_FOUNDATIONS') {
    if (!pack.parties.length || !pack.governingPartyId || !pack.electionDate || !pack.calibrationTargets?.length || !pack.facts.some(f => f.id === 'government-approval')) {
      errors.push('B1 foundations require parties, government, election date, approval status and calibration status');
    }
    for (const party of pack.parties) if (!party.platformTags) errors.push(`${party.id}: official platform topics required`);
    if (!pack.facts.some(f => f.id === 'governing-party' && f.value === pack.governingPartyId)) errors.push('Governing party needs a matching provenance record');
    for (const region of REGION_IDS) for (const age of AGE_BANDS) {
      if (pack.regionAgeMarginals?.filter(r => r.regionId === region && r.ageBand === age).length !== 1) errors.push(`Missing/duplicate demographic marginal: ${region}/${age}`);
    }
    if (!pack.regionAgeMarginals?.some(row => row.mass.value > 0)) errors.push('Demographic mass must be positive');
    if (pack.regionAgeMarginals?.some(row => !Number.isSafeInteger(row.mass.value))) errors.push('Demographic masses must be safe integers');
  }
  const definitions = parsedLevers.data;
  unique(definitions.map(l => l.id), 'levers');
  const driverIds = seed.issueConfigs.flatMap(c => c.drivers.map(d => d.id));
  unique(driverIds, 'issue drivers');
  unique(seed.issueConfigs.map(c => c.id), 'issue configs');
  unique(seed.cohortProfiles.map(p => p.id), 'cohort profiles');
  for (const id of DOMAIN_IDS) {
    const count = definitions.filter(l => l.domain === id).length;
    if (count !== (id === 'housing' || id === 'industry-ai' ? 6 : 5)) errors.push(`${id}: wrong lever count`);
  }
  for (const lever of definitions) for (const effect of lever.effectChannels) {
    if (!driverIds.includes(effect.driverId)) errors.push(`${lever.id}: invalid effect channel ${effect.driverId}`);
  }
  for (const value of CORE_VALUES) {
    if (!definitions.some(l => l.valueTags[value]) && !seed.nonLeverSignals[value]?.length) errors.push(`${value}: unreachable core value`);
  }
  for (const profile of PROFILE_IDS) if (!seed.cohortProfiles.some(p => p.id === profile)) errors.push(`Missing profile ${profile}`);
  for (const id of [...pack.parties.map(p => p.id), 'minor-bloc']) {
    if (!seed.partyAttachmentMasses[id]) errors.push(`Missing attachment seed ${id}`);
  }
  for (const region of REGION_IDS) for (const age of AGE_BANDS) {
    const rows = seed.profileConditionals.filter(row => row.regionId === region && row.ageBand === age);
    if (rows.length !== 1 || rows[0]!.masses.reduce((a, b) => a + b, 0) <= 0) errors.push(`Invalid profile conditional ${region}/${age}`);
  }
  if (politicalSeeds.governmentApprovalFallback?.status === 'UNVERIFIED_ASSUMPTION') (release ? errors : warnings).push('government-approval-fallback: UNVERIFIED_ASSUMPTION');
  for (const party of pack.parties) if (pack.completeness === 'SIMULATION_FOUNDATIONS' && !politicalSeeds.parties[party.id]) errors.push(`Missing political model seed ${party.id}`);
  const peopleModel = politicianModelSchema.safeParse(people.model), denylist = denylistSchema.safeParse(people.denylist);
  if (!peopleModel.success) errors.push(...peopleModel.error.issues.map(issue => `politicians.${issue.path.join('.')}: ${issue.message}`));
  if (!denylist.success) errors.push(...denylist.error.issues.map(issue => `real-name-denylist.${issue.path.join('.')}: ${issue.message}`));
  if (peopleModel.success && denylist.success) {
    // Generated names must never reproduce a Reality name, a denylisted name, or a poll/media name.
    for (const name of nameTableCollisions(peopleModel.data, denylist.data as NameDenylist)) errors.push(`politicians: generated name collision ${name}`);
  }
  return { errors, warnings };
}
