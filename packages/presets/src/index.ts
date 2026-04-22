/**
 * `@varde/presets` — catalogue de presets hand-curated pour le moteur
 * d'onboarding. Surface publique consommée par :
 *
 * - `apps/api` (PR 3.4) : expose les presets via
 *   `GET /onboarding/presets` et les matérialise en draft au moment
 *   d'un `POST /onboarding { source: 'preset', presetId }`.
 * - `@varde/ai` (PR 3.6+) : le stub rule-based pioche dans le
 *   catalogue pour composer ses sorties déterministes.
 *
 * Ajouter un preset = ajouter un fichier `catalog/<id>.ts` qui exporte
 * un `PresetDefinition`, puis l'inclure dans `PRESET_CATALOG`. Le
 * test `catalog.test.ts` échouera tant que le preset ne passe pas
 * `validatePreset` — filet automatique contre les dérives.
 */
export {
  communityCreative,
  communityGamingSmall,
  communityGenericStarter,
  communityStudyGroup,
  communityTechSmall,
  findPreset,
  PRESET_CATALOG,
} from './catalog/index.js';
export {
  type PermissionPresetId,
  PRESET_OBJECT_BUDGET,
  type PresetCategory,
  type PresetChannel,
  type PresetChannelType,
  type PresetDefinition,
  type PresetLocale,
  type PresetModuleConfig,
  type PresetRole,
  presetCategorySchema,
  presetChannelSchema,
  presetDefinitionSchema,
  presetModuleConfigSchema,
  presetRoleSchema,
} from './types.js';
export {
  assertValidPreset,
  type PresetValidationIssue,
  type PresetValidationResult,
  validatePreset,
} from './validator.js';
