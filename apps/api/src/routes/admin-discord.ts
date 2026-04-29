import type { Logger, UserId } from '@varde/contracts';
import {
  type DiscordReconnectService,
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
 * Routes `/admin/discord/*` (jalon 7 PR 7.2). Surface admin pour
 * lire et modifier les credentials Discord à chaud, post-setup, sans
 * rejouer le wizard.
 *
 * Cinq endpoints :
 *
 * - `GET /admin/discord` — état courant : appId, publicKey,
 *   `tokenLastFour` (4 derniers caractères du token déchiffré),
 *   `hasClientSecret` (booléen), `intents` (vivement queryés via
 *   `/applications/@me` côté Discord, `null` si pas de token ou
 *   Discord injoignable). Le token complet ne fuit jamais ici.
 *
 * - `POST /admin/discord/reveal-token` — exige `{ confirmation: true }`,
 *   retourne le token bot complet une seule fois. Loggué en `warn`
 *   pour matérialiser l'événement sensible.
 *
 * - `PUT /admin/discord/app` body `{ appId, publicKey }` — revalide
 *   via `/applications/{id}/rpc` (même check que `POST
 *   /setup/discord-app`), persiste si OK.
 *
 * - `PUT /admin/discord/token` body `{ token, confirmAppChange? }` —
 *   valide le nouveau token via `/users/@me` puis lit l'app ID
 *   associé via `/applications/@me`. Si l'app ID diffère de celui
 *   persisté, refuse avec `409 app_id_mismatch` sauf si le client
 *   passe `confirmAppChange: true`. Quand confirmé, on persiste à la
 *   fois le nouveau token *et* le nouvel `discordAppId` — c'est
 *   précisément ce qu'a confirmé le client. La reconnexion gateway
 *   à chaud est portée par sub-livrable 5 (`discordReconnectService`)
 *   et viendra brancher un handler `onCredentialsChanged` sur cette
 *   route.
 *
 * - `PUT /admin/discord/oauth` body `{ clientSecret }` — revalide
 *   via `client_credentials` sur `/oauth2/token` (même check que
 *   `POST /setup/oauth`), persiste si OK. L'invalidation des
 *   sessions Auth.js actives est portée par sub-livrable 6 (whitelist
 *   callback dynamique).
 *
 * Aucune mutation ne touche `setup_completed_at` ni ne fait
 * reculer `setup_step` — l'instance reste « configured » pendant
 * toute la vie de l'admin. Les écritures passent par
 * `setStep(currentStep, patch)` pour respecter le contrat monotone
 * du service.
 *
 * **Audit** : pour cette PR, on logue chaque opération sensible via
 * Pino (`log.warn` pour les rotations de credentials, `log.info`
 * pour les lectures). L'extension du journal d'audit aux events
 * scope-instance (`instance.token.rotated`, etc.) est un chantier
 * séparé — l'`auditService` actuel exige un `guildId` et il vaut
 * mieux le faire évoluer avec un ADR plutôt qu'à la sauvette ici.
 */

const appBodySchema = z.object({
  appId: z.string().regex(/^\d{17,20}$/, 'appId doit être un snowflake Discord (17-20 chiffres)'),
  publicKey: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'publicKey doit être un hex Ed25519 sur 64 caractères'),
});

const tokenBodySchema = z.object({
  token: z.string().min(20, 'token bot Discord trop court'),
  confirmAppChange: z.boolean().optional(),
});

const oauthBodySchema = z.object({
  clientSecret: z.string().min(8, 'clientSecret trop court'),
});

const revealBodySchema = z.object({
  confirmation: z.literal(true),
});

const rpcResponseSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
});

const botUserSchema = z.object({
  id: z.string(),
  username: z.string(),
});

const applicationInfoSchema = z.object({
  id: z.string(),
  flags: z.number().int(),
});

/** Bits Application.flags qui matérialisent l'activation des intents privilégiés. */
const INTENT_BITS = {
  presence: [1 << 12, 1 << 13],
  members: [1 << 14, 1 << 15],
  messageContent: [1 << 18, 1 << 19],
} as const satisfies Readonly<Record<string, readonly number[]>>;

/** Snapshot live des intents privilégiés de l'application Discord. */
export interface AdminDiscordIntents {
  readonly presence: boolean;
  readonly members: boolean;
  readonly messageContent: boolean;
}

