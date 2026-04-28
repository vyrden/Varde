import {
  encryptString,
  type InstanceConfig,
  type InstanceConfigService,
  tryDecryptString,
} from '@varde/core';
import type { DbClient, DbDriver } from '@varde/db';
import { sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { FetchLike } from '../discord-client.js';

/**
 * Routes du wizard de setup initial (jalon 7 PR 7.1). Toutes sous
 * `/setup/*`. Trois caractéristiques structurantes :
 *
 * 1. **Auth publique.** Aucune session n'est requise — par
 *    construction le wizard tourne avant qu'aucun utilisateur ne soit
 *    connecté. Personne ne peut atteindre le dashboard tant que la
 *    setup n'est pas terminée (le middleware Next.js redirige tout
 *    `/*` vers `/setup/*`).
 *
 * 2. **Fermeture après complétion.** Toutes les routes sont protégées
 *    par un preHandler qui retourne 403 dès que `setup_completed_at`
 *    est posé. Le 403 sert de signal au middleware Next.js « cette
 *    instance n'a plus rien à faire dans `/setup` ». Plus aucun
 *    moyen de rejouer la setup en l'état (la PR 2 du chantier 2
 *    introduira une page admin qui permettra de modifier les valeurs
 *    a posteriori, en passant par une autre surface d'API).
 *
 * 3. **Rate limit serré.** Comme les routes sont publiques, on
 *    plafonne 10 req/min/IP via le `@fastify/rate-limit` global. Un
 *    client buggé ou malveillant ne peut pas marteler les vérifs
 *    Discord ni tester des tokens à la chaîne.
 *
 * Routes implémentées (le wizard est livré progressivement, route par
 * route, pour rester reviewable) :
 *
 * - `GET  /setup/status`        — étape courante, configured?
 * - `GET  /setup/redirect-uri`  — URI OAuth2 dérivée de `baseUrl`
 * - `POST /setup/system-check`  — DB + master key canary + Discord HEAD
 * - `POST /setup/discord-app`   — valide via `/applications/{id}/rpc`,
 *                                 persiste appId + publicKey
 * - `POST /setup/bot-token`     — valide via `/users/@me`, déduit
 *                                 les intents manquants depuis
 *                                 `/applications/@me.flags`,
 *                                 persiste le token chiffré
 * - `POST /setup/oauth`         — valide le client secret via
 *                                 `client_credentials` sur
 *                                 `/oauth2/token`, persiste le
 *                                 secret chiffré
 * - `POST /setup/identity`      — PATCH `/applications/@me` (partial),
 *                                 persiste name/description et
 *                                 l'URL CDN de l'avatar
 * - `POST /setup/complete`      — vérifie que les credentials sont
 *                                 posés, pose `setup_completed_at`
 *                                 et fire les handlers `onReady`
 *                                 (login Discord en prod), avec
 *                                 timeout 30 s
 *
 * Toutes les routes du wizard sont en place — la PR 7.1 boucle ici
 * côté API. Reste l'UI (sub-livrables 4–5 du plan PR1-wizard.md) et
 * les tests E2E (sub-livrable 6).
 */

/** Forme d'un check du POST `/setup/system-check`. */
export interface SystemCheckResult {
  readonly name: 'database' | 'master_key' | 'discord_connectivity';
  readonly ok: boolean;
  readonly detail?: string;
}

/** Réponse complète du POST `/setup/system-check`. */
export interface SystemCheckResponse {
  readonly checks: readonly SystemCheckResult[];
  readonly detectedBaseUrl: string;
}

/** Options de construction. */
export interface RegisterSetupRoutesOptions {
  readonly instanceConfig: InstanceConfigService;
  /**
   * URL d'accès au dashboard (typiquement `http://localhost:3000` en
   * local, `https://votre-domaine.com` en prod). Sert à dériver
   * l'URI de redirection OAuth2 affichée à l'étape « OAuth » du
   * wizard, et à l'écho du `system-check` en `detectedBaseUrl`.
   */
  readonly baseUrl: string;
  /** Client DB utilisé pour la vérif `database` du `system-check`. */
  readonly client: DbClient<DbDriver>;
  /**
   * Master key keystore (32 octets). Sert au canary AES-256-GCM du
   * `system-check` (encrypt + decrypt d'une valeur témoin) — preuve
   * que la clé fournie en env est bien fonctionnelle avant de
   * persister le token bot avec.
   */
  readonly masterKey: Buffer;
  /** Fetch injectable (tests). Défaut : `globalThis.fetch`. */
  readonly fetchImpl?: FetchLike;
  /** Base URL Discord. Défaut : `https://discord.com/api/v10`. */
  readonly discordBaseUrl?: string;
  /**
   * Timeout du `POST /setup/complete` : durée maximale d'attente
   * pour que les handlers `onReady` (et donc, en prod, la connexion
   * gateway Discord) résolvent. Défaut 30_000 ms (30 s).
   */
  readonly completeTimeoutMs?: number;
}

/**
 * Construit l'URI de callback OAuth2 attendue par Discord à partir
 * du `baseUrl`. Strip un éventuel slash final pour ne pas produire
 * `https://x.com//api/...`.
 */
const buildRedirectUri = (baseUrl: string): string => {
  const normalized = baseUrl.replace(/\/+$/u, '');
  return `${normalized}/api/auth/callback/discord`;
};

const errorDetail = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Vérif `database` : `SELECT 1` brut. Confirme que le client est
 * connecté et répond, indépendamment de l'état de toute table.
 */
const checkDatabase = async (client: DbClient<DbDriver>): Promise<SystemCheckResult> => {
  try {
    if (client.driver === 'pg') {
      const pg = client as DbClient<'pg'>;
      await pg.db.execute(sql`SELECT 1`);
    } else {
      const sqlite = client as DbClient<'sqlite'>;
      sqlite.db.run(sql`SELECT 1`);
    }
    return { name: 'database', ok: true };
  } catch (err) {
    return { name: 'database', ok: false, detail: errorDetail(err) };
  }
};

/**
 * Vérif `master_key` : encrypt + decrypt d'une valeur témoin avec
 * la master key fournie. Échec si :
 * - la clé n'a pas la bonne taille (`encryptString` lève),
 * - le déchiffrement ne ramène pas le texte original (round-trip
 *   cassé — improbable mais on garde la garde).
 */
const checkMasterKey = (masterKey: Buffer): SystemCheckResult => {
  try {
    const blob = encryptString(masterKey, 'canary');
    const decrypted = tryDecryptString(masterKey, blob);
    if (decrypted !== 'canary') {
      return {
        name: 'master_key',
        ok: false,
        detail: 'round-trip AES-256-GCM échoué',
      };
    }
    return { name: 'master_key', ok: true };
  } catch (err) {
    return { name: 'master_key', ok: false, detail: errorDetail(err) };
  }
};

/**
 * Vérif `discord_connectivity` : HEAD sur `${discordBaseUrl}/gateway`.
 * On ne s'intéresse qu'à la joignabilité réseau — le moindre code
 * HTTP retourné prouve que Discord est joignable. Seul un throw
 * (DNS, TCP, TLS, timeout) marque la vérif comme rouge.
 */
const checkDiscordConnectivity = async (
  fetchImpl: FetchLike,
  discordBaseUrl: string,
): Promise<SystemCheckResult> => {
  try {
    await fetchImpl(`${discordBaseUrl}/gateway`, { method: 'HEAD' });
    return { name: 'discord_connectivity', ok: true };
  } catch (err) {
    return { name: 'discord_connectivity', ok: false, detail: errorDetail(err) };
  }
};

/** Body wire de `POST /setup/discord-app`. */
const discordAppBodySchema = z.object({
  /** Application ID Discord (snowflake 17-20 chiffres). */
  appId: z.string().regex(/^\d{17,20}$/, 'appId doit être un snowflake Discord (17-20 chiffres)'),
  /** Public Key Ed25519 hex (64 caractères). */
  publicKey: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'publicKey doit être un hex Ed25519 sur 64 caractères'),
});

