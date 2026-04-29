import { randomBytes } from 'node:crypto';

import { createInstanceConfigService, createLogger, createOwnershipService } from '@varde/core';
import { applyMigrations, createDbClient, type DbClient } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type Authenticator,
  createApiServer,
  type FetchLike,
  registerAdminDiscordRoutes,
  type SessionData,
} from '../../src/index.js';

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

const headerAuthenticator: Authenticator = (request) => {
  const raw = request.headers['x-test-session'];
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
};

const setupClient = async (): Promise<DbClient<'sqlite'>> => {
  const client = createDbClient({ driver: 'sqlite', url: ':memory:' });
  await applyMigrations(client);
  return client;
};

const APP_ID = '987654321098765432';
const OTHER_APP_ID = '123456789012345678';
const PUBLIC_KEY = '0'.repeat(64);
const NEW_PUBLIC_KEY = 'a'.repeat(64);
const BOT_TOKEN = 'mock-bot-token-old-aaaa';
const NEW_TOKEN = 'mock-bot-token-new-bbbb';
const CLIENT_SECRET = 'old-client-secret';
const NEW_CLIENT_SECRET = 'new-client-secret';

interface BuildOptions {
  readonly fetchImpl?: FetchLike;
  readonly seedToken?: boolean;
  readonly seedSecret?: boolean;
  readonly seedAppId?: boolean;
}

const build = async (
  client: DbClient<'sqlite'>,
  buildOptions: BuildOptions = {},
): Promise<{
  app: Awaited<ReturnType<typeof createApiServer>>;
  ownership: ReturnType<typeof createOwnershipService>;
  instanceConfig: ReturnType<typeof createInstanceConfigService>;
}> => {
  const ownership = createOwnershipService({ client });
  const masterKey = randomBytes(32);
  const instanceConfig = createInstanceConfigService({
    client,
    masterKey,
    logger: silentLogger(),
  });
  if (buildOptions.seedAppId !== false) {
    await instanceConfig.setStep(3, {
      discordAppId: APP_ID,
      discordPublicKey: PUBLIC_KEY,
    });
  }
  if (buildOptions.seedToken !== false) {
    await instanceConfig.setStep(4, { discordBotToken: BOT_TOKEN });
  }
  if (buildOptions.seedSecret === true) {
    await instanceConfig.setStep(5, { discordClientSecret: CLIENT_SECRET });
  }
  const app = await createApiServer({
    logger: silentLogger(),
    version: 'test',
    authenticator: headerAuthenticator,
    rateLimitMax: false,
  });
  registerAdminDiscordRoutes(app, {
    ownership,
    instanceConfig,
    logger: silentLogger(),
    ...(buildOptions.fetchImpl ? { fetchImpl: buildOptions.fetchImpl } : {}),
  });
  return { app, ownership, instanceConfig };
};

const ownerSession = (userId: string): Record<string, string> => ({
  'x-test-session': JSON.stringify({ userId }),
});