/** Réponse de `GET /admin/discord`. */
export interface AdminDiscordResponse {
  readonly appId: string | null;
  readonly publicKey: string | null;
  /** Quatre derniers caractères du token bot, ou `null` si absent. */
  readonly tokenLastFour: string | null;
  readonly hasClientSecret: boolean;
  /** `null` si pas de token ou Discord injoignable. */
  readonly intents: AdminDiscordIntents | null;
}

/** Réponse de `POST /admin/discord/reveal-token`. */
export interface AdminRevealTokenResponse {
  readonly token: string;
}

/** Options de construction. */
export interface RegisterAdminDiscordRoutesOptions {
  readonly ownership: OwnershipService;
  readonly instanceConfig: InstanceConfigService;
  readonly logger: Logger;
  readonly fetchImpl?: FetchLike;
  readonly discordBaseUrl?: string;
  /**
   * Service de reconnexion gateway. Quand fourni, `PUT
   * /admin/discord/token` l'appelle après validation Discord et
   * **avant** persistance — c'est précisément cette discipline qui
   * matérialise le rollback : un échec de reconnexion implique que
   * le token n'est jamais persisté, l'instance reste sur l'ancien.
   * Quand absent (tests, instance sans bot live), le route
   * persiste directement après validation Discord (cas de la PR
   * 7.1 et antérieur). Câblé par `apps/server/src/bin.ts` une fois
   * le client Discord initialisé.
   */
  readonly reconnect?: DiscordReconnectService;
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

const computeIntents = (flags: number): AdminDiscordIntents => ({
  presence: INTENT_BITS.presence.some((bit) => (flags & bit) !== 0),
  members: INTENT_BITS.members.some((bit) => (flags & bit) !== 0),
  messageContent: INTENT_BITS.messageContent.some((bit) => (flags & bit) !== 0),
});

export function registerAdminDiscordRoutes(
  app: FastifyInstance,
  options: RegisterAdminDiscordRoutesOptions,
): void {
  const { ownership, instanceConfig, logger, reconnect, instanceAudit } = options;
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch.bind(globalThis) as FetchLike);
  const discordBaseUrl = options.discordBaseUrl ?? 'https://discord.com/api/v10';
  const log = logger.child({ component: 'admin-discord' });

  /**
   * Lecture live des intents via `GET /applications/@me`. Retourne
   * `null` si Discord est injoignable ou retourne un statut d'erreur
   * — le GET admin ne doit pas casser quand Discord rame, l'UI se
   * contente d'afficher « inconnu ».
   */
  const fetchIntents = async (token: string): Promise<AdminDiscordIntents | null> => {
    let response: Response;
    try {
      response = await fetchImpl(`${discordBaseUrl}/applications/@me`, {
        method: 'GET',
        headers: { authorization: `Bot ${token}`, accept: 'application/json' },
      });
    } catch (err) {
      log.warn('Discord unreachable on /applications/@me', { error: errorDetail(err) });
      return null;
    }
    if (!response.ok) {
      log.warn('Discord returned non-OK on /applications/@me', { status: response.status });
      return null;
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return null;
    }
    const parsed = applicationInfoSchema.safeParse(body);
    if (!parsed.success) {
      return null;
    }
    return computeIntents(parsed.data.flags);
  };

  app.get('/admin/discord', async (request): Promise<AdminDiscordResponse> => {
    await requireOwner(app, request, ownership);
    const config = await instanceConfig.getConfig();
    const tokenLastFour =
      config.discordBotToken !== null && config.discordBotToken.length >= 4
        ? config.discordBotToken.slice(-4)
        : null;
    const intents =
      config.discordBotToken !== null ? await fetchIntents(config.discordBotToken) : null;
    return {
      appId: config.discordAppId,
      publicKey: config.discordPublicKey,
      tokenLastFour,
      hasClientSecret: config.discordClientSecret !== null,
      intents,
    };
  });

