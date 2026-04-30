import { randomBytes } from 'node:crypto';

import { createInstanceConfigService, createLogger } from '@varde/core';
import { applyMigrations, createDbClient, type DbClient } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type Authenticator,
  createApiServer,
  type FetchLike,
  registerSetupRoutes,
  type SessionData,
} from '../../src/index.js';

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

const noAuthAuthenticator: Authenticator = (): SessionData | null => null;

const setupClient = async (): Promise<DbClient<'sqlite'>> => {
  const client = createDbClient({ driver: 'sqlite', url: ':memory:' });
  await applyMigrations(client);
  return client;
};

const okResponse = (): Response =>
  new Response(null, { status: 200, headers: { 'content-type': 'text/plain' } });

interface BuildOptions {
  readonly baseUrl?: string;
  readonly fetchImpl?: FetchLike;
  readonly masterKey?: Buffer;
  readonly completeTimeoutMs?: number;
}

const build = async (
  client: DbClient<'sqlite'>,
  buildOptions: BuildOptions = {},
): Promise<{
  app: Awaited<ReturnType<typeof createApiServer>>;
  instanceConfig: ReturnType<typeof createInstanceConfigService>;
}> => {
  const masterKey = buildOptions.masterKey ?? randomBytes(32);
  const instanceConfig = createInstanceConfigService({
    client,
    masterKey,
    logger: silentLogger(),
  });
  const app = await createApiServer({
    logger: silentLogger(),
    version: 'test',
    authenticator: noAuthAuthenticator,
    rateLimitMax: false,
  });
  registerSetupRoutes(app, {
    instanceConfig,
    baseUrl: buildOptions.baseUrl ?? 'http://localhost:3000',
    client,
    masterKey,
    ...(buildOptions.fetchImpl ? { fetchImpl: buildOptions.fetchImpl } : {}),
    ...(buildOptions.completeTimeoutMs !== undefined
      ? { completeTimeoutMs: buildOptions.completeTimeoutMs }
      : {}),
  });
  return { app, instanceConfig };
};

describe('GET /setup/status', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('200 sur DB vide : configured=false, currentStep=1, tous les champs null/false', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({ method: 'GET', url: '/setup/status' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        configured: false,
        currentStep: 1,
        discordAppId: null,
        discordPublicKey: null,
        hasBotToken: false,
        hasClientSecret: false,
        botName: null,
        botDescription: null,
        botAvatarUrl: null,
      });
    } finally {
      await app.close();
    }
  });

  it('200 reflète setStep en cours et expose discordAppId saisi', async () => {
    const { app, instanceConfig } = await build(client);
    try {
      await instanceConfig.setStep(4, {
        discordAppId: '111111111111111111',
        discordPublicKey: '0'.repeat(64),
      });
      const res = await app.inject({ method: 'GET', url: '/setup/status' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        configured: false,
        currentStep: 4,
        discordAppId: '111111111111111111',
        discordPublicKey: '0'.repeat(64),
        hasBotToken: false,
        hasClientSecret: false,
      });
    } finally {
      await app.close();
    }
  });

  it('hasBotToken=true et hasClientSecret=true sans exposer leur valeur', async () => {
    const { app, instanceConfig } = await build(client);
    try {
      await instanceConfig.setStep(4, { discordBotToken: 'super-secret-token-1234567890' });
      await instanceConfig.setStep(5, { discordClientSecret: 'super-secret-client-secret' });
      const res = await app.inject({ method: 'GET', url: '/setup/status' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as Record<string, unknown>;
      expect(body['hasBotToken']).toBe(true);
      expect(body['hasClientSecret']).toBe(true);
      // Vérification cruciale : les valeurs sensibles ne fuitent PAS.
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain('super-secret-token-1234567890');
      expect(serialized).not.toContain('super-secret-client-secret');
    } finally {
      await app.close();
    }
  });

  it('expose les champs identité bot quand saisis', async () => {
    const { app, instanceConfig } = await build(client);
    try {
      await instanceConfig.setStep(6, {
        botName: 'Mon Super Bot',
        botDescription: 'Description du bot',
        botAvatarUrl: 'https://cdn.discordapp.com/app-icons/123/abc.png',
      });
      const res = await app.inject({ method: 'GET', url: '/setup/status' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        botName: 'Mon Super Bot',
        botDescription: 'Description du bot',
        botAvatarUrl: 'https://cdn.discordapp.com/app-icons/123/abc.png',
      });
    } finally {
      await app.close();
    }
  });

  it('403 quand la setup est terminée', async () => {
    const { app, instanceConfig } = await build(client);
    try {
      await instanceConfig.setStep(7, { discordBotToken: 'tok' });
      await instanceConfig.complete();
      const res = await app.inject({ method: 'GET', url: '/setup/status' });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ error: 'setup_completed' });
    } finally {
      await app.close();
    }
  });
});