const appMeOk = (overrides: Record<string, unknown> = {}): Response =>
  new Response(JSON.stringify({ id: APP_ID, flags: 0, ...overrides }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const usersMeOk = (): Response =>
  new Response(JSON.stringify({ id: 'bot-user-id', username: 'TestBot' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const rpcOk = (): Response =>
  new Response(JSON.stringify({ id: APP_ID, name: 'Varde' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const oauthOk = (): Response =>
  new Response(JSON.stringify({ access_token: 'token', token_type: 'Bearer' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('GET /admin/discord', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('200 reflète appId, publicKey, tokenLastFour, hasClientSecret, intents', async () => {
    // flags: bit 13 (PRESENCE non-LIMITED) + bit 14 (GUILD_MEMBERS LIMITED)
    const flags = (1 << 13) | (1 << 14);
    const fetchImpl = vi.fn(async () => appMeOk({ flags }));
    const { app, ownership } = await build(client, { fetchImpl, seedSecret: true });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'GET',
        url: '/admin/discord',
        headers: ownerSession('111111111111111111'),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        appId: APP_ID,
        publicKey: PUBLIC_KEY,
        tokenLastFour: BOT_TOKEN.slice(-4),
        hasClientSecret: true,
        intents: { presence: true, members: true, messageContent: false },
      });
    } finally {
      await app.close();
    }
  });

  it('200 sur instance vierge : tout null + intents=null', async () => {
    const fetchImpl = vi.fn(async () => appMeOk());
    const { app, ownership } = await build(client, {
      fetchImpl,
      seedToken: false,
      seedAppId: false,
    });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'GET',
        url: '/admin/discord',
        headers: ownerSession('111111111111111111'),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        appId: null,
        publicKey: null,
        tokenLastFour: null,
        hasClientSecret: false,
        intents: null,
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('intents=null si Discord retourne 5xx (pas d échec côté GET)', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => new Response('ko', { status: 503 }));
    const { app, ownership } = await build(client, { fetchImpl });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'GET',
        url: '/admin/discord',
        headers: ownerSession('111111111111111111'),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { intents: unknown };
      expect(body.intents).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('401 sans session', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({ method: 'GET', url: '/admin/discord' });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('404 si la session n est pas un owner', async () => {
    const { app, ownership } = await build(client);
    try {
      await ownership.claimFirstOwnership('999999999999999999');
      const res = await app.inject({
        method: 'GET',
        url: '/admin/discord',
        headers: ownerSession('111111111111111111'),
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('POST /admin/discord/reveal-token', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('200 retourne le token bot complet avec confirmation:true', async () => {
    const { app, ownership } = await build(client);
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'POST',
        url: '/admin/discord/reveal-token',
        headers: ownerSession('111111111111111111'),
        payload: { confirmation: true },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ token: BOT_TOKEN });
    } finally {
      await app.close();
    }
  });

  it('400 sans confirmation', async () => {
    const { app, ownership } = await build(client);
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'POST',
        url: '/admin/discord/reveal-token',
        headers: ownerSession('111111111111111111'),
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('400 missing_bot_token sans token persisté', async () => {
    const { app, ownership } = await build(client, { seedToken: false });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'POST',
        url: '/admin/discord/reveal-token',
        headers: ownerSession('111111111111111111'),
        payload: { confirmation: true },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'missing_bot_token' });
    } finally {
      await app.close();
    }
  });

  it('401 sans session', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/admin/discord/reveal-token',
        payload: { confirmation: true },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('404 si la session n est pas un owner', async () => {
    const { app, ownership } = await build(client);
    try {
      await ownership.claimFirstOwnership('999999999999999999');
      const res = await app.inject({
        method: 'POST',
        url: '/admin/discord/reveal-token',
        headers: ownerSession('111111111111111111'),
        payload: { confirmation: true },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('PUT /admin/discord/app', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('200 valide via /applications/{id}/rpc et persiste', async () => {
    let calls = 0;
    const fetchImpl: FetchLike = vi.fn(async (url) => {
      calls++;
      if (typeof url === 'string' && url.includes('/rpc')) {
        return rpcOk();
      }
      return appMeOk();
    });
    const { app, ownership, instanceConfig } = await build(client, { fetchImpl });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const newAppId = '111122223333444455';
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/discord/app',
        headers: ownerSession('111111111111111111'),
        payload: { appId: newAppId, publicKey: NEW_PUBLIC_KEY },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { appId: string; publicKey: string };
      expect(body.appId).toBe(newAppId);
      expect(body.publicKey).toBe(NEW_PUBLIC_KEY);
      const config = await instanceConfig.getConfig();
      expect(config.discordAppId).toBe(newAppId);
      expect(config.discordPublicKey).toBe(NEW_PUBLIC_KEY);
      expect(calls).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });

  it('400 sur snowflake invalide', async () => {
    const fetchImpl = vi.fn(async () => rpcOk());
    const { app, ownership } = await build(client, { fetchImpl });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/discord/app',
        headers: ownerSession('111111111111111111'),
        payload: { appId: 'not-a-snowflake', publicKey: NEW_PUBLIC_KEY },
      });
      expect(res.statusCode).toBe(400);
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('404 discord_app_not_found si Discord retourne 404 sur /rpc', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => new Response('not found', { status: 404 }));
    const { app, ownership } = await build(client, { fetchImpl });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/discord/app',
        headers: ownerSession('111111111111111111'),
        payload: { appId: '111122223333444455', publicKey: NEW_PUBLIC_KEY },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ error: 'discord_app_not_found' });
    } finally {
      await app.close();
    }
  });

  it('401 sans session', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/discord/app',
        payload: { appId: APP_ID, publicKey: PUBLIC_KEY },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('404 si la session n est pas un owner', async () => {
    const { app, ownership } = await build(client);
    try {
      await ownership.claimFirstOwnership('999999999999999999');
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/discord/app',
        headers: ownerSession('111111111111111111'),
        payload: { appId: APP_ID, publicKey: PUBLIC_KEY },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('PUT /admin/discord/token', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('200 valide via /users/@me + /applications/@me et persiste (même app id)', async () => {
    const fetchImpl: FetchLike = vi.fn(async (url) => {
      if (typeof url === 'string' && url.includes('/users/@me')) return usersMeOk();
      return appMeOk();
    });
    const { app, ownership, instanceConfig } = await build(client, { fetchImpl });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/discord/token',
        headers: ownerSession('111111111111111111'),
        payload: { token: NEW_TOKEN },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { tokenLastFour: string; appId: string };
      expect(body.tokenLastFour).toBe(NEW_TOKEN.slice(-4));
      expect(body.appId).toBe(APP_ID);
      const config = await instanceConfig.getConfig();
      expect(config.discordBotToken).toBe(NEW_TOKEN);
    } finally {
      await app.close();
    }
  });

  it('400 invalid_token si Discord retourne 401', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => new Response('unauth', { status: 401 }));
    const { app, ownership, instanceConfig } = await build(client, { fetchImpl });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/discord/token',
        headers: ownerSession('111111111111111111'),
        payload: { token: NEW_TOKEN },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'invalid_token' });
      const config = await instanceConfig.getConfig();
      expect(config.discordBotToken).toBe(BOT_TOKEN);
    } finally {
      await app.close();
    }
  });

  it('409 app_id_mismatch si app id diffère sans confirmAppChange', async () => {
    const fetchImpl: FetchLike = vi.fn(async (url) => {
      if (typeof url === 'string' && url.includes('/users/@me')) return usersMeOk();
      return appMeOk({ id: OTHER_APP_ID });
    });
    const { app, ownership, instanceConfig } = await build(client, { fetchImpl });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/discord/token',
        headers: ownerSession('111111111111111111'),
        payload: { token: NEW_TOKEN },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: 'app_id_mismatch' });
      const config = await instanceConfig.getConfig();
      expect(config.discordBotToken).toBe(BOT_TOKEN);
    } finally {
      await app.close();
    }
  });

  it('200 quand confirmAppChange:true → persiste token + nouveau app id', async () => {
    const fetchImpl: FetchLike = vi.fn(async (url) => {
      if (typeof url === 'string' && url.includes('/users/@me')) return usersMeOk();
      return appMeOk({ id: OTHER_APP_ID });
    });
    const { app, ownership, instanceConfig } = await build(client, { fetchImpl });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/discord/token',
        headers: ownerSession('111111111111111111'),
        payload: { token: NEW_TOKEN, confirmAppChange: true },
      });
      expect(res.statusCode).toBe(200);
      const config = await instanceConfig.getConfig();
      expect(config.discordBotToken).toBe(NEW_TOKEN);
      expect(config.discordAppId).toBe(OTHER_APP_ID);
    } finally {
      await app.close();
    }
  });

  it('401 sans session', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/discord/token',
        payload: { token: NEW_TOKEN },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('404 si la session n est pas un owner', async () => {
    const { app, ownership } = await build(client);
    try {
      await ownership.claimFirstOwnership('999999999999999999');
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/discord/token',
        headers: ownerSession('111111111111111111'),
        payload: { token: NEW_TOKEN },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('PUT /admin/discord/oauth', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('200 valide via client_credentials et persiste', async () => {
    const fetchImpl = vi.fn(async () => oauthOk());
    const { app, ownership, instanceConfig } = await build(client, { fetchImpl });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/discord/oauth',
        headers: ownerSession('111111111111111111'),
        payload: { clientSecret: NEW_CLIENT_SECRET },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { hasClientSecret: boolean };
      expect(body.hasClientSecret).toBe(true);
      const config = await instanceConfig.getConfig();
      expect(config.discordClientSecret).toBe(NEW_CLIENT_SECRET);
    } finally {
      await app.close();
    }
  });

  it('400 invalid_secret si Discord retourne 401', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => new Response('unauth', { status: 401 }));
    const { app, ownership, instanceConfig } = await build(client, { fetchImpl, seedSecret: true });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/discord/oauth',
        headers: ownerSession('111111111111111111'),
        payload: { clientSecret: NEW_CLIENT_SECRET },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'invalid_secret' });
      const config = await instanceConfig.getConfig();
      expect(config.discordClientSecret).toBe(CLIENT_SECRET);
    } finally {
      await app.close();
    }
  });

  it('400 missing_app_id si pas d app id persisté', async () => {
    const fetchImpl = vi.fn(async () => oauthOk());
    const { app, ownership } = await build(client, {
      fetchImpl,
      seedAppId: false,
      seedToken: false,
    });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/discord/oauth',
        headers: ownerSession('111111111111111111'),
        payload: { clientSecret: NEW_CLIENT_SECRET },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'missing_app_id' });
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('401 sans session', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/discord/oauth',
        payload: { clientSecret: NEW_CLIENT_SECRET },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('404 si la session n est pas un owner', async () => {
    const { app, ownership } = await build(client);
    try {
      await ownership.claimFirstOwnership('999999999999999999');
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/discord/oauth',
        headers: ownerSession('111111111111111111'),
        payload: { clientSecret: NEW_CLIENT_SECRET },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
