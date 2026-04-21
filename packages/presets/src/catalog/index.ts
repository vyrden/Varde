import type { PresetDefinition } from '../types.js';

import { communityCreative } from './creative.js';
import { communityGamingSmall } from './gaming.js';
import { communityGenericStarter } from './starter.js';
import { communityStudyGroup } from './study.js';
import { communityTechSmall } from './tech.js';

/**
 * Catalogue des presets hand-curated V1 (ADR 0007, PR 3.3).
 *
 * L'ordre du tableau est conservé pour l'affichage dans le dashboard
 * (PR 3.5) : du plus typé au plus neutre. Le starter apparaît en
 * dernier comme fallback proposé quand rien ne matche.
 */
export const PRESET_CATALOG: readonly PresetDefinition[] = Object.freeze([
  communityTechSmall,
  communityGamingSmall,
  communityCreative,
  communityStudyGroup,
  communityGenericStarter,
]);

export {
  communityCreative,
  communityGamingSmall,
  communityGenericStarter,
  communityStudyGroup,
  communityTechSmall,
};

/** Lookup par id. Retourne undefined si l id n existe pas dans le catalogue. */
export function findPreset(id: string): PresetDefinition | undefined {
  return PRESET_CATALOG.find((p) => p.id === id);
}