describe('GET /setup/redirect-uri', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('200 retourne l URI dérivée du baseUrl par défaut', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({ method: 'GET', url: '/setup/redirect-uri' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        uri: 'http://localhost:3000/api/auth/callback/discord',
      });
    } finally {
      await app.close();
    }
  });

  it('200 honore un baseUrl custom', async () => {
    const { app } = await build(client, { baseUrl: 'https://varde.exemple.com' });
    try {
      const res = await app.inject({ method: 'GET', url: '/setup/redirect-uri' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        uri: 'https://varde.exemple.com/api/auth/callback/discord',
      });
    } finally {
      await app.close();
    }
  });

  it('200 normalise un trailing slash sur le baseUrl', async () => {
    const { app } = await build(client, { baseUrl: 'https://varde.exemple.com/' });
    try {
      const res = await app.inject({ method: 'GET', url: '/setup/redirect-uri' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        uri: 'https://varde.exemple.com/api/auth/callback/discord',
      });
    } finally {
      await app.close();
    }
  });

  it('403 quand la setup est terminée', async () => {
    const { app, instanceConfig } = await build(client);
    try {
      await instanceConfig.setStep(7, { discordBotToken: 'tok' });
      await instanceConfig.complete();
      const res = await app.inject({ method: 'GET', url: '/setup/redirect-uri' });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ error: 'setup_completed' });
    } finally {
      await app.close();
    }
  });
});

describe('routes /setup/* — auth publique', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('GET /setup/status : aucune session requise (pas de 401)', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({ method: 'GET', url: '/setup/status' });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});

describe('POST /setup/system-check', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('200 sur tout vert (DB ok, master key ok, Discord joignable)', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => okResponse());
    const { app } = await build(client, { fetchImpl });
    try {
      const res = await app.inject({ method: 'POST', url: '/setup/system-check' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        checks: { name: string; ok: boolean }[];
        detectedBaseUrl: string;
      };
      expect(body.detectedBaseUrl).toBe('http://localhost:3000');
      const byName = Object.fromEntries(body.checks.map((c) => [c.name, c]));
      expect(byName['database']?.ok).toBe(true);
      expect(byName['master_key']?.ok).toBe(true);
      expect(byName['discord_connectivity']?.ok).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('appelle Discord en HEAD sur /gateway', async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    const { app } = await build(client, { fetchImpl });
    try {
      await app.inject({ method: 'POST', url: '/setup/system-check' });
      expect(fetchImpl).toHaveBeenCalledWith(
        'https://discord.com/api/v10/gateway',
        expect.objectContaining({ method: 'HEAD' }),
      );
    } finally {
      await app.close();
    }
  });

  it('marque discord_connectivity ok=false avec un detail si fetch lève', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => {
      throw new Error('ENETUNREACH');
    });
    const { app } = await build(client, { fetchImpl });
    try {
      const res = await app.inject({ method: 'POST', url: '/setup/system-check' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { checks: { name: string; ok: boolean; detail?: string }[] };
      const discord = body.checks.find((c) => c.name === 'discord_connectivity');
      expect(discord?.ok).toBe(false);
      expect(discord?.detail).toContain('ENETUNREACH');
    } finally {
      await app.close();
    }
  });

  it('reflète le baseUrl effectif dans detectedBaseUrl', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => okResponse());
    const { app } = await build(client, {
      fetchImpl,
      baseUrl: 'https://varde.exemple.com',
    });
    try {
      const res = await app.inject({ method: 'POST', url: '/setup/system-check' });
      const body = res.json() as { detectedBaseUrl: string };
      expect(body.detectedBaseUrl).toBe('https://varde.exemple.com');
    } finally {
      await app.close();
    }
  });

  it('403 quand la setup est terminée', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => okResponse());
    const { app, instanceConfig } = await build(client, { fetchImpl });
    try {
      await instanceConfig.setStep(7, { discordBotToken: 'tok' });
      await instanceConfig.complete();
      const res = await app.inject({ method: 'POST', url: '/setup/system-check' });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });
});

