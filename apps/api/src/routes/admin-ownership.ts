import type { Logger, UserId } from '@varde/contracts';
import { ConflictError } from '@varde/contracts';
import {
  INSTANCE_AUDIT_ACTIONS,
  type InstanceAuditService,
  type InstanceConfigService,
  type OwnershipService,
} from '@varde/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { FetchLike } from '../discord-client.js';
import { requireOwner } from '../middleware/require-owner.js';

/**
 * Routes ownership de l'admin instance (jalon 7 PR 7.2).
 *
 * Deux groupes de routes :
 *
 * 1. **`POST /admin/ownership/claim-first`** — public, idempotent.
 *    Appelé par le hook Auth.js v5 du dashboard à chaque login
 *    Discord pour absorber le cas démarrage frais où le premier
 *    user devient owner. Sécurité : voir doc en bas du module.
 *
 * 2. **`GET / POST / DELETE /admin/ownership[/:id]`** — gardées
 *    par `requireOwner`. Listent / ajoutent / retirent des owners.
 *    L'ajout valide d'abord l'existence du `discordUserId` côté
 *    Discord (`GET /users/{id}` avec le bot token déchiffré depuis
 *    `instance_config`), pour qu'un admin ne puisse pas s'ajouter
 *    un ID arbitraire qui n'existe pas.
 *
 * Toute opération réussie est loguée en niveau `info` (warn pour
 * `claim-first`) avec l'identité de l'owner appelant et la cible
 * — traçabilité d'ownership exigée par la doc PR 7.2.
 */

const DISCORD_API_BASE = 'https://discord.com/api/v10';

const snowflakeSchema = z
  .string()
  .regex(/^\d{17,20}$/u, 'doit être un snowflake Discord (17-20 chiffres)');

const claimFirstBodySchema = z.object({
  discordUserId: snowflakeSchema,
  username: z.string().min(1).max(100).optional(),
});

const addOwnerBodySchema = z.object({
  discordUserId: snowflakeSchema,
});

const deleteOwnerParamsSchema = z.object({
  discordUserId: snowflakeSchema,
});

const discordUserSchema = z.object({
  id: z.string(),
  username: z.string(),
});

/** Réponse de `POST /admin/ownership/claim-first`. */
export interface ClaimFirstOwnershipResponse {
  readonly claimed: boolean;
}

/** Forme publique d'un owner exposée par `GET /admin/ownership`. */
export interface OwnerDto {
  readonly discordUserId: string;
  readonly grantedAt: string;
  readonly grantedByDiscordUserId: string | null;
}

/** Réponse de `GET /admin/ownership`. */
export interface OwnersListResponse {
  readonly owners: readonly OwnerDto[];
}

/** Réponse de `POST /admin/ownership`. */
export interface AddOwnerResponse {
  readonly added: true;
}

/** Réponse de `DELETE /admin/ownership/:id`. */
export interface RemoveOwnerResponse {
  readonly removed: true;
}

/** Options de construction. */
export interface RegisterAdminOwnershipRoutesOptions {
  readonly ownership: OwnershipService;
  readonly instanceConfig: InstanceConfigService;
  readonly logger: Logger;
  /** Fetch injectable pour les tests. Défaut `globalThis.fetch`. */
  readonly fetchImpl?: FetchLike;
  /** Base URL Discord. Défaut `https://discord.com/api/v10`. */
  readonly discordBaseUrl?: string;
  /** Service d'audit instance-scoped. Optionnel. */
  readonly instanceAudit?: InstanceAuditService;
}

const httpError = (
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): Error & { statusCode: number; code: string; details?: unknown } => {
  const err = new Error(message) as Error & {
    statusCode: number;
    code: string;
    details?: unknown;
  };
  err.statusCode = statusCode;
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
};

const errorDetail = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Enregistre les routes `/admin/ownership/*`. Mélange volontairement
 * une route publique (`claim-first`) avec des routes gardées par
 * `requireOwner` — c'est la même URL family, et factoriser dans le
 * même module évite de dupliquer les schémas Zod / typages partagés.
 */
