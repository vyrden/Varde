import { randomBytes } from 'node:crypto';

import { createInstanceConfigService, createLogger, createOwnershipService } from '@varde/core';
import { applyMigrations, createDbClient, type DbClient } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type Authenticator,
  createApiServer,
  type FetchLike,
  registerAdminIdentityRoutes,
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
const PUBLIC_KEY = '0'.repeat(64);
const BOT_TOKEN = 'mock-bot-token';
const AVATAR_HASH = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
const AVATAR_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

interface BuildOptions {
  readonly fetchImpl?: FetchLike;
  readonly seedToken?: boolean;
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
  if (buildOptions.seedToken !== false) {
    await instanceConfig.setStep(3, {
      discordAppId: APP_ID,
      discordPublicKey: PUBLIC_KEY,
    });
    await instanceConfig.setStep(4, { discordBotToken: BOT_TOKEN });
  }
  const app = await createApiServer({
    logger: silentLogger(),
    version: 'test',
    authenticator: headerAuthenticator,
    rateLimitMax: false,
  });
  registerAdminIdentityRoutes(app, {
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

const patchOk = (overrides: Record<string, unknown> = {}): Response =>
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

describe('GET /admin/identity', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('200 retourne null partout sur instance vierge', async () => {
    const { app, ownership } = await build(client, { seedToken: false });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'GET',
        url: '/admin/identity',
        headers: ownerSession('111111111111111111'),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        name: null,
        avatarUrl: null,
        bannerUrl: null,
        description: null,
      });
    } finally {
      await app.close();
    }
  });

  it('200 reflète les valeurs persistées', async () => {
    const { app, ownership, instanceConfig } = await build(client);
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      await instanceConfig.setStep(6, {
        botName: 'Varde',
        botAvatarUrl: 'https://cdn.example.com/avatar.png',
        botDescription: 'Le bot.',
      });
      const res = await app.inject({
        method: 'GET',
        url: '/admin/identity',
        headers: ownerSession('111111111111111111'),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        name: 'Varde',
        avatarUrl: 'https://cdn.example.com/avatar.png',
        bannerUrl: null,
        description: 'Le bot.',
      });
    } finally {
      await app.close();
    }
  });

  it('401 sans session', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({ method: 'GET', url: '/admin/identity' });
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
        url: '/admin/identity',
        headers: ownerSession('111111111111111111'),
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('PUT /admin/identity', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('200 met à jour name + description côté Discord et persiste', async () => {
    const fetchImpl = vi.fn(async () =>
      patchOk({ name: 'Varde Bot', description: 'Bot communautaire' }),
    );
    const { app, ownership, instanceConfig } = await build(client, { fetchImpl });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/identity',
        headers: ownerSession('111111111111111111'),
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
    } finally {
      await app.close();
    }
  });

  it('avatar : data URI envoyée à Discord, URL CDN dérivée du hash retourné', async () => {
    const fetchImpl = vi.fn(async () => patchOk({ avatar: AVATAR_HASH }));
    const { app, ownership, instanceConfig } = await build(client, { fetchImpl });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/identity',
        headers: ownerSession('111111111111111111'),
        payload: { avatar: AVATAR_DATA_URI },
      });
      const expectedUrl = `https://cdn.discordapp.com/app-icons/${APP_ID}/${AVATAR_HASH}.png`;
      expect(res.json()).toMatchObject({ avatarUrl: expectedUrl });
      const config = await instanceConfig.getConfig();
      expect(config.botAvatarUrl).toBe(expectedUrl);
    } finally {
      await app.close();
    }
  });

  it('appelle Discord en PATCH /applications/@me avec Authorization Bot + body partiel', async () => {
    const fetchImpl = vi.fn(async () => patchOk({ name: 'NewName' }));
    const { app, ownership } = await build(client, { fetchImpl });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      await app.inject({
        method: 'PUT',
        url: '/admin/identity',
        headers: ownerSession('111111111111111111'),
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
          body: JSON.stringify({ name: 'NewName' }),
        }),
      );
    } finally {
      await app.close();
    }
  });

  it('400 missing_bot_token sans token persisté', async () => {
    const fetchImpl = vi.fn(async () => patchOk());
    const { app, ownership } = await build(client, {
      fetchImpl,
      seedToken: false,
    });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/identity',
        headers: ownerSession('111111111111111111'),
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
    const { app, ownership } = await build(client);
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/identity',
        headers: ownerSession('111111111111111111'),
        payload: { name: 'X'.repeat(33) },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('429 rate_limited propage retry_after_ms quand Discord 429', async () => {
    const fetchImpl: FetchLike = vi.fn(
      async () =>
        new Response(JSON.stringify({ retry_after: 1.5 }), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const { app, ownership } = await build(client, { fetchImpl });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/identity',
        headers: ownerSession('111111111111111111'),
        payload: { name: 'X' },
      });
      expect(res.statusCode).toBe(429);
      const body = res.json() as { error: string; retryAfterMs?: number };
      expect(body.error).toBe('rate_limited');
      expect(body.retryAfterMs).toBe(1500);
    } finally {
      await app.close();
    }
  });

  it('502 si Discord répond 5xx', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => new Response('ko', { status: 503 }));
    const { app, ownership } = await build(client, { fetchImpl });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/identity',
        headers: ownerSession('111111111111111111'),
        payload: { name: 'X' },
      });
      expect(res.statusCode).toBe(502);
    } finally {
      await app.close();
    }
  });

  it('PUT body vide retourne l identité actuelle (no-op explicit)', async () => {
    const fetchImpl = vi.fn(async () => patchOk());
    const { app, ownership, instanceConfig } = await build(client, { fetchImpl });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      await instanceConfig.setStep(6, { botName: 'Existing' });
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/identity',
        headers: ownerSession('111111111111111111'),
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ name: 'Existing' });
      // Pas d'appel Discord pour un PUT vide.
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
        url: '/admin/identity',
        payload: { name: 'X' },
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
        url: '/admin/identity',
        headers: ownerSession('111111111111111111'),
        payload: { name: 'X' },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