describe('POST /setup/discord-app', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  const APP_ID = '987654321098765432';
  const PUBLIC_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  const rpcOkResponse = (name = 'Test App'): Response =>
    new Response(JSON.stringify({ id: APP_ID, name }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  it('200 sur appId valide : retourne le nom et persiste appId + publicKey', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => rpcOkResponse('Varde Bot'));
    const { app, instanceConfig } = await build(client, { fetchImpl });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/setup/discord-app',
        payload: { appId: APP_ID, publicKey: PUBLIC_KEY },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ appName: 'Varde Bot' });

      const config = await instanceConfig.getConfig();
      expect(config.discordAppId).toBe(APP_ID);
      expect(config.discordPublicKey).toBe(PUBLIC_KEY);
      expect(config.setupStep).toBeGreaterThanOrEqual(3);
    } finally {
      await app.close();
    }
  });

  it('appelle Discord en GET sur /applications/{id}/rpc', async () => {
    const fetchImpl = vi.fn(async () => rpcOkResponse());
    const { app } = await build(client, { fetchImpl });
    try {
      await app.inject({
        method: 'POST',
        url: '/setup/discord-app',
        payload: { appId: APP_ID, publicKey: PUBLIC_KEY },
      });
      expect(fetchImpl).toHaveBeenCalledWith(
        `https://discord.com/api/v10/applications/${APP_ID}/rpc`,
        expect.objectContaining({ method: 'GET' }),
      );
    } finally {
      await app.close();
    }
  });

  it('400 sur body invalide (champs manquants)', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => rpcOkResponse());
    const { app } = await build(client, { fetchImpl });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/setup/discord-app',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'invalid_body' });
    } finally {
      await app.close();
    }
  });

  it('400 sur appId mal formé (pas un snowflake)', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => rpcOkResponse());
    const { app } = await build(client, { fetchImpl });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/setup/discord-app',
        payload: { appId: 'pas-un-snowflake', publicKey: PUBLIC_KEY },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('404 si Discord retourne 404 (app inconnue) — rien persisté', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => new Response('not found', { status: 404 }));
    const { app, instanceConfig } = await build(client, { fetchImpl });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/setup/discord-app',
        payload: { appId: APP_ID, publicKey: PUBLIC_KEY },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ error: 'discord_app_not_found' });

      const config = await instanceConfig.getConfig();
      expect(config.discordAppId).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('502 si Discord répond 5xx', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => new Response('ko', { status: 503 }));
    const { app } = await build(client, { fetchImpl });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/setup/discord-app',
        payload: { appId: APP_ID, publicKey: PUBLIC_KEY },
      });
      expect(res.statusCode).toBe(502);
      expect(res.json()).toMatchObject({ error: 'discord_unreachable' });
    } finally {
      await app.close();
    }
  });

  it('502 si fetch lève (réseau cassé)', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => {
      throw new Error('ENETUNREACH');
    });
    const { app } = await build(client, { fetchImpl });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/setup/discord-app',
        payload: { appId: APP_ID, publicKey: PUBLIC_KEY },
      });
      expect(res.statusCode).toBe(502);
    } finally {
      await app.close();
    }
  });

  it('403 quand la setup est terminée', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => rpcOkResponse());
    const { app, instanceConfig } = await build(client, { fetchImpl });
    try {
      await instanceConfig.setStep(7, { discordBotToken: 'tok' });
      await instanceConfig.complete();
      const res = await app.inject({
        method: 'POST',
        url: '/setup/discord-app',
        payload: { appId: APP_ID, publicKey: PUBLIC_KEY },
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });
});

