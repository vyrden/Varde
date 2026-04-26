import { defineModule } from '@varde/contracts';

import { configSchema, configUi } from './config.js';
import { manifest } from './manifest.js';

/**
 * Module officiel `moderation`. PR 4.M.1 = squelette uniquement :
 * manifeste avec 7 permissions déclarées + config minimale +
 * lifecycle hooks vides.
 *
 * Pas de `commands` déclaré pour l'instant — c'est volontaire. Si on
 * en déclarait sans handler, le `CommandRegistry` les enregistrerait
 * et le bot tenterait de router des commandes inconnues vers ce
 * module au moindre appel. Les handlers arrivent avec leurs
 * permissions câblées en PR 4.M.2.
 *
 * Le module n'est pas encore enregistré dans `apps/server/src/bin.ts`
 * — on l'y branchera quand il aura une utilité runtime.
 */
export const moderation = defineModule({
  manifest,
  configSchema,
  configUi,

  onLoad: (ctx) => {
    ctx.logger.info('moderation : onLoad — squelette PR 4.M.1');
  },

  onUnload: (ctx) => {
    ctx.logger.info('moderation : onUnload');
  },
});

export {
  configSchema,
  configUi,
  type ModerationConfig,
  moderationConfigSchema,
  resolveConfig,
} from './config.js';
export { manifest } from './manifest.js';
export default moderation;
