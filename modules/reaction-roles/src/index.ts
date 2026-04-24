import { defineModule } from '@varde/contracts';

import { configSchema, configUi, type ReactionRolesConfig, resolveConfig } from './config.js';
import { locales } from './locales.js';
import { manifest } from './manifest.js';
import { handleReactionAdd, handleReactionRemove } from './runtime.js';
import { createSelfCausedTracker } from './self-caused.js';

/**
 * Module officiel reaction-roles. Écoute messageReactionAdd/Remove et
 * applique les règles des 3 modes (normal, unique, verifier).
 */

// Souscriptions EventBus actives — collectées au onLoad, détachées au
// onUnload. Module singleton : ces variables module-level sont correctes.
const subscriptions = new Set<() => void>();
const tracker = createSelfCausedTracker();

export const reactionRoles = defineModule({
  manifest,
  configSchema,
  configUi,

  onLoad: async (ctx) => {
    ctx.logger.info('reaction-roles : onLoad');
    subscriptions.clear();

    subscriptions.add(
      ctx.events.on('guild.messageReactionAdd', async (e) => handleReactionAdd(ctx, e, tracker)),
    );
    subscriptions.add(
      ctx.events.on('guild.messageReactionRemove', async (e) =>
        handleReactionRemove(ctx, e, tracker),
      ),
    );
  },

  onUnload: async (ctx) => {
    ctx.logger.info('reaction-roles : onUnload');
    for (const unsub of subscriptions) unsub();
    subscriptions.clear();
  },
});

/** Accès test-only au tracker module-level. */
export const __trackerForTests = tracker;

export type { ReactionRolesConfig };
export { configSchema, configUi, locales, manifest, resolveConfig };
export default reactionRoles;
