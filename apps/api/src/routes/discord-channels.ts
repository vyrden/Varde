import type { FastifyInstance, FastifyReply } from 'fastify';

import type { DiscordClient } from '../discord-client.js';
import { requireGuildAdmin } from '../middleware/require-guild-admin.js';

/**
 * Payload minimal pour la création d'un salon Discord depuis l'API.
 * On se limite aux salons texte pour le mode simple du module logs.
 */
export interface CreateGuildChannelPayload {
  readonly name: string;
  readonly type: 'text';
  readonly topic?: string;
}

/** Résultat retourné par l'implémentation de la création. */
export interface CreateGuildChannelResult {
  readonly id: string;
}

/** Salon texte Discord retourné par la liste (GET). */
export interface GuildTextChannelDto {
  readonly id: string;
  readonly name: string;
}

/** Rôle Discord retourné par la liste (GET). */
export interface GuildRoleDto {
  readonly id: string;
  readonly name: string;
  /** Couleur du rôle (entier RGB Discord). Optionnel — sert à l'UI permissions (jalon 7 PR 7.3). */
  readonly color?: number;
  /** Position du rôle dans la hiérarchie (plus grand = plus haut). */
  readonly position?: number;
  /** Nombre de membres portant ce rôle. Best-effort depuis le cache. */
  readonly memberCount?: number;
}

/**
 * Dépendances injectées pour les routes de gestion des salons Discord.
 * Le bridge vers discord.js est optionnel : si absent (CI, dev sans
 * token), la route renvoie 503.
 */
export interface RegisterDiscordChannelsRoutesOptions {
  /** Client Discord OAuth2 (vérification admin de la guild). */
  readonly discord: DiscordClient;
  /**
   * Fonction de création d'un salon Discord. Fournie par le serveur
   * lorsque le bot est connecté — réutilise le bridge onboarding
   * (`OnboardingDiscordBridge.createChannel`) déjà éprouvé.
   *
   * Absente → la route répond 503 `discord_bridge_unavailable`.
   */
  readonly createGuildChannel?: (
    guildId: string,
    payload: CreateGuildChannelPayload,
  ) => Promise<CreateGuildChannelResult>;
  /**
   * Liste les salons texte Discord de la guild. Fournie par le serveur
   * lorsque le bot est connecté. Absente → la route répond 503.
   */
  readonly listGuildTextChannels?: (guildId: string) => Promise<readonly GuildTextChannelDto[]>;
  /**
   * Liste les rôles Discord de la guild. Fournie par le serveur
   * lorsque le bot est connecté. Absente → la route répond 503.
   */
  readonly listGuildRoles?: (guildId: string) => Promise<readonly GuildRoleDto[]>;
}

/**
 * Route POST /guilds/:guildId/discord/channels
 *
 * Crée un salon Discord dans la guild cible pour le compte de l'admin
 * connecté. Utilisé par le bouton "Créer #logs pour moi" du dashboard.
 *
 * Accès restreint : MANAGE_GUILD requis.
 * Codes de retour Discord mappés explicitement :
 *   50013 / 50001 → 403 permission-denied
 *   30013         → 409 quota-exceeded
 */
export function registerDiscordChannelsRoutes(
  app: FastifyInstance,
  options: RegisterDiscordChannelsRoutesOptions,
): void {
  app.post<{
    Params: { guildId: string };
    Body: { name?: unknown; type?: unknown; topic?: unknown };
  }>('/guilds/:guildId/discord/channels', async (request, reply: FastifyReply) => {
    const { guildId } = request.params;
    await requireGuildAdmin(app, request, guildId, options.discord);

    if (!options.createGuildChannel) {
      return reply.code(503).send({ reason: 'discord_bridge_unavailable' });
    }

    /* Validation manuelle légère — zod n'est pas dans les deps API. */
    const body = request.body as { name?: unknown; type?: unknown; topic?: unknown };
    const name = body.name;
    const type = body.type ?? 'text';
    const topic = body.topic;

    if (typeof name !== 'string' || name.length === 0 || name.length > 100) {
      return reply.code(400).send({ reason: 'name invalide (1-100 caractères)' });
    }
    if (type !== 'text') {
      return reply.code(400).send({ reason: 'type non supporté, seul "text" est accepté' });
    }
    if (topic !== undefined && (typeof topic !== 'string' || topic.length > 1024)) {
      return reply.code(400).send({ reason: 'topic invalide (max 1024 caractères)' });
    }

    const payload: CreateGuildChannelPayload = {
      name,
      type: 'text',
      ...(typeof topic === 'string' ? { topic } : {}),
    };

    try {
      const result = await options.createGuildChannel(guildId, payload);
      return { channelId: result.id, channelName: name };
    } catch (error) {
      if (error !== null && typeof error === 'object' && 'code' in error) {
        const code = (error as { code: unknown }).code;
        /* 50013 = Missing Permissions, 50001 = Missing Access. */
        if (code === 50013 || code === 50001) {
          return reply.code(403).send({ reason: 'permission-denied' });
        }
        /* 30013 = Maximum number of channels reached. */
        if (code === 30013) {
          return reply.code(409).send({ reason: 'quota-exceeded' });
        }
      }
      return reply.code(500).send({ reason: 'unknown' });
    }
  });

  /**
   * Route : GET /guilds/:guildId/discord/text-channels
   *
   * Retourne la liste des salons texte Discord de la guild, pour peupler
   * les sélecteurs du module logs (choix du salon de destination des routes).
   *
   * Accès restreint : MANAGE_GUILD requis.
   * Absente du bridge → 503.
   */
  app.get<{ Params: { guildId: string } }>(
    '/guilds/:guildId/discord/text-channels',
    async (request, reply: FastifyReply) => {
      const { guildId } = request.params;
      await requireGuildAdmin(app, request, guildId, options.discord);

      if (!options.listGuildTextChannels) {
        return reply.code(503).send({ reason: 'discord_bridge_unavailable' });
      }

      const channels = await options.listGuildTextChannels(guildId);
      return { channels };
    },
  );

  /**
   * Route : GET /guilds/:guildId/discord/roles
   *
   * Retourne la liste des rôles Discord de la guild, pour peupler les
   * sélecteurs d'exclusion du mode avancé du module logs.
   *
   * Accès restreint : MANAGE_GUILD requis.
   * Absente du bridge → 503.
   */
  app.get<{ Params: { guildId: string } }>(
    '/guilds/:guildId/discord/roles',
    async (request, reply: FastifyReply) => {
      const { guildId } = request.params;
      await requireGuildAdmin(app, request, guildId, options.discord);

      if (!options.listGuildRoles) {
        return reply.code(503).send({ reason: 'discord_bridge_unavailable' });
      }

      const roles = await options.listGuildRoles(guildId);
      return { roles };
    },
  );
}
