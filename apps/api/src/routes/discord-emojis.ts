import type { FastifyInstance, FastifyReply } from 'fastify';

import type { DiscordClient } from '../discord-client.js';
import { requireGuildAdmin } from '../middleware/require-guild-admin.js';

/**
 * Emoji custom Discord retourné par la liste. La forme `<:name:id>` est
 * reconstruite côté client si besoin via `name`, `id`, `animated`.
 */
export interface GuildEmojiDto {
  readonly id: string;
  readonly name: string;
  readonly animated: boolean;
  /** Nom de la guild d'origine. Présent uniquement pour les emojis externes. */
  readonly guildName?: string;
}

export interface ListGuildEmojisResult {
  readonly current: readonly GuildEmojiDto[];
  readonly external: readonly GuildEmojiDto[];
}

export interface RegisterDiscordEmojisRoutesOptions {
  readonly discord: DiscordClient;
  /**
   * Liste les emojis custom visibles depuis la guild courante :
   * - `current` : emojis du serveur en cours.
   * - `external` : emojis appartenant à d'autres serveurs où le bot est
   *   présent. Les utilisateurs Nitro peuvent réagir avec ces emojis ;
   *   le bot peut quant à lui les utiliser sur n'importe quel serveur où
   *   il est invité.
   *
   * Absente → 503.
   */
  readonly listGuildEmojis?: (guildId: string) => Promise<ListGuildEmojisResult>;
}

/**
 * Route GET /guilds/:guildId/discord/emojis
 *
 * Peuple le picker d'emojis custom du dashboard reaction-roles.
 * Accès restreint : MANAGE_GUILD requis.
 */
export function registerDiscordEmojisRoutes(
  app: FastifyInstance,
  options: RegisterDiscordEmojisRoutesOptions,
): void {
  app.get<{ Params: { guildId: string } }>(
    '/guilds/:guildId/discord/emojis',
    async (request, reply: FastifyReply) => {
      const { guildId } = request.params;
      await requireGuildAdmin(app, request, guildId, options.discord);

      if (!options.listGuildEmojis) {
        return reply.code(503).send({ reason: 'discord_bridge_unavailable' });
      }

      const result = await options.listGuildEmojis(guildId);
      return result;
    },
  );
}
