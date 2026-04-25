import { randomUUID } from 'node:crypto';

import {
  assertChannelId,
  assertGuildId,
  assertMessageId,
  assertRoleId,
  DiscordSendError,
  type DiscordService,
  type Emoji,
  type MessageId,
  type RoleId,
  type UserId,
} from '@varde/contracts';
import type { CoreConfigService } from '@varde/core';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import type { DiscordClient } from '../discord-client.js';
import { requireGuildAdmin } from '../middleware/require-guild-admin.js';

/**
 * Options d'enregistrement des routes du module reaction-roles.
 */
export interface RegisterReactionRolesRoutesOptions {
  /** Client Discord OAuth2 (vérification des permissions admin). */
  readonly discord: DiscordClient;
  /**
   * Service Discord proactif. Requis pour les routes de publication et
   * synchronisation. Si absent, les routes retournent 503.
   */
  readonly discordService?: DiscordService;
  /** Service de configuration persistée (lecture/écriture guild config). */
  readonly config: CoreConfigService;
}

// ---------------------------------------------------------------------------
// Schemas Zod
// ---------------------------------------------------------------------------

const emojiSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('unicode'), value: z.string().min(1) }),
  z.object({
    type: z.literal('custom'),
    id: z.string().regex(/^\d{17,19}$/),
    name: z.string().min(1),
    animated: z.boolean().default(false),
  }),
]);

const pairSchema = z
  .object({
    emoji: emojiSchema,
    roleId: z
      .string()
      .regex(/^\d{17,19}$/)
      .optional(),
    roleName: z.string().min(1).max(100).optional(),
  })
  .refine((p) => p.roleId !== undefined || p.roleName !== undefined, {
    message: 'Chaque paire doit avoir roleId ou roleName.',
  });

const publishBodySchema = z.object({
  label: z.string().min(1).max(64),
  channelId: z.string().regex(/^\d{17,19}$/),
  message: z.string().min(1).max(2000),
  mode: z.enum(['normal', 'unique', 'verifier']),
  feedback: z.enum(['dm', 'none']).default('dm'),
  pairs: z.array(pairSchema).min(1).max(20),
});

const syncBodySchema = z.object({
  label: z.string().min(1).max(64),
  channelId: z.string().regex(/^\d{17,19}$/),
  message: z.string().min(1).max(2000),
  mode: z.enum(['normal', 'unique', 'verifier']),
  feedback: z.enum(['dm', 'none']).default('dm'),
  pairs: z.array(pairSchema).min(1).max(20),
});

// ---------------------------------------------------------------------------
// Types internes
// ---------------------------------------------------------------------------

interface ResolvedPair {
  readonly emoji: Emoji;
  readonly roleId: RoleId;
}

