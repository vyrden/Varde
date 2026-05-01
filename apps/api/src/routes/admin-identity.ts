import type { Logger, UserId } from '@varde/contracts';
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
  banner: z
    .string()
    .regex(/^data:image\/(png|jpe?g|gif);base64,/u, 'banner doit être un data URI image')
    .optional(),
  description: z.string().max(400).optional(),
});

const applicationPatchSchema = z.object({
  id: z.string(),
  name: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
});

const userPatchSchema = z.object({
  id: z.string(),
  username: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  banner: z.string().nullable().optional(),
});

const rateLimitBodySchema = z.object({
  retry_after: z.number().nonnegative(),
});

/** Réponse de `GET /admin/identity` et `PUT /admin/identity`. */
export interface AdminIdentityResponse {
  readonly name: string | null;
  readonly description: string | null;
  readonly avatarUrl: string | null;
  readonly bannerUrl: string | null;
}

/** Options de construction. */
export interface RegisterAdminIdentityRoutesOptions {
  readonly ownership: OwnershipService;
  readonly instanceConfig: InstanceConfigService;
  readonly logger: Logger;
  readonly fetchImpl?: FetchLike;
  readonly discordBaseUrl?: string;
  /** Service d'audit instance-scoped. Optionnel — tests sans audit. */
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

const buildAdminIdentityResponse = (
  name: string | null,
  description: string | null,
  avatarUrl: string | null,
  bannerUrl: string | null,
): AdminIdentityResponse => ({ name, description, avatarUrl, bannerUrl });

export function registerAdminIdentityRoutes(
  app: FastifyInstance,
  options: RegisterAdminIdentityRoutesOptions,
): void {
  const { ownership, instanceConfig, logger, instanceAudit } = options;
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch.bind(globalThis) as FetchLike);
  const discordBaseUrl = options.discordBaseUrl ?? 'https://discord.com/api/v10';
  const log = logger.child({ component: 'admin-identity' });

  app.get('/admin/identity', async (request): Promise<AdminIdentityResponse> => {
    await requireOwner(app, request, ownership);
    const config = await instanceConfig.getConfig();
    return buildAdminIdentityResponse(
      config.botName,
      config.botDescription,
      config.botAvatarUrl,
      config.botBannerUrl,
    );
  });

  app.put('/admin/identity', async (request, reply): Promise<AdminIdentityResponse | undefined> => {
    const session = await requireOwner(app, request, ownership);
    const parsed = identityBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw httpError(400, 'invalid_body', 'Body invalide.', parsed.error.issues);
    }
    const patch = parsed.data;
    const hasAnyField =
      patch.name !== undefined ||
      patch.avatar !== undefined ||
      patch.banner !== undefined ||
      patch.description !== undefined;

    // PUT vide = no-op : on retourne l'état actuel sans appel
    // Discord. Évite de marteler `PATCH /applications/@me` qui est
    // sévèrement rate-limité côté Discord.
    if (!hasAnyField) {
      const config = await instanceConfig.getConfig();
      return buildAdminIdentityResponse(
        config.botName,
        config.botDescription,
        config.botAvatarUrl,
        config.botBannerUrl,
      );
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
    const authHeader = `Bot ${config.discordBotToken}`;

    // URL CDN bannière — composée à partir du `id` + `banner` hash
    // retournés par PATCH /users/@me. `null` si l'admin n'a pas
    // envoyé de bannière dans ce PUT.
    let bannerUrl: string | null = null;

    // Identité bot = deux endpoints Discord (cf. setup.ts pour le
    // raisonnement complet). On envoie aux deux pour cohérence
    // username serveur ↔ nom application portail Developer.

    // PATCH /users/@me — username + avatar + banner du bot user.
    // Skippé si ni name ni avatar ni banner dans le patch.
    if (patch.name !== undefined || patch.avatar !== undefined || patch.banner !== undefined) {
      const userPatch: { username?: string; avatar?: string; banner?: string } = {};
      if (patch.name !== undefined) userPatch.username = patch.name;
      if (patch.avatar !== undefined) userPatch.avatar = patch.avatar;
      if (patch.banner !== undefined) userPatch.banner = patch.banner;
      let userResponse: Response;
      try {
        userResponse = await fetchImpl(`${discordBaseUrl}/users/@me`, {
          method: 'PATCH',
          headers: {
            authorization: authHeader,
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify(userPatch),
        });
      } catch (err) {
        throw httpError(
          502,
          'discord_unreachable',
          `Impossible d'atteindre Discord : ${errorDetail(err)}`,
        );
      }
      if (!userResponse.ok && userResponse.status !== 429) {
        throw httpError(
          502,
          'discord_unreachable',
          `Discord a répondu ${userResponse.status} sur PATCH /users/@me.`,
        );
      }
      // Si /users/@me renvoie 429 on continue quand même vers
      // /applications/@me — la suite gère son propre 429 et l'admin
      // pourra retenter, le username sera à jour au coup d'après.
      if (userResponse.ok && patch.banner !== undefined) {
        let userBody: unknown;
        try {
          userBody = await userResponse.json();
        } catch {
          userBody = null;
        }
        const userPatchResult = userPatchSchema.safeParse(userBody);
        if (userPatchResult.success && userPatchResult.data.banner != null) {
          bannerUrl = `https://cdn.discordapp.com/banners/${userPatchResult.data.id}/${userPatchResult.data.banner}.png?size=1024`;
        }
      }
    }

    // PATCH /applications/@me — name (app), description, icon (icône
    // application). Mappe `avatar` du body wizard vers `icon` Discord.
    const appPatch: { name?: string; description?: string; icon?: string } = {};
    if (patch.name !== undefined) appPatch.name = patch.name;
    if (patch.description !== undefined) appPatch.description = patch.description;
    if (patch.avatar !== undefined) appPatch.icon = patch.avatar;
    let response: Response;
    try {
      response = await fetchImpl(`${discordBaseUrl}/applications/@me`, {
        method: 'PATCH',
        headers: {
          authorization: authHeader,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(appPatch),
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

    const avatarHash = patchResult.data.icon ?? patchResult.data.avatar;
    const avatarUrl =
      avatarHash != null ? `https://cdn.discordapp.com/app-icons/${appId}/${avatarHash}.png` : null;

    const persistPatch: {
      botName?: string;
      botDescription?: string;
      botAvatarUrl?: string;
      botBannerUrl?: string;
    } = {};
    if (patch.name !== undefined) persistPatch.botName = patch.name;
    if (patch.description !== undefined) persistPatch.botDescription = patch.description;
    if (avatarUrl !== null) persistPatch.botAvatarUrl = avatarUrl;
    if (bannerUrl !== null) persistPatch.botBannerUrl = bannerUrl;
    // On reste à l'étape 6 du wizard côté setup_step ; on ne
    // touche pas au compteur.
    await instanceConfig.setStep(6, persistPatch);

    log.info('Admin identity updated', {
      ownerId: session.userId,
      fields: Object.keys(patch),
    });
    await instanceAudit?.log({
      action: INSTANCE_AUDIT_ACTIONS.IDENTITY_UPDATED,
      actor: { type: 'user', id: session.userId as UserId },
      severity: 'info',
      metadata: { fields: Object.keys(patch) },
    });

    const after = await instanceConfig.getConfig();
    return buildAdminIdentityResponse(
      after.botName,
      after.botDescription,
      after.botAvatarUrl,
      after.botBannerUrl,
    );
  });
}