/** Réponse de `POST /setup/discord-app`. */
export interface DiscordAppResponse {
  /** Nom de l'application Discord, tel que retourné par `/applications/{id}/rpc`. */
  readonly appName: string;
}

/**
 * Forme minimale d'une réponse `GET /applications/{id}/rpc` côté
 * Discord. La réponse complète est plus riche (icon, description,
 * tags…) mais on n'utilise que `name` ici.
 */
const rpcResponseSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
});

/** Body wire de `POST /setup/bot-token`. */
const botTokenBodySchema = z.object({
  /** Token bot Discord (long opaque, validé côté Discord). */
  token: z.string().min(20, 'token bot Discord trop court'),
});

/** Forme minimale de `GET /users/@me` côté Discord pour notre besoin. */
const botUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  discriminator: z.string().optional(),
  avatar: z.string().nullable().optional(),
});

/** DTO bot user retourné au client wizard. */
export interface BotUserDto {
  readonly id: string;
  readonly username: string;
  readonly discriminator?: string;
  readonly avatar?: string | null;
}

/** Forme minimale de `GET /applications/@me` (champs `flags` uniquement). */
const applicationInfoSchema = z.object({
  flags: z.number().int(),
});

/** Nom canonique des trois intents privilégiés Discord. */
export type PrivilegedIntentName = 'PRESENCE' | 'GUILD_MEMBERS' | 'MESSAGE_CONTENT';

