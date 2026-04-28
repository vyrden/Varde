import {
  type ActionId,
  defineModule,
  type GuildId,
  type ModuleId,
  type PermissionId,
  type UserId,
} from '@varde/contracts';

import { configSchema, configUi, resolveConfig } from './config.js';
import { locales } from './locales.js';
import { manifest } from './manifest.js';

/**
 * Module exemple `example-counter`.
 *
 * Compte les messages envoyés par chaque membre dans chaque serveur
 * où le module est activé, et expose `/count [member?]` pour lire
 * les compteurs.
 *
 * # Limite pédagogique assumée
 *
 * Ce module garde les compteurs **en mémoire** (Map). À chaque
 * redémarrage, les compteurs sont remis à zéro.
 *
 * En production, un module qui veut persister sa propre table
 * passe par `ctx.db` (Drizzle scopé au module) avec ses propres
 * migrations. C'est le pattern qu'utilisent les modules officiels
 * `moderation`, `welcome`, `reaction-roles`. Voir
 * `docs/MODULE-AUTHORING.md` § « Persister vos données ».
 *
 * Ce module reste volontairement minimal pour servir de référence
 * pédagogique : un seul fichier de config, un seul listener, une
 * seule commande, pas de migrations à comprendre avant d'avoir
 * compris le contrat de base.
 */

const MODULE_ID = 'example-counter' as ModuleId;
const VIEW_PERMISSION = 'example-counter.view' as PermissionId;
const COUNTED_ACTION = 'example-counter.message.counted' as ActionId;

// État en mémoire : pour chaque (guild, user) on garde le nombre
// de messages comptabilisés depuis le dernier démarrage du process.
const counters = new Map<string, number>();
const counterKey = (guildId: GuildId, userId: UserId): string => `${guildId}:${userId}`;

// Souscriptions actives, à détacher au onUnload.
const subscriptions = new Set<() => void>();

export const exampleCounter = defineModule({
  manifest,
  configSchema,
  configUi,

  commands: {
    count: {
      name: 'count',
      description: 'Affiche combien de messages un membre a envoyé sur ce serveur.',
      defaultPermission: VIEW_PERMISSION,
      options: [
        {
          name: 'member',
          description: 'Le membre dont voir le compteur. Toi-même par défaut.',
          type: 'user',
          required: false,
        },
      ],
      handler: (input, ctx) => {
        const targetUserId = ((input.options['member'] as string | undefined) ??
          input.userId) as UserId;
        const isSelf = targetUserId === input.userId;
        const count = counters.get(counterKey(input.guildId, targetUserId)) ?? 0;

        // `ctx.ui.success` retourne un message normalisé. Pour un état
        // « pas de donnée » non bloquant on aurait pu vouloir un
        // `info`, mais le V1 du UIService expose seulement
        // `embed | success | error | confirm` — voir l'interface
        // `UIService` dans `@varde/contracts`. Un info-like se
        // construit via `ctx.ui.embed({ description, color })`.
        if (count === 0) {
          return ctx.ui.success(
            ctx.i18n.t(isSelf ? 'count.zero.self' : 'count.zero.other', {
              userId: targetUserId,
            }),
          );
        }

        return ctx.ui.success(
          ctx.i18n.t(isSelf ? 'count.self' : 'count.other', {
            userId: targetUserId,
            count: String(count),
          }),
        );
      },
    },
  },

  onLoad: async (ctx) => {
    ctx.logger.info('example-counter : onLoad');

    const unsubscribe = ctx.events.on('guild.messageCreate', async (event) => {
      // Lecture fraîche de la config : un toggle dashboard prend
      // effet au prochain message sans redémarrage du process.
      const raw = await ctx.config.get(event.guildId).catch(() => null);
      const cfg = resolveConfig(raw);

      if (!cfg.enabled) return;
      if (cfg.excludedChannelIds.includes(event.channelId)) return;

      // Incrément + log audit informatif. En vrai module on
      // n'écrirait pas un audit par message (volume trop élevé) ;
      // ici c'est gardé pour montrer le pattern. Voir la note
      // sur les niveaux de severity dans MODULE-AUTHORING.md.
      const key = counterKey(event.guildId, event.authorId);
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);

      // Audit uniquement à des paliers ronds, pour éviter le spam.
      if (next === 1 || next % 100 === 0) {
        await ctx.audit.log({
          guildId: event.guildId,
          action: COUNTED_ACTION,
          actor: { type: 'module', id: MODULE_ID },
          target: { type: 'user', id: event.authorId },
          severity: 'info',
          metadata: { count: next },
        });
      }
    });
    subscriptions.add(unsubscribe);
  },

  onUnload: async (ctx) => {
    for (const unsubscribe of subscriptions) {
      unsubscribe();
    }
    subscriptions.clear();
    counters.clear();
    ctx.logger.info('example-counter : onUnload');
  },
});

export { configSchema, configUi, type ExampleCounterConfig, resolveConfig } from './config.js';
export { locales, manifest };
export default exampleCounter;
