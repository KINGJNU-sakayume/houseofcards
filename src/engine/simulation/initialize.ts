import { policyLevers, realityPack, seedPack } from '../../data/reality';
import { createIssues } from '../issues';
import { createGovernmentPolicy, createPlatform, editDraft, publishPlatform } from '../policy';
import { buildCohorts } from '../voters/cohorts';
import { deriveStream, randomInt, streamKey } from './rng';
import type { CoreValue } from '../../types/simulation';

export const PLAYER_PARTY_ID = 'player-preview';
export function initializeSimulation(seed: number, date: string) {
  const ids = [...realityPack.parties.map(p => p.id), 'minor-bloc', PLAYER_PARTY_ID].sort();
  const key = streamKey('platform-priors', date);
  let rng = deriveStream(seed, 'platform-priors', date);
  const platforms = ids.map(id => {
    let platform = createPlatform(id, policyLevers);
    if (id === PLAYER_PARTY_ID) return platform; // Unpublished, no creation UI in B1.
    const party = realityPack.parties.find(p => p.id === id);
    const tags = new Set((party?.platformTags?.value ?? []).flatMap(topic => seedPack.tagInterpretation[topic] ?? []));
    for (const lever of [...policyLevers].sort((a, b) => a.id < b.id ? -1 : 1)) {
      const related = Object.keys(lever.valueTags).some(tag => tags.has(tag as CoreValue));
      const weights = seedPack.platformPriorWeights.map((w, value) => w + (related && value >= 3 ? 3 : 0));
      const draw = randomInt(rng, weights.reduce((a, b) => a + b, 0)); rng = draw.state;
      let cursor = draw.value, value = 0;
      while (cursor >= weights[value]!) { cursor -= weights[value]!; value++; }
      platform = publishPlatform(editDraft(platform, lever.id, value), lever.id, date);
    }
    return platform;
  });
  const { cohorts, rngState } = buildCohorts(realityPack, seedPack, policyLevers, seed, date, ids);
  if (!realityPack.governingPartyId) throw new Error('집권당 레코드가 필요합니다.');
  return { platforms, cohorts, governmentPolicy: createGovernmentPolicy(realityPack.governingPartyId, policyLevers),
    issues: createIssues(seedPack.issueConfigs, date), rngState: { ...rngState, [key]: rng },
  };
}
