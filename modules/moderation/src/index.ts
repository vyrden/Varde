import { defineModule } from '@varde/contracts';

import { createAutomodHandler } from './automod.js';
import { commands } from './commands/index.js';
import { configSchema, configUi } from './config.js';
import { manifest } from './manifest.js';

/**
 * Module officiel `moderation`. Livre :
 *
 * - 10 commandes manuelles de sanction : `/warn /kick /ban /tempban
 *   /unban /mute /tempmute /unmute /clear /slowmode`.
 * - 2 commandes de lecture : `/infractions @user`, `/case <ulid>`.
 * - Automod : règles configurables (blacklist + regex) avec actions
 *   `delete | warn | mute`, déclenchées sur `guild.messageCreate`.
 *
 * Toutes les actions sont auditées via `ctx.audit.log` avec actions
 * namespacées `moderation.case.*` (sanctions) et
 * `moderation.automod.triggered` (automod) — historique
 * interrogeable via la page audit du dashboard et via les commandes
 * de lookup.
 */
const subscriptions = new Set<() => void>();

export const moderation = defineModule({
  manifest,
  configSchema,
  configUi,
  commands,
  // Module tagué `moderator` (jalon 7 PR 7.3) : accessible aux
  // users qui ont au moins un rôle dans `moderatorRoleIds` côté
  // `guild_permissions`, ou ce qu'on appelle un user `admin`.
  // Sans cette annotation, le module retombe sur `'admin'`
  // (défaut restrictif) et seul un admin du serveur le voit.
  requiredPermission: 'moderator',

  onLoad: (ctx) => {
    ctx.logger.info('moderation : onLoad', {
      commandCount: Object.keys(commands).length,
    });
    const unsub = ctx.events.on('guild.messageCreate', createAutomodHandler(ctx));
    subscriptions.add(unsub);
  },

  onUnload: (ctx) => {
    for (const unsub of subscriptions) unsub();
    subscriptions.clear();
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