  app.post('/admin/discord/reveal-token', async (request): Promise<AdminRevealTokenResponse> => {
    const session = await requireOwner(app, request, ownership);
    const parsed = revealBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw httpError(400, 'invalid_body', 'Body invalide.', parsed.error.issues);
    }
    const config = await instanceConfig.getConfig();
    if (config.discordBotToken === null) {
      throw httpError(400, 'missing_bot_token', 'Token bot absent.');
    }
    log.warn('Admin revealed bot token', { ownerId: session.userId });
    await instanceAudit?.log({
      action: INSTANCE_AUDIT_ACTIONS.TOKEN_REVEALED,
      actor: { type: 'user', id: session.userId as UserId },
      severity: 'warn',
    });
    return { token: config.discordBotToken };
  });

  app.put('/admin/discord/app', async (request): Promise<AdminDiscordResponse> => {
    const session = await requireOwner(app, request, ownership);
    const parsed = appBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw httpError(400, 'invalid_body', 'Body invalide.', parsed.error.issues);
    }
    const { appId, publicKey } = parsed.data;

    let response: Response;
    try {
      response = await fetchImpl(`${discordBaseUrl}/applications/${appId}/rpc`, {
        method: 'GET',
        headers: { accept: 'application/json' },
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
        404,
        'discord_app_not_found',
        `Aucune application Discord trouvée pour l'ID ${appId}.`,
      );
    }
    if (!response.ok) {
      throw httpError(
        502,
        'discord_unreachable',
        `Discord a répondu ${response.status} sur /applications/${appId}/rpc.`,
      );
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw httpError(502, 'discord_unreachable', 'Réponse Discord non parseable.');
    }
    const rpc = rpcResponseSchema.safeParse(body);
    if (!rpc.success) {
      throw httpError(502, 'discord_unreachable', 'Réponse Discord inattendue : `name` manquant.');
    }

    const config = await instanceConfig.getConfig();
    await instanceConfig.setStep(config.setupStep, {
      discordAppId: appId,
      discordPublicKey: publicKey,
    });
    log.warn('Admin updated Discord app credentials', { ownerId: session.userId, appId });
    await instanceAudit?.log({
      action: INSTANCE_AUDIT_ACTIONS.APP_UPDATED,
      actor: { type: 'user', id: session.userId as UserId },
      severity: 'warn',
      target: { type: 'discord_app', id: appId },
    });

    const after = await instanceConfig.getConfig();
    const tokenLastFour =
      after.discordBotToken !== null && after.discordBotToken.length >= 4
        ? after.discordBotToken.slice(-4)
        : null;
    const intents =
      after.discordBotToken !== null ? await fetchIntents(after.discordBotToken) : null;
    return {
      appId: after.discordAppId,
      publicKey: after.discordPublicKey,
      tokenLastFour,
      hasClientSecret: after.discordClientSecret !== null,
      intents,
    };
  });

  app.put('/admin/discord/token', async (request): Promise<AdminDiscordResponse> => {
    const session = await requireOwner(app, request, ownership);
    const parsed = tokenBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw httpError(400, 'invalid_body', 'Body invalide.', parsed.error.issues);
    }
    const { token, confirmAppChange } = parsed.data;
    const authHeader = `Bot ${token}`;

    let meResponse: Response;
    try {
      meResponse = await fetchImpl(`${discordBaseUrl}/users/@me`, {
        method: 'GET',
        headers: { authorization: authHeader, accept: 'application/json' },
      });
    } catch (err) {
      throw httpError(
        502,
        'discord_unreachable',
        `Impossible d'atteindre Discord : ${errorDetail(err)}`,
      );
    }
    if (meResponse.status === 401 || meResponse.status === 403) {
      throw httpError(400, 'invalid_token', 'Token bot rejeté par Discord.');
    }
    if (!meResponse.ok) {
      throw httpError(
        502,
        'discord_unreachable',
        `Discord a répondu ${meResponse.status} sur /users/@me.`,
      );
    }
    let meBody: unknown;
    try {
      meBody = await meResponse.json();
    } catch {
      throw httpError(502, 'discord_unreachable', 'Réponse Discord non parseable.');
    }
    const meParsed = botUserSchema.safeParse(meBody);
    if (!meParsed.success) {
      throw httpError(
        502,
        'discord_unreachable',
        'Réponse Discord inattendue : forme `/users/@me` invalide.',
      );
    }

    let appResponse: Response;
    try {
      appResponse = await fetchImpl(`${discordBaseUrl}/applications/@me`, {
        method: 'GET',
        headers: { authorization: authHeader, accept: 'application/json' },
      });
    } catch (err) {
      throw httpError(
        502,
        'discord_unreachable',
        `Impossible d'atteindre Discord : ${errorDetail(err)}`,
      );
    }
    if (!appResponse.ok) {
      throw httpError(
        502,
        'discord_unreachable',
        `Discord a répondu ${appResponse.status} sur /applications/@me.`,
      );
    }
    let appBody: unknown;
    try {
      appBody = await appResponse.json();
    } catch {
      throw httpError(502, 'discord_unreachable', 'Réponse Discord non parseable.');
    }
    const appParsed = applicationInfoSchema.safeParse(appBody);
    if (!appParsed.success) {
      throw httpError(
        502,
        'discord_unreachable',
        'Réponse Discord inattendue : `id` ou `flags` manquant.',
      );
    }

    const newAppId = appParsed.data.id;
    const config = await instanceConfig.getConfig();
    const appChanged = config.discordAppId !== null && config.discordAppId !== newAppId;
    if (appChanged && confirmAppChange !== true) {
      throw httpError(
        409,
        'app_id_mismatch',
        'Ce token est associé à une autre Application Discord. Confirmez explicitement avec confirmAppChange:true.',
        { previousAppId: config.discordAppId, newAppId },
      );
    }

    // Reconnect gateway BEFORE persist — l'inversion de l'ordre
    // matérialise le rollback. Si le swap gateway échoue, on ne
    // touche pas à la DB et l'instance reste sur l'ancien token.
    if (reconnect) {
      const result = await reconnect.reconnect(token);
      if (!result.ok) {
        throw httpError(
          503,
          'reconnect_failed',
          `Reconnexion gateway refusée : ${result.error ?? 'inconnu'}.`,
        );
      }
    }

    const patch: { discordBotToken: string; discordAppId?: string } = { discordBotToken: token };
    if (appChanged) {
      patch.discordAppId = newAppId;
    }
    await instanceConfig.setStep(config.setupStep, patch);
    log.warn('Admin rotated bot token', {
      ownerId: session.userId,
      appChanged,
      ...(appChanged ? { previousAppId: config.discordAppId, newAppId } : {}),
    });
    await instanceAudit?.log({
      action: INSTANCE_AUDIT_ACTIONS.TOKEN_ROTATED,
      actor: { type: 'user', id: session.userId as UserId },
      severity: 'warn',
      metadata: appChanged
        ? { previousAppId: config.discordAppId, newAppId }
        : { appChanged: false },
    });

    const after = await instanceConfig.getConfig();
    const tokenLastFour =
      after.discordBotToken !== null && after.discordBotToken.length >= 4
        ? after.discordBotToken.slice(-4)
        : null;
    return {
      appId: after.discordAppId,
      publicKey: after.discordPublicKey,
      tokenLastFour,
      hasClientSecret: after.discordClientSecret !== null,
      intents: computeIntents(appParsed.data.flags),
    };
  });

  app.put('/admin/discord/oauth', async (request): Promise<AdminDiscordResponse> => {
    const session = await requireOwner(app, request, ownership);
    const parsed = oauthBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw httpError(400, 'invalid_body', 'Body invalide.', parsed.error.issues);
    }
    const { clientSecret } = parsed.data;

    const config = await instanceConfig.getConfig();
    if (config.discordAppId === null) {
      throw httpError(400, 'missing_app_id', 'Application ID absent.');
    }
    const clientId = config.discordAppId;

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'identify',
    }).toString();

    let response: Response;
    try {
      response = await fetchImpl(`${discordBaseUrl}/oauth2/token`, {
        method: 'POST',
        headers: {
          authorization: `Basic ${basicAuth}`,
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body,
      });
    } catch (err) {
      throw httpError(
        502,
        'discord_unreachable',
        `Impossible d'atteindre Discord : ${errorDetail(err)}`,
      );
    }
    if (response.status === 401) {
      throw httpError(400, 'invalid_secret', 'Client Secret rejeté par Discord.');
    }
    if (!response.ok) {
      throw httpError(
        502,
        'discord_unreachable',
        `Discord a répondu ${response.status} sur /oauth2/token.`,
      );
    }

    await instanceConfig.setStep(config.setupStep, { discordClientSecret: clientSecret });
    log.warn('Admin rotated OAuth client secret', { ownerId: session.userId });
    await instanceAudit?.log({
      action: INSTANCE_AUDIT_ACTIONS.OAUTH_ROTATED,
      actor: { type: 'user', id: session.userId as UserId },
      severity: 'warn',
    });

    const after = await instanceConfig.getConfig();
    const tokenLastFour =
      after.discordBotToken !== null && after.discordBotToken.length >= 4
        ? after.discordBotToken.slice(-4)
        : null;
    const intents =
      after.discordBotToken !== null ? await fetchIntents(after.discordBotToken) : null;
    return {
      appId: after.discordAppId,
      publicKey: after.discordPublicKey,
      tokenLastFour,
      hasClientSecret: after.discordClientSecret !== null,
      intents,
    };
  });
}
