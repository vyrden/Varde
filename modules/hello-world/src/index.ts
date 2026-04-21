import { type ActionId, defineModule, type ModuleId, type PermissionId } from '@varde/contracts';

import { locales } from './locales.js';
import { manifest } from './manifest.js';

/**
 * Module témoin `hello-world`. Exerce la surface publique du core :
 *
 * - `onLoad` : s'abonne à `guild.memberJoin`. À chaque nouveau membre :
 *   1. `ctx.logger.info` — log scopé au module.
 *   2. `ctx.audit.log` — écrit une entrée d'audit attribuée au module
 *      avec une action canonique `hello-world.welcome.greeted`.
 *   3. `ctx.scheduler.in` — planifie une tâche dérivée (300 ms) qui,
 *      au tick suivant, écrit une seconde entrée d'audit
 *      `hello-world.welcome.sent` (simule l'envoi d'un message
 *      différé au nouveau membre).
 *
 * - `commands.ping` : `/ping` répond via `ctx.ui.success(ctx.i18n.t(...))`.
 *   Permission `hello-world.ping` déclarée pour exercer le checker du
 *   bot (bypass member-level par défaut).
 *
 * Le module ne persiste pas ses propres tables en V1 (ScopedDatabase
 * encore marker). La table `hello_world_greetings` prévue par le plan
 * viendra avec le vrai scoping DB.
 */

const MODULE_ID = 'hello-world' as ModuleId;
const PING_PERMISSION = 'hello-world.ping' as PermissionId;
const WELCOME_ACTION = 'hello-world.welcome.greeted' as ActionId;
const SENT_ACTION = 'hello-world.welcome.sent' as ActionId;

const WELCOME_DELAY_MS = 300;

// Souscriptions EventBus actives, collectées au onLoad et détachées
// au onUnload. Le plugin loader ne détache pas automatiquement les
// handlers du bus — c'est au module de nettoyer, sinon ses handlers
// survivent à son propre unload.
const subscriptions = new Set<() => void>();

export const helloWorld = defineModule({
  manifest,

  commands: {
    ping: {
      name: 'ping',
      description: 'Répond pong. Exerce /ui.success et /i18n.t.',
      defaultPermission: PING_PERMISSION,
      handler: (_input, ctx) => ctx.ui.success(ctx.i18n.t('ping.pong')),
    },
  },

  onLoad: async (ctx) => {
    ctx.logger.info('hello-world : onLoad exécuté');

    const unsubscribeMemberJoin = ctx.events.on('guild.memberJoin', async (event) => {
      ctx.logger.info('hello-world : memberJoin reçu', {
        guildId: event.guildId,
        userId: event.userId,
      });

      await ctx.audit.log({
        guildId: event.guildId,
        action: WELCOME_ACTION,
        actor: { type: 'module', id: MODULE_ID },
        target: { type: 'user', id: event.userId },
        severity: 'info',
        metadata: { greeting: ctx.i18n.t('welcome.greeting', { userId: event.userId }) },
      });

      const jobKey = `hello-world:welcome:${event.guildId}:${event.userId}`;
      await ctx.scheduler.in(WELCOME_DELAY_MS, jobKey, async () => {
        await ctx.audit.log({
          guildId: event.guildId,
          action: SENT_ACTION,
          actor: { type: 'module', id: MODULE_ID },
          target: { type: 'user', id: event.userId },
          severity: 'info',
        });
        ctx.logger.info('hello-world : welcome délivré', {
          guildId: event.guildId,
          userId: event.userId,
        });
      });
    });
    subscriptions.add(unsubscribeMemberJoin);
  },

  onUnload: async (ctx) => {
    for (const unsubscribe of subscriptions) {
      unsubscribe();
    }
    subscriptions.clear();
    ctx.logger.info('hello-world : onUnload exécuté');
  },
});

export { locales, manifest };
export default helloWorld;