describe('POST /setup/bot-token', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  const TOKEN = 'NjAwAAAAAAAAAA.OOOOOO.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  // Tous les bits intents privilégiés activés :
  // PRESENCE_LIMITED (1<<13) | GUILD_MEMBERS_LIMITED (1<<15) | MESSAGE_CONTENT_LIMITED (1<<19)
  const ALL_INTENTS_FLAGS = (1 << 13) | (1 << 15) | (1 << 19);

  // Implémentation `fetchImpl` qui route selon l'URL : `/users/@me`,
  // `/applications/@me`, etc. Permet d'exprimer les scénarios de
  // façon lisible dans chaque test.
  type RouteHandler = (init?: RequestInit) => Promise<Response> | Response;
  const routedFetch = (handlers: Record<string, RouteHandler>): FetchLike =>
    vi.fn(async (input: string, init?: RequestInit) => {
      for (const [pattern, handler] of Object.entries(handlers)) {
        if (input.includes(pattern)) {
          return handler(init);
        }
      }
      throw new Error(`fetch non mocké: ${input}`);
    });

  const meOkResponse = (): Response =>
    new Response(
      JSON.stringify({
        id: '111111111111111111',
        username: 'varde-bot',
        discriminator: '0000',
        avatar: null,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );

  const appOkResponse = (flags = ALL_INTENTS_FLAGS): Response =>
    new Response(JSON.stringify({ id: '111111111111111111', flags }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  it('200 sur token valide + intents complets : valid=true, missingIntents=[], botUser présent', async () => {
    const fetchImpl = routedFetch({
      '/users/@me': () => meOkResponse(),
      '/applications/@me': () => appOkResponse(),
    });
    const { app, instanceConfig } = await build(client, { fetchImpl });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/setup/bot-token',
        payload: { token: TOKEN },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        valid: boolean;
        botUser?: { id: string; username: string };
        missingIntents?: string[];
      };
      expect(body.valid).toBe(true);
      expect(body.botUser).toMatchObject({ id: '111111111111111111', username: 'varde-bot' });
      expect(body.missingIntents).toEqual([]);

      // Token persisté chiffré, déchiffrable via getConfig.
      const config = await instanceConfig.getConfig();
      expect(config.discordBotToken).toBe(TOKEN);
      expect(config.setupStep).toBeGreaterThanOrEqual(4);
    } finally {
      await app.close();
    }
  });

  it('appelle Discord avec Authorization: Bot <token>', async () => {
    const fetchImpl = routedFetch({
      '/users/@me': () => meOkResponse(),
      '/applications/@me': () => appOkResponse(),
    });
    const { app } = await build(client, { fetchImpl });
    try {
      await app.inject({
        method: 'POST',
        url: '/setup/bot-token',
        payload: { token: TOKEN },
      });
      expect(fetchImpl).toHaveBeenCalledWith(
        'https://discord.com/api/v10/users/@me',
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: `Bot ${TOKEN}` }),
        }),
      );
    } finally {
      await app.close();
    }
  });

  it('200 valid=false si /users/@me retourne 401 — rien persisté', async () => {
    const fetchImpl = routedFetch({
      '/users/@me': () => new Response('unauthorized', { status: 401 }),
    });
    const { app, instanceConfig } = await build(client, { fetchImpl });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/setup/bot-token',
        payload: { token: TOKEN },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { valid: boolean; reason?: string };
      expect(body.valid).toBe(false);
      expect(body.reason).toBe('invalid_token');

      const config = await instanceConfig.getConfig();
      expect(config.discordBotToken).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('missingIntents liste PRESENCE quand le bit n est pas posé', async () => {
    const fetchImpl = routedFetch({
      '/users/@me': () => meOkResponse(),
      '/applications/@me': () => appOkResponse((1 << 15) | (1 << 19)), // sans PRESENCE
    });
    const { app } = await build(client, { fetchImpl });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/setup/bot-token',
        payload: { token: TOKEN },
      });
      const body = res.json() as { valid: boolean; missingIntents?: string[] };
      expect(body.valid).toBe(true);
      expect(body.missingIntents).toEqual(['PRESENCE']);
    } finally {
      await app.close();
    }
  });

  it('missingIntents liste les 3 quand aucun bit privilégié n est posé', async () => {
    const fetchImpl = routedFetch({
      '/users/@me': () => meOkResponse(),
      '/applications/@me': () => appOkResponse(0),
    });
    const { app } = await build(client, { fetchImpl });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/setup/bot-token',
        payload: { token: TOKEN },
      });
      const body = res.json() as { valid: boolean; missingIntents?: string[] };
      expect(body.valid).toBe(true);
      expect(body.missingIntents).toEqual(['PRESENCE', 'GUILD_MEMBERS', 'MESSAGE_CONTENT']);
    } finally {
      await app.close();
    }
  });

  it('accepte aussi les bits non-LIMITED (bots vérifiés)', async () => {
    // PRESENCE = 1<<12, GUILD_MEMBERS = 1<<14, MESSAGE_CONTENT = 1<<18
    const flags = (1 << 12) | (1 << 14) | (1 << 18);
    const fetchImpl = routedFetch({
      '/users/@me': () => meOkResponse(),
      '/applications/@me': () => appOkResponse(flags),
    });
    const { app } = await build(client, { fetchImpl });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/setup/bot-token',
        payload: { token: TOKEN },
      });
      const body = res.json() as { valid: boolean; missingIntents?: string[] };
      expect(body.valid).toBe(true);
      expect(body.missingIntents).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('502 si /users/@me retourne 5xx', async () => {
    const fetchImpl = routedFetch({
      '/users/@me': () => new Response('ko', { status: 503 }),
    });
    const { app } = await build(client, { fetchImpl });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/setup/bot-token',
        payload: { token: TOKEN },
      });
      expect(res.statusCode).toBe(502);
      expect(res.json()).toMatchObject({ error: 'discord_unreachable' });
    } finally {
      await app.close();
    }
  });

  it('502 si fetch lève (réseau cassé)', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => {
      throw new Error('ENETUNREACH');
    });
    const { app } = await build(client, { fetchImpl });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/setup/bot-token',
        payload: { token: TOKEN },
      });
      expect(res.statusCode).toBe(502);
    } finally {
      await app.close();
    }
  });

  it('400 sur body invalide (token manquant)', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => meOkResponse());
    const { app } = await build(client, { fetchImpl });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/setup/bot-token',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'invalid_body' });
    } finally {
      await app.close();
    }
  });

  it('403 quand la setup est terminée', async () => {
    const fetchImpl = routedFetch({
      '/users/@me': () => meOkResponse(),
      '/applications/@me': () => appOkResponse(),
    });
    const { app, instanceConfig } = await build(client, { fetchImpl });
    try {
      await instanceConfig.setStep(7, { discordBotToken: 'old' });
      await instanceConfig.complete();
      const res = await app.inject({
        method: 'POST',
        url: '/setup/bot-token',
        payload: { token: TOKEN },
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });
});

describe('POST /setup/oauth', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  const APP_ID = '987654321098765432';
  const CLIENT_SECRET = 'aZbYcXdW1234567890_-secret_value';

  const tokenOkResponse = (): Response =>
    new Response(
      JSON.stringify({
        access_token: 'mock-access-token',
        token_type: 'Bearer',
        expires_in: 604_800,
        scope: 'identify',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );

  // Helper : seed l'appId via instanceConfig pour simuler que
  // l'étape « discord-app » a été franchie. Sans ça, /setup/oauth
  // ne peut pas construire le `client_id` de la requête token.
  const seedAppId = async (
    instanceConfig: ReturnType<typeof createInstanceConfigService>,
  ): Promise<void> => {
    await instanceConfig.setStep(3, {
      discordAppId: APP_ID,
      discordPublicKey: '0'.repeat(64),
    });
  };

  it('200 sur secret valide : valid=true, clientSecret persisté', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => tokenOkResponse());
    const { app, instanceConfig } = await build(client, { fetchImpl });
    try {
      await seedAppId(instanceConfig);
      const res = await app.inject({
        method: 'POST',
        url: '/setup/oauth',
        payload: { clientSecret: CLIENT_SECRET },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ valid: true });

      const config = await instanceConfig.getConfig();
      expect(config.discordClientSecret).toBe(CLIENT_SECRET);
      expect(config.setupStep).toBeGreaterThanOrEqual(5);
    } finally {
      await app.close();
    }
  });

  it('appelle Discord en POST avec Basic auth + body form-urlencoded grant_type=client_credentials', async () => {
    const fetchImpl = vi.fn(async () => tokenOkResponse());
    const { app, instanceConfig } = await build(client, { fetchImpl });
    try {
      await seedAppId(instanceConfig);
      await app.inject({
        method: 'POST',
        url: '/setup/oauth',
        payload: { clientSecret: CLIENT_SECRET },
      });
      const expectedAuth = `Basic ${Buffer.from(`${APP_ID}:${CLIENT_SECRET}`).toString('base64')}`;
      expect(fetchImpl).toHaveBeenCalledWith(
        'https://discord.com/api/v10/oauth2/token',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            authorization: expectedAuth,
            'content-type': 'application/x-www-form-urlencoded',
          }),
          body: expect.stringContaining('grant_type=client_credentials'),
        }),
      );
    } finally {
      await app.close();
    }
  });

  it('200 valid=false si Discord retourne 401 (invalid_client) — rien persisté', async () => {
    const fetchImpl: FetchLike = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'invalid_client' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const { app, instanceConfig } = await build(client, { fetchImpl });
    try {
      await seedAppId(instanceConfig);
      const res = await app.inject({
        method: 'POST',
        url: '/setup/oauth',
        payload: { clientSecret: CLIENT_SECRET },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ valid: false, reason: 'invalid_secret' });

      const config = await instanceConfig.getConfig();
      expect(config.discordClientSecret).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('400 missing_app_id si l étape discord-app n a pas été franchie', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => tokenOkResponse());
    const { app } = await build(client, { fetchImpl });
    try {
      // Pas de seedAppId : l'instance_config est vierge.
      const res = await app.inject({
        method: 'POST',
        url: '/setup/oauth',
        payload: { clientSecret: CLIENT_SECRET },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'missing_app_id' });
      // Et pas d'appel à Discord puisque la précondition manque.
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('502 si Discord répond 5xx', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => new Response('ko', { status: 503 }));
    const { app, instanceConfig } = await build(client, { fetchImpl });
    try {
      await seedAppId(instanceConfig);
      const res = await app.inject({
        method: 'POST',
        url: '/setup/oauth',
        payload: { clientSecret: CLIENT_SECRET },
      });
      expect(res.statusCode).toBe(502);
      expect(res.json()).toMatchObject({ error: 'discord_unreachable' });
    } finally {
      await app.close();
    }
  });

  it('502 si fetch lève (réseau cassé)', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => {
      throw new Error('ENETUNREACH');
    });
    const { app, instanceConfig } = await build(client, { fetchImpl });
    try {
      await seedAppId(instanceConfig);
      const res = await app.inject({
        method: 'POST',
        url: '/setup/oauth',
        payload: { clientSecret: CLIENT_SECRET },
      });
      expect(res.statusCode).toBe(502);
    } finally {
      await app.close();
    }
  });

  it('400 sur body invalide (clientSecret manquant)', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => tokenOkResponse());
    const { app, instanceConfig } = await build(client, { fetchImpl });
    try {
      await seedAppId(instanceConfig);
      const res = await app.inject({
        method: 'POST',
        url: '/setup/oauth',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'invalid_body' });
    } finally {
      await app.close();
    }
  });

  it('403 quand la setup est terminée', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => tokenOkResponse());
    const { app, instanceConfig } = await build(client, { fetchImpl });
    try {
      await seedAppId(instanceConfig);
      await instanceConfig.setStep(7, { discordBotToken: 'tok' });
      await instanceConfig.complete();
      const res = await app.inject({
        method: 'POST',
        url: '/setup/oauth',
        payload: { clientSecret: CLIENT_SECRET },
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });
});

