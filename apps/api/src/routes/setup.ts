import { encryptString, type InstanceConfigService, tryDecryptString } from '@varde/core';
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
 *
 * Routes restant à ajouter : `bot-token`, `oauth`, `identity`,
 * `complete`.
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
}
