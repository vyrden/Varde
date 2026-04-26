import type { ModuleCommandMap } from '@varde/contracts';

import { casesLookupCommands } from './cases-lookup.js';
import { channelOpsCommands } from './channel-ops.js';
import { sanctionCommands } from './sanctions.js';

/**
 * Registre des 12 commandes du module moderation : 8 sanctions, 2
 * channel ops, 2 lookup cases. Le `defineModule` dans `src/index.ts`
 * consomme `commands` — `commands` est la source de vérité.
 */
export const commands: ModuleCommandMap = {
  ...sanctionCommands,
  ...channelOpsCommands,
  ...casesLookupCommands,
};

export * from './cases-lookup.js';
export * from './channel-ops.js';
export * from './sanctions.js';
export { casesLookupCommands, channelOpsCommands, sanctionCommands };
