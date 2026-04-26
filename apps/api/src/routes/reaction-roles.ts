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
 * Préfixe `customId` posé par le module reaction-roles V2 sur ses
 * boutons. Format : `rr:<entryUuid>:<roleSnowflake>`. Identique au
 * prefix exporté par le module — on réplique ici pour ne pas créer de
 * dépendance run-time du package API sur le module reaction-roles.
 */
const RR_CUSTOM_ID_PREFIX = 'rr:';

/** Mappe les styles applicatifs vers les valeurs numériques discord.js. */
const BUTTON_STYLE_VALUES: Readonly<
  Record<'primary' | 'secondary' | 'success' | 'danger', number>
> = {
  primary: 1,
  secondary: 2,
  success: 3,
  danger: 4,
};

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

const buttonStyleSchema = z.enum(['primary', 'secondary', 'success', 'danger']);
const pairKindSchema = z.enum(['reaction', 'button']).default('reaction');

const pairSchema = z
  .object({
    /** Type de l'élément. Défaut `reaction` pour rétro-compat. */
    kind: pairKindSchema,
    emoji: emojiSchema,
    roleId: z
      .string()
      .regex(/^\d{17,19}$/)
      .optional(),
    roleName: z.string().min(1).max(100).optional(),
    /** Texte du bouton (kind=button uniquement). Ignoré sinon. */
    label: z.string().max(80).default(''),
    /** Couleur du bouton (kind=button uniquement). Ignoré sinon. */
    style: buttonStyleSchema.default('secondary'),
  })
  .refine((p) => p.roleId !== undefined || p.roleName !== undefined, {
    message: 'Chaque paire doit avoir roleId ou roleName.',
  });

/**
 * Body partagé entre publish et sync. `feedback: 'ephemeral'` exige
 * qu'au moins une paire soit `kind: 'button'` (Discord ne permet pas
 * les réponses éphémères en réponse à une réaction emoji).
 */
const baseBodyShape = {
  label: z.string().min(1).max(64),
  channelId: z.string().regex(/^\d{17,19}$/),
  message: z.string().min(1).max(2000),
  mode: z.enum(['normal', 'unique', 'verifier']),
  feedback: z.enum(['dm', 'ephemeral', 'none']).default('dm'),
  pairs: z.array(pairSchema).min(1).max(20),
} as const;

const ephemeralRequiresAtLeastOneButton = (body: {
  feedback: 'dm' | 'ephemeral' | 'none';
  pairs: ReadonlyArray<{ kind: 'reaction' | 'button' }>;
}): boolean => body.feedback !== 'ephemeral' || body.pairs.some((p) => p.kind === 'button');

const publishBodySchema = z.object(baseBodyShape).refine(ephemeralRequiresAtLeastOneButton, {
  message: "Le feedback 'ephemeral' nécessite au moins une paire kind: 'button'.",
  path: ['feedback'],
});

const syncBodySchema = z.object(baseBodyShape).refine(ephemeralRequiresAtLeastOneButton, {
  message: "Le feedback 'ephemeral' nécessite au moins une paire kind: 'button'.",
  path: ['feedback'],
});

// ---------------------------------------------------------------------------
// Types internes
// ---------------------------------------------------------------------------

type ButtonStyle = 'primary' | 'secondary' | 'success' | 'danger';
type PairKind = 'reaction' | 'button';

interface ResolvedPair {
  readonly kind: PairKind;
  readonly emoji: Emoji;
  readonly roleId: RoleId;
  /** Pertinent uniquement pour `kind: 'button'`. Vide → fallback nom du rôle. */
  readonly label: string;
  /** Pertinent uniquement pour `kind: 'button'`. */
  readonly style: ButtonStyle;
}

