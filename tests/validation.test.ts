import { describe, expect, it } from 'vitest';
import { politicalModel } from '../src/data/seeds/political-model';
import { realityPack, seedPack } from '../src/data/reality';
import type { RealityPack, SeedPack } from '../src/data/reality/schema';
import { validateData } from '../src/data/reality/validate';

// Entirely synthetic fixtures. No names, numbers or citations here are reality data.
function fixture() {
  const pack: RealityPack = JSON.parse(JSON.stringify(realityPack));
  const seeds: SeedPack = JSON.parse(JSON.stringify(seedPack));
  const meta = { status: 'REAL_FACT' as const, source: 'test-fixture-only', verifiedAt: '2026-10-18', asOf: '2026-10-18' };
  pack.completeness = 'BASELINE';
  pack.facts = [];
  delete pack.electionDate;
  delete pack.regionAgeMarginals;
  delete pack.calibrationTargets;
  pack.parties = [{ id: 'party-fixture', name: { ...meta, id: 'p-name', value: '테스트 정당' }, shortName: { ...meta, id: 'p-short', value: '테스트' } }];
  pack.governingPartyId = 'party-fixture';
  seeds.partyAttachmentMasses['party-fixture'] = 1;
  pack.politicians = [{ id: 'real-fixture', partyId: 'party-fixture', name: { ...meta, id: 'person-name', value: '실존이름검사' } }];
  pack.assembly = { statutorySeats: { ...meta, id: 'total', value: 300 }, occupiedSeats: { ...meta, id: 'occupied', value: 299 }, vacancies: { ...meta, id: 'vacant', value: 1 } };
  pack.indicators = [{ ...meta, id: 'metric', value: 42 }];
  seeds.fictionalPoliticians = [{ id: 'fictional-fixture', name: '가상이름검사' }];
  return { pack, seeds };
}
describe('spec §33 data validator', () => {
  it('keeps B1 data immutable, blocks unresolved releases and validates a complete fixture', () => {
    expect(Object.isFrozen(realityPack.provinceRegions)).toBe(true);
    expect(validateData(realityPack, seedPack).errors).toEqual([]);
    expect(validateData(realityPack, seedPack, true).errors.join()).toContain('UNVERIFIED_ASSUMPTION');
    expect(validateData(realityPack, seedPack).warnings.join()).toContain('UNVERIFIED_ASSUMPTION');
    const { pack, seeds } = fixture();
    expect(validateData(pack, seeds, true, undefined, { ...politicalModel, governmentApprovalFallback: null }).errors).toEqual([]);
  });
  it('catches seat totals and fractional seats', () => {
    const { pack, seeds } = fixture();
    pack.assembly!.vacancies.value = 2;
    expect(validateData(pack, seeds).errors.join()).toContain('Assembly');
    pack.assembly!.statutorySeats.value = 301;
    expect(validateData(pack, seeds).errors.join()).toContain('300');
  });
  it('catches unknown party IDs and duplicate politician IDs across layers', () => {
    const { pack, seeds } = fixture();
    pack.politicians[0]!.partyId = 'unknown';
    pack.governingPartyId = 'unknown';
    seeds.fictionalPoliticians[0]!.id = pack.politicians[0]!.id;
    const errors = validateData(pack, seeds).errors.join();
    expect(errors).toContain('invalid party ID');
    expect(errors).toContain('governingPartyId');
    expect(errors).toContain('duplicate ID');
  });
  it('requires sources and verification dates on real facts, and asOf on metrics', () => {
    const { pack, seeds } = fixture();
    delete pack.parties[0]!.name.source;
    delete pack.politicians[0]!.name.verifiedAt;
    delete pack.indicators[0]!.asOf;
    const errors = validateData(pack, seeds).errors.join();
    expect(errors).toContain('p-name');
    expect(errors).toContain('person-name');
    expect(errors).toContain('metric needs asOf');
  });
  it('rejects save-state leakage at every strict object boundary', () => {
    const { pack, seeds } = fixture();
    expect(validateData({ ...pack, rngState: {} }, seeds).errors.length).toBeGreaterThan(0);
    expect(validateData({ ...pack, politicians: [{ ...pack.politicians[0], promises: [] }] }, seeds).errors.length).toBeGreaterThan(0);
  });
  it('rejects fictional names that collide with real names, including spaces', () => {
    const { pack, seeds } = fixture();
    seeds.fictionalPoliticians[0]!.name = '실존 이름 검사';
    expect(validateData(pack, seeds).errors.join()).toContain('name collision');
  });
  it('requires all 17 provinces exactly once in one of eight regions', () => {
    const { pack, seeds } = fixture();
    pack.provinceRegions[0] = pack.provinceRegions[1]!;
    const errors = validateData(pack, seeds).errors.join();
    expect(errors).toContain('seoul');
    expect(errors).toContain('busan');
  });
  it('warns in development and blocks release for any unverified assumption', () => {
    const { pack, seeds } = fixture();
    pack.facts = [{ id: 'unverified-law', status: 'UNVERIFIED_ASSUMPTION', value: 0.02 }];
    expect(validateData(pack, seeds).errors).toEqual([]);
    expect(validateData(pack, seeds).warnings.join()).toContain('UNVERIFIED_ASSUMPTION');
    expect(validateData(pack, seeds, true).errors.join()).toContain('UNVERIFIED_ASSUMPTION');
  });
  it('does not allow the foundation exemption to hide partial political data', () => {
    const { pack, seeds } = fixture();
    pack.completeness = 'FOUNDATION_ONLY';
    expect(validateData(pack, seeds).errors.join()).toContain('masquerade');
  });
});
