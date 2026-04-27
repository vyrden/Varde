import type { GuildId, UserId } from '@varde/contracts';
import { createConfigService, createLogger } from '@varde/core';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type Authenticator,
  createApiServer,
  createDiscordClient,
  type DiscordGuild,
  type FetchLike,
  type SessionData,
} from '../../src/index.js';
import { registerBotSettingsRoutes } from '../../src/routes/bot-settings.js';

/**
 * Tests d'intégration de la résilience DB (jalon 5 PR 5.9). Vérifie
 * qu'un échec DB en cours de traitement de requête se traduit par
 * un statut HTTP 5xx propre — pas un crash de process, pas une
 * réponse vide qui ferait timeout côté dashboard.
 *
 * Approche : on injecte un `CoreConfigService` factice dont les
 * méthodes throw, et on vérifie que le global error handler de
 * Fastify (`setErrorHandler` dans `createApiServer`) capture
 * l'exception et renvoie une réponse JSON formée.
 */

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

const GUILD: GuildId = '111111111111111111' as GuildId;

const headerAuthenticator: Authenticator = (request) => {
  const raw = request.headers['x-test-session'];
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
};

const adminFetch: FetchLike = async () =>
  new Response(
    JSON.stringify([
      {
        id: GUILD,
        name: 'Alpha',
        icon: null,
        permissions: '0x20',
      } as DiscordGuild,
    ]),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

const authHeader = { 'x-test-session': JSON.stringify({ userId: '42', accessToken: 'tok' }) };

describe("résilience DB — l'API ne crash pas en cas d'erreur de persistance", () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await client.db.insert(sqliteSchema.guilds).values({ id: GUILD, name: 'Alpha' }).run();
  });

  afterEach(async () => {
    await client.close();
  });

  it('PUT /settings/bot — un setWith() qui throw renvoie 500 JSON, pas un crash', async () => {
    const logger = silentLogger();
    const realConfig = createConfigService({ client });
    await realConfig.ensureGuild(GUILD);

    // Wrapper qui force `setWith` à échouer comme si la DB était
    // tombée (connection refused, transaction abort, etc.).
    const failingConfig = {
      get: realConfig.get.bind(realConfig),
      set: realConfig.set.bind(realConfig),
      setWith: () => {
        throw new Error('DB connection lost');
      },
      ensureGuild: realConfig.ensureGuild.bind(realConfig),
    } as typeof realConfig;

    const discord = createDiscordClient({ fetch: adminFetch });
    const app = await createApiServer({
      logger,
      version: 'test',
      authenticator: headerAuthenticator,
    });
    registerBotSettingsRoutes(app, { config: failingConfig, discord });

    try {
      const res = await app.inject({
        method: 'PUT',
        url: `/guilds/${GUILD}/settings/bot`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({
          language: 'fr',
          timezone: 'UTC',
          embedColor: '#5865F2',
        }),
      });
      // Critique : le process est toujours vivant et a renvoyé un
      // statut HTTP au client. Pas de crash, pas de timeout.
      expect(res.statusCode).toBeGreaterThanOrEqual(500);
      expect(res.statusCode).toBeLessThan(600);
      const body = res.json() as { error?: string; message?: string };
      // Le body est du JSON formé par le global error handler — pas
      // une page HTML d'erreur Fastify ni un body vide.
      expect(typeof body).toBe('object');
      expect(typeof body.message).toBe('string');
    } finally {
      await app.close();
    }
  });

  it('GET /settings/bot — un get() qui throw retombe sur les défauts, pas une erreur 500', async () => {
    // Cas particulier documenté dans `bot-settings.ts` : la route GET
    // catch silencieusement les erreurs de lecture config et retombe
    // sur les défauts. Vérifie que ce contrat tient.
    const logger = silentLogger();
    const realConfig = createConfigService({ client });
    await realConfig.ensureGuild(GUILD);

    const failingReadConfig = {
      get: () => {
        throw new Error('DB read timeout');
      },
      set: realConfig.set.bind(realConfig),
      setWith: realConfig.setWith.bind(realConfig),
      ensureGuild: realConfig.ensureGuild.bind(realConfig),
    } as typeof realConfig;

    const discord = createDiscordClient({ fetch: adminFetch });
    const app = await createApiServer({
      logger,
      version: 'test',
      authenticator: headerAuthenticator,
    });
    registerBotSettingsRoutes(app, { config: failingReadConfig, discord });

    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/settings/bot`,
        headers: authHeader,
      });
      // GET tolérant : 200 avec valeurs par défaut, garde le
      // dashboard fonctionnel même si la DB hoquette en lecture.
      expect(res.statusCode).toBe(200);
      const body = res.json() as { language: string; timezone: string };
      expect(body.language).toBe('en');
      expect(body.timezone).toBe('UTC');
    } finally {
      await app.close();
    }
  });

  it('connexion DB fermée mid-flight : la requête échoue proprement (pas de promise rejection non capturée)', async () => {
    // Scénario plus extrême : la DB est physiquement fermée pendant
    // que la route s'exécute. On vérifie que le global error
    // handler reste maître de la situation.
    const logger = silentLogger();
    const config = createConfigService({ client });
    await config.ensureGuild(GUILD);

    const discord = createDiscordClient({ fetch: adminFetch });
    const app = await createApiServer({
      logger,
      version: 'test',
      authenticator: headerAuthenticator,
    });
    registerBotSettingsRoutes(app, { config, discord });

    // On ferme la DB AVANT d'envoyer la requête : toute opération
    // ultérieure throw une SqliteError ou similaire.
    await client.close();

    try {
      const res = await app.inject({
        method: 'PUT',
        url: `/guilds/${GUILD}/settings/bot`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({
          language: 'fr',
          timezone: 'UTC',
          embedColor: '#5865F2',
        }),
      });
      // 5xx attendu, body JSON formé par le global error handler.
      expect(res.statusCode).toBeGreaterThanOrEqual(500);
      expect(res.statusCode).toBeLessThan(600);
    } finally {
      await app.close();
      // Re-créer un client minimal pour le afterEach (qui appellera
      // client.close() à nouveau, idempotent).
      client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    }
  });
});

// Suppression du warning sur UserId non utilisé : les tests futurs
// peuvent l'importer directement.
void (null as UserId | null);