interface RRMessage {
  readonly id: string;
  readonly label: string;
  readonly channelId: string;
  readonly messageId: string;
  readonly message: string;
  readonly mode: 'normal' | 'unique' | 'verifier';
  readonly feedback: 'dm' | 'ephemeral' | 'none';
  readonly pairs: readonly ResolvedPair[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalise une entrée historique : pose un `kind` par paire si absent
 * (`'button'` quand l'entrée portait l'ancien `kind: 'buttons'` au
 * niveau message, sinon `'reaction'`). Idempotent — une entrée déjà
 * au format pair-level passe inchangée. Symétrique de la migration
 * Zod côté module reaction-roles.
 */
const normalizeMessage = (raw: Record<string, unknown>): RRMessage => {
  const messageKind = raw['kind'];
  const fallbackPairKind: PairKind = messageKind === 'buttons' ? 'button' : 'reaction';
  const pairs = Array.isArray(raw['pairs'])
    ? (raw['pairs'] as ReadonlyArray<Record<string, unknown>>).map((p): ResolvedPair => {
        const kind = (p['kind'] as PairKind | undefined) ?? fallbackPairKind;
        const emoji = p['emoji'] as Emoji;
        const roleId = p['roleId'] as RoleId;
        const label = typeof p['label'] === 'string' ? (p['label'] as string) : '';
        const style =
          typeof p['style'] === 'string' && (p['style'] as string) in BUTTON_STYLE_VALUES
            ? (p['style'] as ButtonStyle)
            : 'secondary';
        return { kind, emoji, roleId, label, style };
      })
    : [];
  return {
    id: String(raw['id'] ?? ''),
    label: String(raw['label'] ?? ''),
    channelId: String(raw['channelId'] ?? ''),
    messageId: String(raw['messageId'] ?? ''),
    message: typeof raw['message'] === 'string' ? (raw['message'] as string) : '',
    mode: (raw['mode'] as RRMessage['mode']) ?? 'normal',
    feedback: (raw['feedback'] as RRMessage['feedback']) ?? 'dm',
    pairs,
  };
};

/** Extrait le tableau de messages de la config persistée. */
const extractMessages = (snapshot: unknown): RRMessage[] => {
  if (typeof snapshot !== 'object' || snapshot === null) return [];
  const modules = (snapshot as { modules?: unknown }).modules;
  if (typeof modules !== 'object' || modules === null) return [];
  const rr = (modules as Record<string, unknown>)['reaction-roles'];
  if (typeof rr !== 'object' || rr === null) return [];
  const msgs = (rr as { messages?: unknown }).messages;
  if (!Array.isArray(msgs)) return [];
  return (msgs as ReadonlyArray<unknown>)
    .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null)
    .map(normalizeMessage);
};

/** Clé unique d'un emoji, pour le diff. */
const emojiKey = (emoji: Emoji): string =>
  emoji.type === 'unicode' ? `u:${emoji.value}` : `c:${emoji.id}`;

/**
 * Construit la liste de composants `ActionRow` à partir des paires
 * `kind: 'button'`. Les paires `kind: 'reaction'` sont ignorées —
 * elles seront posées séparément via `addReaction`. Discord limite à
 * 5 boutons par row et 5 rows par message ; les `pairs` sont déjà
 * cappées à 20 (== 4 rows max). `entryId` est l'UUID stable de
 * l'entrée — il préfixe les `customId` pour permettre au runtime du
 * module de retrouver la paire sans aller-retour DB sur chaque click.
 */
const buildButtonComponents = (
  entryId: string,
  pairs: readonly ResolvedPair[],
): ReadonlyArray<unknown> => {
  const buttonPairs = pairs.filter((p) => p.kind === 'button');
  if (buttonPairs.length === 0) return [];
  const rows: unknown[] = [];
  for (let i = 0; i < buttonPairs.length; i += 5) {
    const slice = buttonPairs.slice(i, i + 5);
    rows.push({
      type: 1, // ActionRow
      components: slice.map((p) => {
        const emoji =
          p.emoji.type === 'unicode'
            ? { name: p.emoji.value }
            : { id: p.emoji.id, name: p.emoji.name, animated: p.emoji.animated };
        return {
          type: 2, // Button
          style: BUTTON_STYLE_VALUES[p.style],
          custom_id: `${RR_CUSTOM_ID_PREFIX}${entryId}:${p.roleId}`,
          ...(p.label.length > 0 ? { label: p.label } : {}),
          emoji,
        };
      }),
    });
  }
  return rows;
};

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
        resolvedPairs.push({
          kind: pair.kind,
          emoji: pair.emoji as Emoji,
          roleId,
          label: pair.label,
          style: pair.style,
        });
      }

      // Génère l'entryId avant de poster — le customId des boutons doit
      // l'embarquer pour permettre au runtime du module de retrouver
      // la paire sans aller-retour DB sur chaque click.
      const entryId = randomUUID();
      const components = buildButtonComponents(entryId, resolvedPairs);
      const reactionPairs = resolvedPairs.filter((p) => p.kind === 'reaction');

      // Étape 2 : poster le message — avec composants si au moins une
      // paire est `kind: 'button'`.
      let postedMessageId: MessageId;
      try {
        const posted = await discordService.postMessage(
          typedChannelId,
          body.message,
          components.length > 0 ? { components } : undefined,
        );
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

      // Étape 3 : ajouter les réactions pour les paires `kind: 'reaction'`
      // (50 ms entre chaque pour respecter le rate-limit Discord).
      for (const pair of reactionPairs) {
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
        id: entryId,
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
        resolvedNewPairs.push({
          kind: pair.kind,
          emoji: pair.emoji as Emoji,
          roleId,
          label: pair.label,
          style: pair.style,
        });
      }

      const newComponents = buildButtonComponents(existingEntry.id, resolvedNewPairs);
      const newReactionPairs = resolvedNewPairs.filter((p) => p.kind === 'reaction');
      const oldReactionPairs = existingEntry.pairs.filter((p) => p.kind === 'reaction');

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
          const posted = await discordService.postMessage(
            newChannelId,
            body.message,
            newComponents.length > 0 ? { components: newComponents } : undefined,
          );
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

        for (const pair of newReactionPairs) {
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

      // Cas B : même salon → édition contenu (et composants si la
      // composition de boutons a changé) + diff des réactions emoji.
      const typedChannelId = assertChannelId(existingEntry.channelId);
      const typedMessageId = assertMessageId(messageId);

      // Toujours réécrire les composants : leur état de référence est
      // la config dashboard, pas Discord. Si toutes les paires sont
      // `kind: 'reaction'`, on passe `components: []` pour vider une
      // éventuelle barre de boutons précédente.
      try {
        await discordService.editMessage(typedChannelId, typedMessageId, body.message, {
          components: newComponents,
        });
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

      // Diff des réactions emoji uniquement (les boutons sont déjà
      // synchronisés via editMessage).
      const oldReactionByKey = new Map<string, ResolvedPair>(
        oldReactionPairs.map((p) => [emojiKey(p.emoji), p]),
      );
      const newReactionByKey = new Map<string, ResolvedPair>(
        newReactionPairs.map((p) => [emojiKey(p.emoji), p]),
      );
      const toAdd = newReactionPairs.filter((p) => !oldReactionByKey.has(emojiKey(p.emoji)));
      const toRemove = oldReactionPairs.filter((p) => !newReactionByKey.has(emojiKey(p.emoji)));

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