/**
 * Bits de `Application.flags` qui matérialisent l'activation d'un
 * intent privilégié dans le portail Developer. Chaque intent peut
 * être posé via deux flags distincts :
 *
 * - `*_LIMITED` : bot non-vérifié (< 75 serveurs). C'est ce qu'on
 *   voit dès qu'on coche la case dans le portail.
 * - `*` (sans LIMITED) : bot vérifié, après revue Discord.
 *
 * Il suffit qu'un des deux soit posé pour considérer l'intent
 * activé. Voir https://discord.com/developers/docs/resources/application#application-object-application-flags.
 */
const INTENT_FLAGS: Readonly<Record<PrivilegedIntentName, readonly number[]>> = {
  PRESENCE: [1 << 12, 1 << 13],
  GUILD_MEMBERS: [1 << 14, 1 << 15],
  MESSAGE_CONTENT: [1 << 18, 1 << 19],
};

/**
 * Calcule la liste des intents privilégiés non activés dans
 * `Application.flags`. Algorithme : pour chaque intent, si aucun
 * des deux bits associés n'est posé, l'intent est listé comme
 * manquant.
 */
const computeMissingIntents = (flags: number): readonly PrivilegedIntentName[] => {
  const missing: PrivilegedIntentName[] = [];
  for (const [name, bits] of Object.entries(INTENT_FLAGS) as readonly [
    PrivilegedIntentName,
    readonly number[],
  ][]) {
    if (!bits.some((bit) => (flags & bit) !== 0)) {
      missing.push(name);
    }
  }
  return missing;
};

/** Réponse de `POST /setup/bot-token`. */
export type BotTokenResponse =
  | {
      readonly valid: true;
      readonly botUser: BotUserDto;
      readonly missingIntents: readonly PrivilegedIntentName[];
    }
  | {
      readonly valid: false;
      readonly reason: 'invalid_token';
    };

/** Body wire de `POST /setup/oauth`. */
const oauthBodySchema = z.object({
  /** Client Secret OAuth2 Discord (long opaque). */
  clientSecret: z.string().min(8, 'clientSecret trop court'),
});

/** Réponse de `POST /setup/oauth`. */
export type OAuthResponse =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: 'invalid_secret' };

/**
 * Body wire de `POST /setup/identity`. Tous les champs sont
 * optionnels — l'admin peut soumettre une mise à jour partielle, ou
 * un body vide (skip de l'étape).
 */
const identityBodySchema = z.object({
  name: z.string().min(1).max(32).optional(),
  /** Data URI `data:image/...;base64,...`. Le dashboard fait l'encodage. */
  avatar: z
    .string()
    .regex(/^data:image\/(png|jpe?g|gif);base64,/u, 'avatar doit être un data URI image')
    .optional(),
  description: z.string().max(400).optional(),
});

/** Réponse de `POST /setup/identity` — identité telle que persistée. */
export interface IdentityResponse {
  readonly name: string | null;
  readonly description: string | null;
  readonly avatarUrl: string | null;
}

/**
 * Forme minimale de la réponse `PATCH /applications/@me` côté Discord.
 * Tous les champs intéressants sont retournés en cas de succès.
 */
