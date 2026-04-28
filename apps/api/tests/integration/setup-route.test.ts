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

  it('200 sur DB vide : configured=false, currentStep=1', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({ method: 'GET', url: '/setup/status' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ configured: false, currentStep: 1 });
    } finally {
      await app.close();
    }
  });

  it('200 reflète setStep en cours', async () => {
    const { app, instanceConfig } = await build(client);
    try {
      await instanceConfig.setStep(4, { discordAppId: '111111111111111111' });
      const res = await app.inject({ method: 'GET', url: '/setup/status' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ configured: false, currentStep: 4 });
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
