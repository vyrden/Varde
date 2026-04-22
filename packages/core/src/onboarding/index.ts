/**
 * Module onboarding de `@varde/core` : executor d'actions
 * composables + 4 primitives core-owned (ADR 0007).
 *
 * Surface consommée par `apps/server` (enregistre les actions au
 * démarrage), `apps/api` (expose les routes builder, PR 3.4), et
 * les modules tiers qui contribuent leurs propres actions via
 * `registerAction`.
 */

export {
  CORE_ACTIONS,
  type CreateCategoryPayload,
  type CreateCategoryResult,
  type CreateChannelPayload,
  type CreateChannelResult,
  type CreateRolePayload,
  type CreateRoleResult,
  createCategoryAction,
  createChannelAction,
  createRoleAction,
  type PatchModuleConfigPayload,
  type PatchModuleConfigResult,
  PERMISSION_PRESET_BITS,
  type PermissionPresetId,
  patchModuleConfigAction,
} from './actions.js';
export {
  type ApplyActionsResult,
  type CreateOnboardingExecutorOptions,
  createOnboardingExecutor,
  type OnboardingExecutor,
  type UndoSessionResult,
} from './executor.js';
export {
  type CreateOnboardingHostServiceOptions,
  createOnboardingHostService,
  type OnboardingHostService,
} from './host.js';