const applicationPatchSchema = z.object({
  id: z.string(),
  name: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
});

/** Réponse de `POST /setup/complete`. */
export type CompleteResponse =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: 'timeout' };

/** Liste des champs requis pour pouvoir clore la setup. */
const REQUIRED_FIELDS = [
  'discordAppId',
  'discordPublicKey',
  'discordBotToken',
  'discordClientSecret',
] as const satisfies readonly (keyof InstanceConfig)[];

/**
 * Erreur HTTP typée pour les routes du wizard. Fastify détecte
 * `statusCode` et l'utilise comme code de réponse.
 */
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

/**
 * Enregistre les routes `/setup/*` sur l'instance Fastify fournie.
 */
export function registerSetupRoutes(
  app: FastifyInstance,
  options: RegisterSetupRoutesOptions,
): void {
  const { instanceConfig, baseUrl, client, masterKey } = options;
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch.bind(globalThis) as FetchLike);
  const discordBaseUrl = options.discordBaseUrl ?? 'https://discord.com/api/v10';
  const completeTimeoutMs = options.completeTimeoutMs ?? 30_000;

  // Plafond serré : ces routes sont publiques pendant le wizard, on
  // les protège contre l'abus avec 10 req/min/IP. Le rate-limiter
  // global est déjà à 300/min/IP — `config.rateLimit` ne vient pas
  // s'ajouter mais le remplacer pour cette route.
  const setupRateLimit = { max: 10, timeWindow: '1 minute' } as const;

  /**
   * Refuse l'accès à toutes les routes `/setup/*` une fois que la
   * setup est terminée. 403 plutôt que 404 : le client (Next.js
   * middleware notamment) doit pouvoir distinguer « pas configurée
   * encore » de « déjà configurée ».
   */
  const requireUnconfigured = async (
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const status = await instanceConfig.getStatus();
    if (status.configured) {
      void reply.status(403).send({
        error: 'setup_completed',
        message: 'La setup de cette instance est déjà terminée.',
      });
    }
  };

  app.get(
    '/setup/status',
    {
      config: { rateLimit: setupRateLimit },
      preHandler: requireUnconfigured,
    },
    async () => {
      const status = await instanceConfig.getStatus();
      return status;
    },
  );

  app.get(
    '/setup/redirect-uri',
    {
      config: { rateLimit: setupRateLimit },
      preHandler: requireUnconfigured,
    },
    async () => {
      return { uri: buildRedirectUri(baseUrl) };
    },
  );

  // public-route: wizard de setup initial — auth publique avant que personne ne soit connecté, gardé par requireUnconfigured (403 post-setup) + rate limit 10 req/min/IP
  app.post(
    '/setup/system-check',
    {
      config: { rateLimit: setupRateLimit },
      preHandler: requireUnconfigured,
    },
    async (): Promise<SystemCheckResponse> => {
      const [databaseResult, discordResult] = await Promise.all([
        checkDatabase(client),
        checkDiscordConnectivity(fetchImpl, discordBaseUrl),
      ]);
      const masterKeyResult = checkMasterKey(masterKey);
      return {
        checks: [databaseResult, masterKeyResult, discordResult],
        detectedBaseUrl: baseUrl,
      };
    },
  );

  // public-route: wizard de setup initial — voir justification au-dessus de /setup/system-check
  app.post(
    '/setup/discord-app',
    {
      config: { rateLimit: setupRateLimit },
      preHandler: requireUnconfigured,
    },
    async (request): Promise<DiscordAppResponse> => {
      const parsed = discordAppBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw httpError(400, 'invalid_body', 'Body invalide.', parsed.error.issues);
      }
      const { appId, publicKey } = parsed.data;

      // Validation côté Discord via l'endpoint public RPC. Pas d'auth
      // requise — c'est précisément ce qui rend ce check sûr à faire
      // depuis une route publique sans token bot.
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
          `Aucune application Discord trouvée pour l'ID ${appId}. Vérifiez l'Application ID dans le portail Developer.`,
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
        throw httpError(
          502,
          'discord_unreachable',
          'Réponse Discord inattendue : `name` manquant.',
        );
      }

      // L'étape « Discord App » est la 3 dans le wireframe (welcome=1,
      // system-check=2, discord-app=3). On bumpe `setupStep` à au
      // moins 3 ; setStep est monotone, donc un retour-arrière dans
      // le wizard ne fait pas reculer l'avancement.
      await instanceConfig.setStep(3, { discordAppId: appId, discordPublicKey: publicKey });

      return { appName: rpc.data.name };
    },
  );

  // public-route: wizard de setup initial — voir justification au-dessus de /setup/system-check
  app.post(
    '/setup/bot-token',
    {
      config: { rateLimit: setupRateLimit },
      preHandler: requireUnconfigured,
    },
    async (request): Promise<BotTokenResponse> => {
      const parsed = botTokenBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw httpError(400, 'invalid_body', 'Body invalide.', parsed.error.issues);
      }
      const { token } = parsed.data;
      const authHeader = `Bot ${token}`;

      // Étape 1 — `/users/@me` : confirme que le token est accepté
      // par Discord. 401/403 → token invalide (pas d'écriture en
      // DB). Tout autre échec réseau → 502 propagé.
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
        return { valid: false, reason: 'invalid_token' };
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

      // Étape 2 — `/applications/@me` : lit `flags` pour déduire
      // quels intents privilégiés sont activés dans le portail
      // Developer. C'est l'équivalent fiable et léger d'une
      // tentative de connexion gateway — Discord renvoie un close
      // code 4014 sur intents refusés, mais établir un websocket
      // pour le découvrir est lourd et flaky. Les flags exposent
      // exactement la même information.
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
          'Réponse Discord inattendue : `flags` manquant sur /applications/@me.',
        );
      }
      const missingIntents = computeMissingIntents(appParsed.data.flags);

      // Persistance chiffrée. setStep est monotone — l'étape « Token »
      // est la 4 dans le wireframe (welcome=1, system-check=2,
      // discord-app=3, bot-token=4).
      await instanceConfig.setStep(4, { discordBotToken: token });

      const botUser: BotUserDto = {
        id: meParsed.data.id,
        username: meParsed.data.username,
        ...(meParsed.data.discriminator !== undefined
          ? { discriminator: meParsed.data.discriminator }
          : {}),
        ...(meParsed.data.avatar !== undefined ? { avatar: meParsed.data.avatar } : {}),
      };
      return { valid: true, botUser, missingIntents };
    },
  );

  // public-route: wizard de setup initial — voir justification au-dessus de /setup/system-check
  app.post(
    '/setup/oauth',
    {
      config: { rateLimit: setupRateLimit },
      preHandler: requireUnconfigured,
    },
    async (request): Promise<OAuthResponse> => {
      const parsed = oauthBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw httpError(400, 'invalid_body', 'Body invalide.', parsed.error.issues);
      }
      const { clientSecret } = parsed.data;

      // Précondition : `discordAppId` doit avoir été persisté à
      // l'étape 3. Sans lui on ne peut pas construire le `client_id`
      // de la requête OAuth2 — autant l'expliciter au lieu de
      // forwarder un appel cassé.
      const config = await instanceConfig.getConfig();
      if (config.discordAppId === null) {
        throw httpError(
          400,
          'missing_app_id',
          "Application ID absent : passez d'abord l'étape « Discord App » du wizard.",
        );
      }
      const clientId = config.discordAppId;

      // Échange `client_credentials` côté Discord (RFC 6749 §4.4) :
      // Basic auth = base64(client_id:client_secret), corps form-urlencoded.
      // Si le secret est invalide, Discord répond 401 invalid_client.
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
        return { valid: false, reason: 'invalid_secret' };
      }
      if (!response.ok) {
        throw httpError(
          502,
          'discord_unreachable',
          `Discord a répondu ${response.status} sur /oauth2/token.`,
        );
      }

      // Persiste le secret chiffré. setStep monotone — l'étape OAuth
      // est la 5 dans le wireframe.
      await instanceConfig.setStep(5, { discordClientSecret: clientSecret });
      return { valid: true };
    },
  );

  // public-route: wizard de setup initial — voir justification au-dessus de /setup/system-check
  app.post(
    '/setup/identity',
    {
      config: { rateLimit: setupRateLimit },
      preHandler: requireUnconfigured,
    },
    async (request): Promise<IdentityResponse> => {
      const parsed = identityBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw httpError(400, 'invalid_body', 'Body invalide.', parsed.error.issues);
      }
      const patch = parsed.data;
      const hasAnyField =
        patch.name !== undefined || patch.avatar !== undefined || patch.description !== undefined;

      // Skip de l'étape (clic « Passer cette étape » côté wizard) :
      // body vide → on bumpe juste le compteur, pas d'appel Discord.
      if (!hasAnyField) {
        await instanceConfig.setStep(6, {});
        const config = await instanceConfig.getConfig();
        return {
          name: config.botName,
          description: config.botDescription,
          avatarUrl: config.botAvatarUrl,
        };
      }

      const config = await instanceConfig.getConfig();
      if (config.discordBotToken === null) {
        throw httpError(
          400,
          'missing_bot_token',
          "Token bot absent : passez d'abord l'étape « Token bot » du wizard.",
        );
      }
      // discordAppId est forcément posé puisque le token est posé
      // (l'ordre des étapes le garantit), mais on le revérifie en
      // défense pour pouvoir construire l'URL CDN sans non-null.
      if (config.discordAppId === null) {
        throw httpError(
          400,
          'missing_app_id',
          "Application ID absent : passez d'abord l'étape « Discord App » du wizard.",
        );
      }
      const appId = config.discordAppId;

      // PATCH /applications/@me — partial update : Discord met à
      // jour uniquement les champs présents dans le body.
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

      // Compose l'URL CDN à partir du hash retourné par Discord —
      // c'est ce que la dashboard affichera (le data URI brut serait
      // énorme à stocker à long terme).
      const avatarHash = patchResult.data.avatar;
      const avatarUrl =
        avatarHash != null
          ? `https://cdn.discordapp.com/app-icons/${appId}/${avatarHash}.png`
          : null;

      // Persiste les seuls champs effectivement fournis. Les autres
      // restent à leur valeur précédente — `setStep` ne touche pas un
      // champ absent du patch.
      const persistPatch: {
        botName?: string;
        botDescription?: string;
        botAvatarUrl?: string;
      } = {};
      if (patch.name !== undefined) persistPatch.botName = patch.name;
      if (patch.description !== undefined) persistPatch.botDescription = patch.description;
      if (avatarUrl !== null) persistPatch.botAvatarUrl = avatarUrl;
      await instanceConfig.setStep(6, persistPatch);

      const after = await instanceConfig.getConfig();
      return {
        name: after.botName,
        description: after.botDescription,
        avatarUrl: after.botAvatarUrl,
      };
    },
  );

  // public-route: wizard de setup initial — voir justification au-dessus de /setup/system-check
  app.post(
    '/setup/complete',
    {
      config: { rateLimit: setupRateLimit },
      preHandler: requireUnconfigured,
    },
    async (): Promise<CompleteResponse> => {
      // Vérifie que les 4 credentials sont posés. Pas un schéma Zod
      // ici car on ne valide pas un body — on inspecte l'état
      // accumulé en DB par les étapes précédentes du wizard.
      const config = await instanceConfig.getConfig();
      const missing: string[] = [];
      for (const field of REQUIRED_FIELDS) {
        if (config[field] === null) {
          missing.push(field);
        }
      }
      if (missing.length > 0) {
        throw httpError(
          400,
          'missing_required_fields',
          'Setup incomplète : un ou plusieurs credentials sont manquants.',
          { missing },
        );
      }

      // Race entre `complete()` (qui pose `setup_completed_at` en DB
      // puis fire & await les handlers `onReady` — la connexion
      // gateway en prod) et un timeout. Si le timeout fire d'abord,
      // l'instance EST néanmoins finalisée en DB ; seule la
      // connexion gateway n'a pas terminé dans la fenêtre. Le
      // dashboard peut surfacer le warning et l'admin peut
      // rafraîchir le statut bot via les logs.
      let timer: ReturnType<typeof setTimeout> | null = null;
      const completion = instanceConfig.complete().then((): CompleteResponse => {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        return { ok: true };
      });
      const timeout = new Promise<CompleteResponse>((resolve) => {
        timer = setTimeout(() => {
          timer = null;
          resolve({ ok: false, error: 'timeout' });
        }, completeTimeoutMs);
      });
      return Promise.race([completion, timeout]);
    },
  );
}