export function registerAdminOwnershipRoutes(
  app: FastifyInstance,
  options: RegisterAdminOwnershipRoutesOptions,
): void {
  const { ownership, instanceConfig, logger, instanceAudit } = options;
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch.bind(globalThis) as FetchLike);
  const discordBaseUrl = options.discordBaseUrl ?? DISCORD_API_BASE;
  const log = logger.child({ component: 'admin-ownership' });

  const claimFirstRateLimit = { max: 10, timeWindow: '1 minute' } as const;

  // ------------------------------------------------------------------
  // POST /admin/ownership/claim-first  — public, idempotent
  // ------------------------------------------------------------------

  // public-route: claim-first du wizard Auth.js — par construction sans session, idempotent post-claim, rate-limit 10 req/min/IP. Voir bloc-doc en tête du module.
  app.post(
    '/admin/ownership/claim-first',
    { config: { rateLimit: claimFirstRateLimit } },
    async (request): Promise<ClaimFirstOwnershipResponse> => {
      const parsed = claimFirstBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw httpError(400, 'invalid_body', 'Body invalide.', parsed.error.issues);
      }
      const { discordUserId, username } = parsed.data;
      const result = await ownership.claimFirstOwnership(discordUserId);
      if (result.claimed) {
        log.warn('Ownership claimed', {
          discordUserId,
          ...(username !== undefined ? { username } : {}),
        });
        await instanceAudit?.log({
          action: INSTANCE_AUDIT_ACTIONS.OWNER_CLAIMED,
          actor: { type: 'system' },
          severity: 'warn',
          target: { type: 'discord_user', id: discordUserId },
          ...(username !== undefined ? { metadata: { username } } : {}),
        });
      }
      return { claimed: result.claimed };
    },
  );

  // ------------------------------------------------------------------
  // GET /admin/ownership  — gardée
  // ------------------------------------------------------------------

  app.get('/admin/ownership', async (request): Promise<OwnersListResponse> => {
    await requireOwner(app, request, ownership);
    const owners = await ownership.getOwners();
    return {
      owners: owners.map((o) => ({
        discordUserId: o.discordUserId,
        grantedAt: o.grantedAt.toISOString(),
        grantedByDiscordUserId: o.grantedByDiscordUserId,
      })),
    };
  });

  // ------------------------------------------------------------------
  // POST /admin/ownership  — gardée + valide via Discord
  // ------------------------------------------------------------------

  app.post('/admin/ownership', async (request): Promise<AddOwnerResponse> => {
    const session = await requireOwner(app, request, ownership);
    const parsed = addOwnerBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw httpError(400, 'invalid_body', 'Body invalide.', parsed.error.issues);
    }
    const { discordUserId } = parsed.data;

    const config = await instanceConfig.getConfig();
    if (config.discordBotToken === null) {
      throw httpError(
        400,
        'missing_bot_token',
        "Token bot absent — l'instance n'a pas de token pour valider l'existence du user Discord.",
      );
    }

    let response: Response;
    try {
      response = await fetchImpl(`${discordBaseUrl}/users/${discordUserId}`, {
        method: 'GET',
        headers: {
          authorization: `Bot ${config.discordBotToken}`,
          accept: 'application/json',
        },
      });
    } catch (err) {
      throw httpError(
        502,
        'discord_unreachable',
        `Impossible d'atteindre Discord : ${errorDetail(err)}`,
      );
    }

    if (response.status === 404) {
      throw httpError(
        400,
        'invalid_user',
        `Aucun utilisateur Discord trouvé pour l'ID ${discordUserId}.`,
      );
    }
    if (!response.ok) {
      throw httpError(
        502,
        'discord_unreachable',
        `Discord a répondu ${response.status} sur /users/${discordUserId}.`,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw httpError(502, 'discord_unreachable', 'Réponse Discord non parseable.');
    }
    const userParsed = discordUserSchema.safeParse(body);
    if (!userParsed.success) {
      throw httpError(502, 'discord_unreachable', 'Réponse Discord inattendue.');
    }

    await ownership.addOwner(discordUserId, session.userId);
    log.info('Owner added', {
      discordUserId,
      grantedBy: session.userId,
      username: userParsed.data.username,
    });
    await instanceAudit?.log({
      action: INSTANCE_AUDIT_ACTIONS.OWNER_ADDED,
      actor: { type: 'user', id: session.userId as UserId },
      severity: 'info',
      target: { type: 'discord_user', id: discordUserId },
      metadata: { username: userParsed.data.username },
    });
    return { added: true };
  });

  // ------------------------------------------------------------------
  // DELETE /admin/ownership/:discordUserId  — gardée + interdit le dernier
  // ------------------------------------------------------------------

  app.delete<{ Params: { discordUserId: string } }>(
    '/admin/ownership/:discordUserId',
    async (request): Promise<RemoveOwnerResponse> => {
      const session = await requireOwner(app, request, ownership);
      const params = deleteOwnerParamsSchema.safeParse(request.params ?? {});
      if (!params.success) {
        throw httpError(400, 'invalid_params', 'Paramètre invalide.', params.error.issues);
      }
      const { discordUserId } = params.data;
      try {
        await ownership.removeOwner(discordUserId);
      } catch (err) {
        if (err instanceof ConflictError) {
          throw httpError(409, 'last_owner', err.message);
        }
        throw err;
      }
      log.info('Owner removed', { discordUserId, removedBy: session.userId });
      await instanceAudit?.log({
        action: INSTANCE_AUDIT_ACTIONS.OWNER_REMOVED,
        actor: { type: 'user', id: session.userId as UserId },
        severity: 'info',
        target: { type: 'discord_user', id: discordUserId },
      });
      return { removed: true };
    },
  );
}
