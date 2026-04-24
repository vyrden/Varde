import { defineModule } from '@varde/contracts';

import { configSchema, configUi, type ReactionRolesConfig, resolveConfig } from './config.js';
import { locales } from './locales.js';
import { manifest } from './manifest.js';

/**
 * Module officiel reaction-roles. Task 3 pose la coquille (manifest,
 * config, locales). Task 4 ajoute le runtime (handlers des 3 modes +
 * self-caused tracking).
 */
export const reactionRoles = defineModule({
  manifest,
  configSchema,
  configUi,

  onLoad: async (ctx) => {
    ctx.logger.info('reaction-roles : onLoad (runtime à implémenter en Task 4)');
  },

  onUnload: async (ctx) => {
    ctx.logger.info('reaction-roles : onUnload');
  },
});

export type { ReactionRolesConfig };
export { configSchema, configUi, locales, manifest, resolveConfig };
export default reactionRoles;