interface RRMessage {
  readonly id: string;
  readonly label: string;
  readonly channelId: string;
  readonly messageId: string;
  readonly message: string;
  readonly mode: 'normal' | 'unique' | 'verifier';
  readonly feedback: 'dm' | 'none';
  readonly pairs: readonly ResolvedPair[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extrait le tableau de messages de la config persistée. */
const extractMessages = (snapshot: unknown): RRMessage[] => {
  if (typeof snapshot !== 'object' || snapshot === null) return [];
  const modules = (snapshot as { modules?: unknown }).modules;
  if (typeof modules !== 'object' || modules === null) return [];
  const rr = (modules as Record<string, unknown>)['reaction-roles'];
  if (typeof rr !== 'object' || rr === null) return [];
  const msgs = (rr as { messages?: unknown }).messages;
  return Array.isArray(msgs) ? (msgs as RRMessage[]) : [];
};

/** Clé unique d'un emoji, pour le diff. */
const emojiKey = (emoji: Emoji): string =>
  emoji.type === 'unicode' ? `u:${emoji.value}` : `c:${emoji.id}`;

// ---------------------------------------------------------------------------
// Enregistrement des routes
// ---------------------------------------------------------------------------

/**
 * Route : POST /guilds/:guildId/modules/reaction-roles/publish
 *
 * Orchestre la publication d'un message reaction-roles :
 *  1. Crée les rôles manquants via discordService.createRole.
 *  2. Poste le message via discordService.postMessage.
 *  3. Ajoute les réactions (50 ms entre chaque).
 *  4. Persiste l'entrée dans la config.
 *
 * Retourne 201 avec `{ id, messageId }`.
 *
 * Route : POST /guilds/:guildId/modules/reaction-roles/:messageId/sync
 *
 * Diff les paires entre la config persistée et le body, applique les
 * ajouts/retraits de réactions, met à jour la config.
 *
 * Retourne 200 avec `{ added, removed }`.
 */
export function registerReactionRolesRoutes(
  app: FastifyInstance,
  options: RegisterReactionRolesRoutesOptions,
): void {
  // -------------------------------------------------------------------------
  // POST /guilds/:guildId/modules/reaction-roles/publish
  // -------------------------------------------------------------------------
  app.post<{ Params: { guildId: string } }>(
    '/guilds/:guildId/modules/reaction-roles/publish',
    async (request, reply: FastifyReply) => {
      const { guildId } = request.params;
      const session = await requireGuildAdmin(app, request, guildId, options.discord);

      if (!options.discordService) {
        return reply.code(503).send({ reason: 'service-indisponible' });
      }

      const parseResult = publishBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({ reason: 'body-invalide', details: parseResult.error.issues });
      }

      const body = parseResult.data;
      const discordService = options.discordService;
      const typedGuildId = assertGuildId(guildId);
      const typedChannelId = assertChannelId(body.channelId);

      // Étape 1 : créer les rôles manquants
      const resolvedPairs: ResolvedPair[] = [];
      for (const pair of body.pairs) {
        let roleId: RoleId;
        if (pair.roleId !== undefined) {
          roleId = assertRoleId(pair.roleId);
        } else {
          // roleName est garanti présent par le refine
          try {
            const created = await discordService.createRole(typedGuildId, {
              name: pair.roleName as string,
              mentionable: true,
            });
            roleId = created.id;
          } catch (error) {
            request.log.warn({ err: error }, 'reaction-roles: createRole a échoué');
            if (error instanceof DiscordSendError) {
              return reply.code(502).send({
                reason: 'role-creation-failed',
                detail: error.reason === 'unknown' ? error.message : error.reason,
              });
            }
            return reply.code(500).send({
              reason: 'unknown',
              detail: error instanceof Error ? error.message : String(error),
            });
          }
        }
        resolvedPairs.push({ emoji: pair.emoji as Emoji, roleId });
      }

      // Étape 2 : poster le message
      let postedMessageId: MessageId;
      try {
        const posted = await discordService.postMessage(typedChannelId, body.message);
        postedMessageId = posted.id;
      } catch (error) {
        request.log.warn({ err: error }, 'reaction-roles: postMessage a échoué');
        if (error instanceof DiscordSendError) {
          return reply.code(502).send({
            reason: error.reason,
            ...(error.reason === 'unknown' ? { detail: error.message } : {}),
          });
        }
        return reply.code(500).send({
          reason: 'unknown',
          detail: error instanceof Error ? error.message : String(error),
        });
      }

      // Étape 3 : ajouter les réactions (50 ms entre chaque)
      for (const pair of resolvedPairs) {
        try {
          await discordService.addReaction(typedChannelId, postedMessageId, pair.emoji);
        } catch (error) {
          request.log.warn({ err: error }, 'reaction-roles: addReaction (publish) a échoué');
          if (error instanceof DiscordSendError) {
            return reply.code(502).send({
              reason: error.reason,
              ...(error.reason === 'unknown' ? { detail: error.message } : {}),
            });
          }
          return reply.code(500).send({
            reason: 'unknown',
            detail: error instanceof Error ? error.message : String(error),
          });
        }
        await new Promise((r) => setTimeout(r, 50));
      }

      // Étape 4 : lire la config existante et persister
      let snapshot: unknown = {};
      try {
        snapshot = await options.config.get(typedGuildId);
      } catch {
        snapshot = {};
      }

      const existingMessages = extractMessages(snapshot);
      const newEntry: RRMessage = {
        id: randomUUID(),
        label: body.label,
        channelId: body.channelId,
        messageId: postedMessageId,
        message: body.message,
        mode: body.mode,
        feedback: body.feedback,
        pairs: resolvedPairs,
      };

      await options.config.setWith(
        typedGuildId,
        {
          modules: { 'reaction-roles': { version: 1, messages: [...existingMessages, newEntry] } },
        },
        { scope: 'modules.reaction-roles', updatedBy: session.userId as UserId },
      );

      return reply.code(201).send({ id: newEntry.id, messageId: postedMessageId });
    },
  );

  // -------------------------------------------------------------------------
  // POST /guilds/:guildId/modules/reaction-roles/:messageId/sync
  // -------------------------------------------------------------------------
  app.post<{ Params: { guildId: string; messageId: string } }>(
    '/guilds/:guildId/modules/reaction-roles/:messageId/sync',
    async (request, reply: FastifyReply) => {
      const { guildId, messageId } = request.params;
      const session = await requireGuildAdmin(app, request, guildId, options.discord);

      if (!options.discordService) {
        return reply.code(503).send({ reason: 'service-indisponible' });
      }

      const parseResult = syncBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({ reason: 'body-invalide', details: parseResult.error.issues });
      }

      const body = parseResult.data;
      const discordService = options.discordService;
      const typedGuildId = assertGuildId(guildId);

      // Lire la config existante
      let snapshot: unknown = {};
      try {
        snapshot = await options.config.get(typedGuildId);
      } catch {
        snapshot = {};
      }

      const existingMessages = extractMessages(snapshot);
      const entryIndex = existingMessages.findIndex((m) => m.messageId === messageId);
      if (entryIndex === -1) {
        return reply.code(404).send({ reason: 'message-not-found' });
      }

      const existingEntry = existingMessages[entryIndex] as RRMessage;
      const channelChanged = body.channelId !== existingEntry.channelId;

      // Résoudre les nouveaux rôles manquants (avant tout side-effect Discord)
      const resolvedNewPairs: ResolvedPair[] = [];
      for (const pair of body.pairs) {
        let roleId: RoleId;
        if (pair.roleId !== undefined) {
          roleId = assertRoleId(pair.roleId);
        } else {
          try {
            const created = await discordService.createRole(typedGuildId, {
              name: pair.roleName as string,
              mentionable: true,
            });
            roleId = created.id;
          } catch (error) {
            request.log.warn({ err: error }, 'reaction-roles: createRole a échoué');
            if (error instanceof DiscordSendError) {
              return reply.code(502).send({
                reason: 'role-creation-failed',
                detail: error.reason === 'unknown' ? error.message : error.reason,
              });
            }
            return reply.code(500).send({
              reason: 'unknown',
              detail: error instanceof Error ? error.message : String(error),
            });
          }
        }
        resolvedNewPairs.push({ emoji: pair.emoji as Emoji, roleId });
      }

      // Cas A : changement de salon → delete-old + post-new + reactions
      if (channelChanged) {
        const oldChannelId = assertChannelId(existingEntry.channelId);
        const oldMessageId = assertMessageId(existingEntry.messageId);
        const newChannelId = assertChannelId(body.channelId);

        try {
          await discordService.deleteMessage(oldChannelId, oldMessageId);
        } catch (error) {
          if (!(error instanceof DiscordSendError && error.reason === 'message-not-found')) {
            request.log.warn(
              { err: error, oldChannelId, oldMessageId },
              'reaction-roles: deleteMessage (sync, channel change) a échoué — on continue',
            );
          }
        }

        let postedMessageId: MessageId;
        try {
          const posted = await discordService.postMessage(newChannelId, body.message);
          postedMessageId = posted.id;
        } catch (error) {
          request.log.warn({ err: error }, 'reaction-roles: postMessage (sync) a échoué');
          if (error instanceof DiscordSendError) {
            return reply.code(502).send({
              reason: error.reason,
              ...(error.reason === 'unknown' ? { detail: error.message } : {}),
            });
          }
          return reply.code(500).send({
            reason: 'unknown',
            detail: error instanceof Error ? error.message : String(error),
          });
        }

        for (const pair of resolvedNewPairs) {
          try {
            await discordService.addReaction(newChannelId, postedMessageId, pair.emoji);
          } catch (error) {
            request.log.warn(
              { err: error },
              'reaction-roles: addReaction (sync, channel change) a échoué',
            );
            if (error instanceof DiscordSendError) {
              return reply.code(502).send({
                reason: error.reason,
                ...(error.reason === 'unknown' ? { detail: error.message } : {}),
              });
            }
            return reply.code(500).send({
              reason: 'unknown',
              detail: error instanceof Error ? error.message : String(error),
            });
          }
          await new Promise((r) => setTimeout(r, 50));
        }

        const movedEntry: RRMessage = {
          id: existingEntry.id,
          label: body.label,
          channelId: body.channelId,
          messageId: postedMessageId,
          message: body.message,
          mode: body.mode,
          feedback: body.feedback,
          pairs: resolvedNewPairs,
        };
        const updatedMessages = existingMessages.map((m, i) => (i === entryIndex ? movedEntry : m));
        await options.config.setWith(
          typedGuildId,
          { modules: { 'reaction-roles': { version: 1, messages: updatedMessages } } },
          { scope: 'modules.reaction-roles', updatedBy: session.userId as UserId },
        );
        return reply.code(200).send({
          added: resolvedNewPairs.length,
          removed: existingEntry.pairs.length,
          channelChanged: true,
          messageId: postedMessageId,
        });
      }

      // Cas B : même salon → diff réactions + édition contenu si modifié
      const typedChannelId = assertChannelId(existingEntry.channelId);
      const typedMessageId = assertMessageId(messageId);

      // Édition du contenu si modifié
      if (body.message !== existingEntry.message) {
        try {
          await discordService.editMessage(typedChannelId, typedMessageId, body.message);
        } catch (error) {
          request.log.warn({ err: error }, 'reaction-roles: editMessage a échoué');
          if (error instanceof DiscordSendError) {
            return reply.code(502).send({
              reason: error.reason,
              ...(error.reason === 'unknown' ? { detail: error.message } : {}),
            });
          }
          return reply.code(500).send({
            reason: 'unknown',
            detail: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const oldByKey = new Map<string, ResolvedPair>(
        existingEntry.pairs.map((p) => [emojiKey(p.emoji), p]),
      );
      const newByKey = new Map<string, ResolvedPair>(
        resolvedNewPairs.map((p) => [emojiKey(p.emoji), p]),
      );
      const toAdd = resolvedNewPairs.filter((p) => !oldByKey.has(emojiKey(p.emoji)));
      const toRemove = existingEntry.pairs.filter((p) => !newByKey.has(emojiKey(p.emoji)));

      for (const pair of toAdd) {
        try {
          await discordService.addReaction(typedChannelId, typedMessageId, pair.emoji);
        } catch (error) {
          request.log.warn({ err: error }, 'reaction-roles: addReaction (sync) a échoué');
          if (error instanceof DiscordSendError) {
            return reply.code(502).send({
              reason: error.reason,
              ...(error.reason === 'unknown' ? { detail: error.message } : {}),
            });
          }
          return reply.code(500).send({
            reason: 'unknown',
            detail: error instanceof Error ? error.message : String(error),
          });
        }
        await new Promise((r) => setTimeout(r, 50));
      }

      for (const pair of toRemove) {
        try {
          await discordService.removeOwnReaction(typedChannelId, typedMessageId, pair.emoji);
        } catch (error) {
          request.log.warn({ err: error }, 'reaction-roles: removeOwnReaction (sync) a échoué');
          if (error instanceof DiscordSendError) {
            return reply.code(502).send({
              reason: error.reason,
              ...(error.reason === 'unknown' ? { detail: error.message } : {}),
            });
          }
          return reply.code(500).send({
            reason: 'unknown',
            detail: error instanceof Error ? error.message : String(error),
          });
        }
        await new Promise((r) => setTimeout(r, 50));
      }

      const updatedEntry: RRMessage = {
        ...existingEntry,
        label: body.label,
        message: body.message,
        mode: body.mode,
        feedback: body.feedback,
        pairs: resolvedNewPairs,
      };
      const updatedMessages = existingMessages.map((m, i) => (i === entryIndex ? updatedEntry : m));
      await options.config.setWith(
        typedGuildId,
        { modules: { 'reaction-roles': { version: 1, messages: updatedMessages } } },
        { scope: 'modules.reaction-roles', updatedBy: session.userId as UserId },
      );

      return reply.code(200).send({
        added: toAdd.length,
        removed: toRemove.length,
        channelChanged: false,
      });
    },
  );

  // -------------------------------------------------------------------------
  // DELETE /guilds/:guildId/modules/reaction-roles/:messageId
  // -------------------------------------------------------------------------
  app.delete<{ Params: { guildId: string; messageId: string } }>(
    '/guilds/:guildId/modules/reaction-roles/:messageId',
    async (request, reply: FastifyReply) => {
      const { guildId, messageId } = request.params;
      const session = await requireGuildAdmin(app, request, guildId, options.discord);
      const typedGuildId = assertGuildId(guildId);

      let snapshot: unknown = {};
      try {
        snapshot = await options.config.get(typedGuildId);
      } catch {
        snapshot = {};
      }

      const existingMessages = extractMessages(snapshot);
      const entryIndex = existingMessages.findIndex((m) => m.messageId === messageId);
      if (entryIndex === -1) {
        return reply.code(404).send({ reason: 'message-not-found' });
      }

      const entry = existingMessages[entryIndex] as RRMessage;

      // Tentative de suppression du message Discord. Un message déjà
      // supprimé manuellement (message-not-found) est considéré comme un
      // succès. Les autres erreurs de suppression sont loggées mais ne
      // bloquent pas le nettoyage de la config (sinon l'admin se retrouve
      // avec une entrée orpheline qu'il ne peut pas supprimer).
      if (options.discordService) {
        try {
          await options.discordService.deleteMessage(
            assertChannelId(entry.channelId),
            assertMessageId(entry.messageId),
          );
        } catch (error) {
          if (error instanceof DiscordSendError && error.reason !== 'message-not-found') {
            request.log.warn(
              { err: error, messageId, channelId: entry.channelId },
              'reaction-roles: deleteMessage Discord a échoué — la config sera tout de même nettoyée',
            );
          }
        }
      }

      const remaining = existingMessages.filter((_, i) => i !== entryIndex);
      await options.config.setWith(
        typedGuildId,
        { modules: { 'reaction-roles': { version: 1, messages: remaining } } },
        { scope: 'modules.reaction-roles', updatedBy: session.userId as UserId },
      );

      return reply.code(204).send();
    },
  );
}
