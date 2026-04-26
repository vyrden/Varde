import { defineModule } from '@varde/contracts';

import { commands } from './commands/index.js';
import { configSchema, configUi } from './config.js';
import { manifest } from './manifest.js';

/**
 * Module officiel `moderation`. Livre 10 commandes manuelles :
 * `/warn /kick /ban /tempban /unban /mute /tempmute /unmute /clear
 * /slowmode`. Toutes les sanctions sont auditées via
 * `ctx.audit.log` avec actions namespacées `moderation.case.*` —
 * l'historique est interrogeable via la page audit du dashboard.
 *
 * Pas de handler events V1 (les commandes sont les seuls points
 * d'entrée). L'automod (filtres lexicaux, rate-limit) viendra en
 * PR 4.M.4 et accrochera `guild.messageCreate`.
 */
export const moderation = defineModule({
  manifest,
  configSchema,
  configUi,
  commands,

  onLoad: (ctx) => {
    ctx.logger.info('moderation : onLoad', {
      commandCount: Object.keys(commands).length,
    });
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
