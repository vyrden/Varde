import type { Logger } from '@varde/contracts';
import type { InstanceConfigService, OwnershipService } from '@varde/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { FetchLike } from '../discord-client.js';
import { requireOwner } from '../middleware/require-owner.js';

/**
 * Routes `/admin/identity` (jalon 7 PR 7.2). Surface admin pour
 * lire et modifier l'identité du bot (nom, avatar, description) à
 * chaud, post-setup, sans rejouer le wizard.
 *
 * - `GET /admin/identity` retourne les valeurs persistées dans
 *   `instance_config`. Pas d'appel Discord — la dernière vérité
 *   acceptée vit en DB.
 * - `PUT /admin/identity` partial PATCH côté Discord
 *   (`PATCH /applications/@me`), persistance côté DB. Body vide =
 *   no-op explicite (pas d'appel Discord, retourne l'identité
 *   actuelle).
 *
 * Réutilise volontairement la mécanique de `POST /setup/identity`
 * (validation Zod, mapping erreurs, composition URL CDN avatar)
 * sans factoriser un helper commun pour cette PR — les deux
 * routes ont des préconditions différentes
 * (`requireUnconfigured` vs `requireOwner`) et le risque de
 * factor too early dépasse le bénéfice.
 *
 * **Rate limit Discord** : `PATCH /applications/@me` est rate
 * limité côté Discord (~ 2 req/min sur cet endpoint global). Un
 * 429 est propagé comme `429 rate_limited` avec `retry_after_ms`
 * pour que l'UI puisse afficher un timer.
 */

const identityBodySchema = z.object({
  name: z.string().min(1).max(32).optional(),
  avatar: z
    .string()
    .regex(/^data:image\/(png|jpe?g|gif);base64,/u, 'avatar doit être un data URI image')
    .optional(),
  description: z.string().max(400).optional(),
});

const applicationPatchSchema = z.object({
  id: z.string(),
  name: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
});

const rateLimitBodySchema = z.object({
  retry_after: z.number().nonnegative(),
});

/** Réponse de `GET /admin/identity` et `PUT /admin/identity`. */
export interface AdminIdentityResponse {
  readonly name: string | null;
  readonly description: string | null;
  readonly avatarUrl: string | null;
}

/** Options de construction. */
export interface RegisterAdminIdentityRoutesOptions {
  readonly ownership: OwnershipService;
  readonly instanceConfig: InstanceConfigService;
  readonly logger: Logger;
  readonly fetchImpl?: FetchLike;
  readonly discordBaseUrl?: string;
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

const buildAdminIdentityResponse = (
  name: string | null,
  description: string | null,
  avatarUrl: string | null,
): AdminIdentityResponse => ({ name, description, avatarUrl });

export function registerAdminIdentityRoutes(
  app: FastifyInstance,
  options: RegisterAdminIdentityRoutesOptions,
): void {
  const { ownership, instanceConfig, logger } = options;
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch.bind(globalThis) as FetchLike);
  const discordBaseUrl = options.discordBaseUrl ?? 'https://discord.com/api/v10';
  const log = logger.child({ component: 'admin-identity' });

  app.get('/admin/identity', async (request): Promise<AdminIdentityResponse> => {
    await requireOwner(app, request, ownership);
    const config = await instanceConfig.getConfig();
    return buildAdminIdentityResponse(config.botName, config.botDescription, config.botAvatarUrl);
  });

  app.put('/admin/identity', async (request, reply): Promise<AdminIdentityResponse | undefined> => {
    const session = await requireOwner(app, request, ownership);
    const parsed = identityBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw httpError(400, 'invalid_body', 'Body invalide.', parsed.error.issues);
    }
    const patch = parsed.data;
    const hasAnyField =
      patch.name !== undefined || patch.avatar !== undefined || patch.description !== undefined;

    // PUT vide = no-op : on retourne l'état actuel sans appel
    // Discord. Évite de marteler `PATCH /applications/@me` qui est
    // sévèrement rate-limité côté Discord.
    if (!hasAnyField) {
      const config = await instanceConfig.getConfig();
      return buildAdminIdentityResponse(config.botName, config.botDescription, config.botAvatarUrl);
    }

    const config = await instanceConfig.getConfig();
    if (config.discordBotToken === null) {
      throw httpError(
        400,
        'missing_bot_token',
        "Token bot absent — l'instance n'a pas encore enregistré de credentials Discord.",
      );
    }
    if (config.discordAppId === null) {
      throw httpError(
        400,
        'missing_app_id',
        "Application ID absent — l'instance n'a pas encore enregistré de credentials Discord.",
      );
    }
    const appId = config.discordAppId;

    let response: Response;
    try {
      response = await fetchImpl(`${discordBaseUrl}/applications/@me`, {
        method: 'PATCH',
        headers: {
          authorization: `Bot ${config.discordBotToken}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(patch),
      });
    } catch (err) {
      throw httpError(
        502,
        'discord_unreachable',
        `Impossible d'atteindre Discord : ${errorDetail(err)}`,
      );
    }

    // 429 explicite : on envoie la réponse directement plutôt que
    // de throw — le `retryAfterMs` doit être au top-level du body
    // pour que l'UI puisse le lire sans descendre dans `details`,
    // et le `setErrorHandler` global ne l'autorise pas.
    if (response.status === 429) {
      let retryAfterMs: number | undefined;
      try {
        const body = (await response.json()) as unknown;
        const parsedRate = rateLimitBodySchema.safeParse(body);
        if (parsedRate.success) {
          retryAfterMs = Math.round(parsedRate.data.retry_after * 1000);
        }
      } catch {
        retryAfterMs = undefined;
      }
      void reply.status(429).send({
        error: 'rate_limited',
        message: 'Discord rate limit sur PATCH /applications/@me.',
        ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
      });
      return;
    }

    if (!response.ok) {
      throw httpError(
        502,
        'discord_unreachable',
        `Discord a répondu ${response.status} sur PATCH /applications/@me.`,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw httpError(502, 'discord_unreachable', 'Réponse Discord non parseable.');
    }
    const patchResult = applicationPatchSchema.safeParse(body);
    if (!patchResult.success) {
      throw httpError(
        502,
        'discord_unreachable',
        'Réponse Discord inattendue : forme PATCH /applications/@me invalide.',
      );
    }

    const avatarHash = patchResult.data.avatar;
    const avatarUrl =
      avatarHash != null ? `https://cdn.discordapp.com/app-icons/${appId}/${avatarHash}.png` : null;

    const persistPatch: {
      botName?: string;
      botDescription?: string;
      botAvatarUrl?: string;
    } = {};
    if (patch.name !== undefined) persistPatch.botName = patch.name;
    if (patch.description !== undefined) persistPatch.botDescription = patch.description;
    if (avatarUrl !== null) persistPatch.botAvatarUrl = avatarUrl;
    // On reste à l'étape 6 du wizard côté setup_step ; on ne
    // touche pas au compteur.
    await instanceConfig.setStep(6, persistPatch);

    log.info('Admin identity updated', {
      ownerId: session.userId,
      fields: Object.keys(patch),
    });

    const after = await instanceConfig.getConfig();
    return buildAdminIdentityResponse(after.botName, after.botDescription, after.botAvatarUrl);
  });
}
