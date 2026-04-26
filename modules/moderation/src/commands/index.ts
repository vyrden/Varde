import type { ModuleCommandMap } from '@varde/contracts';

import { channelOpsCommands } from './channel-ops.js';
import { sanctionCommands } from './sanctions.js';

/**
 * Registre des 10 commandes manuelles du module moderation.
 * Le `defineModule` dans `src/index.ts` consomme `commands` —
 * `commands` est la source de vérité.
 */
export const commands: ModuleCommandMap = {
  ...sanctionCommands,
  ...channelOpsCommands,
};

export * from './channel-ops.js';
export * from './sanctions.js';
export { channelOpsCommands, sanctionCommands };