describe('POST /setup/identity', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  const APP_ID = '987654321098765432';
  const BOT_TOKEN = 'NjAwAAAAAAAAAA.OOOOOO.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const AVATAR_HASH = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
  const AVATAR_DATA_URI =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

  const patchOkResponse = (overrides: Record<string, unknown> = {}): Response =>
    new Response(
      JSON.stringify({
        id: APP_ID,
        name: 'Varde Bot',
        description: '',
        avatar: null,
        ...overrides,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );

  // Helper : précondition « token bot persisté » (étape 4 franchie).
  const seedToken = async (
    instanceConfig: ReturnType<typeof createInstanceConfigService>,
  ): Promise<void> => {
    await instanceConfig.setStep(3, {
      discordAppId: APP_ID,
      discordPublicKey: '0'.repeat(64),
    });
    await instanceConfig.setStep(4, { discordBotToken: BOT_TOKEN });
  };

  it('200 sur name + description : PATCH /applications/@me, persiste, retourne identité', async () => {
    const fetchImpl = vi.fn(async () =>
      patchOkResponse({ name: 'Varde Bot', description: 'Bot communautaire' }),
    );
    const { app, instanceConfig } = await build(client, { fetchImpl });
    try {
      await seedToken(instanceConfig);
      const res = await app.inject({
        method: 'POST',
        url: '/setup/identity',
        payload: { name: 'Varde Bot', description: 'Bot communautaire' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        name: 'Varde Bot',
        description: 'Bot communautaire',
      });

      const config = await instanceConfig.getConfig();
      expect(config.botName).toBe('Varde Bot');
      expect(config.botDescription).toBe('Bot communautaire');
      expect(config.setupStep).toBeGreaterThanOrEqual(6);
    } finally {
      await app.close();
    }
  });

  it('avatar : PATCH avec data URI, persiste l URL CDN dérivée du hash retourné', async () => {
    const fetchImpl = vi.fn(async () => patchOkResponse({ avatar: AVATAR_HASH }));
    const { app, instanceConfig } = await build(client, { fetchImpl });
    try {
      await seedToken(instanceConfig);
      const res = await app.inject({
        method: 'POST',
        url: '/setup/identity',
        payload: { avatar: AVATAR_DATA_URI },
      });
      expect(res.statusCode).toBe(200);
      const expectedUrl = `https://cdn.discordapp.com/app-icons/${APP_ID}/${AVATAR_HASH}.png`;
      expect(res.json()).toMatchObject({ avatarUrl: expectedUrl });

      const config = await instanceConfig.getConfig();
      expect(config.botAvatarUrl).toBe(expectedUrl);
    } finally {
      await app.close();
    }
  });

  it('appelle Discord en PATCH avec Authorization: Bot <token> et body JSON ciblé', async () => {
    const fetchImpl = vi.fn(async () => patchOkResponse({ name: 'NewName' }));
    const { app, instanceConfig } = await build(client, { fetchImpl });
    try {
      await seedToken(instanceConfig);
      await app.inject({
        method: 'POST',
        url: '/setup/identity',
        payload: { name: 'NewName' },
      });
      expect(fetchImpl).toHaveBeenCalledWith(
        'https://discord.com/api/v10/applications/@me',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            authorization: `Bot ${BOT_TOKEN}`,
            'content-type': 'application/json',
          }),
          // Le body inclut uniquement les champs fournis — partial PATCH.
          body: JSON.stringify({ name: 'NewName' }),
        }),
      );
    } finally {
      await app.close();
    }
  });

  it('skip (body vide) : pas d appel Discord, bump setupStep à 6', async () => {
    const fetchImpl = vi.fn(async () => patchOkResponse());
    const { app, instanceConfig } = await build(client, { fetchImpl });
    try {
      await seedToken(instanceConfig);
      const res = await app.inject({
        method: 'POST',
        url: '/setup/identity',
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      expect(fetchImpl).not.toHaveBeenCalled();

      const config = await instanceConfig.getConfig();
      expect(config.setupStep).toBeGreaterThanOrEqual(6);
      expect(config.botName).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('400 missing_bot_token si l étape bot-token n a pas été franchie', async () => {
    const fetchImpl = vi.fn(async () => patchOkResponse());
    const { app } = await build(client, { fetchImpl });
    try {
      // Pas de seedToken : instance_config vierge.
      const res = await app.inject({
        method: 'POST',
        url: '/setup/identity',
        payload: { name: 'X' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'missing_bot_token' });
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('400 sur name trop long (> 32)', async () => {
    const fetchImpl = vi.fn(async () => patchOkResponse());
    const { app, instanceConfig } = await build(client, { fetchImpl });
    try {
      await seedToken(instanceConfig);
      const res = await app.inject({
        method: 'POST',
        url: '/setup/identity',
        payload: { name: 'X'.repeat(33) },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'invalid_body' });
    } finally {
      await app.close();
    }
  });

  it('400 sur description trop longue (> 400)', async () => {
    const fetchImpl = vi.fn(async () => patchOkResponse());
    const { app, instanceConfig } = await build(client, { fetchImpl });
    try {
      await seedToken(instanceConfig);
      const res = await app.inject({
        method: 'POST',
        url: '/setup/identity',
        payload: { description: 'X'.repeat(401) },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('502 si Discord répond 5xx', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => new Response('ko', { status: 503 }));
    const { app, instanceConfig } = await build(client, { fetchImpl });
    try {
      await seedToken(instanceConfig);
      const res = await app.inject({
        method: 'POST',
        url: '/setup/identity',
        payload: { name: 'X' },
      });
      expect(res.statusCode).toBe(502);
      expect(res.json()).toMatchObject({ error: 'discord_unreachable' });
    } finally {
      await app.close();
    }
  });

  it('502 si fetch lève (réseau cassé)', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => {
      throw new Error('ENETUNREACH');
    });
    const { app, instanceConfig } = await build(client, { fetchImpl });
    try {
      await seedToken(instanceConfig);
      const res = await app.inject({
        method: 'POST',
        url: '/setup/identity',
        payload: { name: 'X' },
      });
      expect(res.statusCode).toBe(502);
    } finally {
      await app.close();
    }
  });

  it('403 quand la setup est terminée', async () => {
    const fetchImpl = vi.fn(async () => patchOkResponse());
    const { app, instanceConfig } = await build(client, { fetchImpl });
    try {
      await seedToken(instanceConfig);
      await instanceConfig.complete();
      const res = await app.inject({
        method: 'POST',
        url: '/setup/identity',
        payload: { name: 'X' },
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });
});

describe('POST /setup/complete', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  // Helper : seed les 4 champs obligatoires (appId + publicKey + bot
  // token + client secret) — sinon /setup/complete refuse de finir.
  const seedAllRequired = async (
    instanceConfig: ReturnType<typeof createInstanceConfigService>,
  ): Promise<void> => {
    await instanceConfig.setStep(3, {
      discordAppId: '987654321098765432',
      discordPublicKey: '0'.repeat(64),
    });
    await instanceConfig.setStep(4, {
      discordBotToken: 'NjAwAAAAAAAAAA.OOOOOO.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    await instanceConfig.setStep(5, {
      discordClientSecret: 'aZbYcXdW1234567890_-secret_value',
    });
  };

  it('200 ok=true sur happy path : setup_completed_at posé, onReady déclenché', async () => {
    const { app, instanceConfig } = await build(client);
    try {
      await seedAllRequired(instanceConfig);
      const onReady = vi.fn();
      instanceConfig.onReady(onReady);

      const res = await app.inject({ method: 'POST', url: '/setup/complete' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
      expect(onReady).toHaveBeenCalledTimes(1);

      // Statut DB désormais configured=true.
      const config = await instanceConfig.getConfig();
      expect(config.setupCompletedAt).toBeInstanceOf(Date);
    } finally {
      await app.close();
    }
  });

  it('400 missing_required_fields si appId absent', async () => {
    const { app, instanceConfig } = await build(client);
    try {
      // Tout sauf appId.
      await instanceConfig.setStep(4, {
        discordBotToken: 'tok-long-enough-for-zod',
      });
      await instanceConfig.setStep(5, {
        discordClientSecret: 'secret_long_enough',
      });

      const res = await app.inject({ method: 'POST', url: '/setup/complete' });
      expect(res.statusCode).toBe(400);
      const body = res.json() as { error: string; details?: { missing?: string[] } };
      expect(body.error).toBe('missing_required_fields');
      expect(body.details?.missing).toContain('discordAppId');

      // Setup PAS finalisée — l'écriture est protégée par le check.
      const config = await instanceConfig.getConfig();
      expect(config.setupCompletedAt).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('400 missing_required_fields liste tous les champs absents', async () => {
    const { app } = await build(client);
    try {
      // DB vierge : tous les champs obligatoires manquent.
      const res = await app.inject({ method: 'POST', url: '/setup/complete' });
      expect(res.statusCode).toBe(400);
      const body = res.json() as { details?: { missing?: string[] } };
      expect(body.details?.missing).toEqual(
        expect.arrayContaining([
          'discordAppId',
          'discordPublicKey',
          'discordBotToken',
          'discordClientSecret',
        ]),
      );
    } finally {
      await app.close();
    }
  });

  it('200 ok=false sur timeout : un onReady handler bloque, le route répond avant', async () => {
    const { app, instanceConfig } = await build(client, {
      // Timeout très court côté test pour ne pas attendre 30 s.
      // Le handler est branché plus bas et hang volontairement.
      completeTimeoutMs: 50,
    });
    try {
      await seedAllRequired(instanceConfig);
      // Handler qui ne résout jamais — simule un login Discord qui
      // n'aboutit pas dans la fenêtre de timeout.
      instanceConfig.onReady(() => new Promise<void>(() => undefined));

      const res = await app.inject({ method: 'POST', url: '/setup/complete' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: false, error: 'timeout' });

      // setup_completed_at est néanmoins posé en DB — le timeout
      // concerne uniquement la connexion gateway, pas la persistance.
      const config = await instanceConfig.getConfig();
      expect(config.setupCompletedAt).toBeInstanceOf(Date);
    } finally {
      await app.close();
    }
  });

  it('403 sur appel répété (preHandler : setup déjà terminée)', async () => {
    const { app, instanceConfig } = await build(client);
    try {
      await seedAllRequired(instanceConfig);
      const first = await app.inject({ method: 'POST', url: '/setup/complete' });
      expect(first.statusCode).toBe(200);

      const second = await app.inject({ method: 'POST', url: '/setup/complete' });
      expect(second.statusCode).toBe(403);
      expect(second.json()).toMatchObject({ error: 'setup_completed' });
    } finally {
      await app.close();
    }
  });
});
