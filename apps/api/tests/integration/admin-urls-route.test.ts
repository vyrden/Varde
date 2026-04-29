import { randomBytes } from 'node:crypto';

import { createInstanceConfigService, createLogger, createOwnershipService } from '@varde/core';
import { applyMigrations, createDbClient, type DbClient } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type Authenticator,
  createApiServer,
  registerAdminUrlsRoutes,
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

const ENV_BASE_URL = 'http://localhost:3000';

const build = async (
  client: DbClient<'sqlite'>,
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
  const app = await createApiServer({
    logger: silentLogger(),
    version: 'test',
    authenticator: headerAuthenticator,
    rateLimitMax: false,
  });
  registerAdminUrlsRoutes(app, {
    ownership,
    instanceConfig,
    logger: silentLogger(),
    envBaseUrl: ENV_BASE_URL,
  });
  return { app, ownership, instanceConfig };
};

const ownerSession = (userId: string): Record<string, string> => ({
  'x-test-session': JSON.stringify({ userId }),
});

describe('GET /admin/urls', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('200 retourne baseUrl=null + tableau vide sur instance vierge', async () => {
    const { app, ownership } = await build(client);
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'GET',
        url: '/admin/urls',
        headers: ownerSession('111111111111111111'),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ baseUrl: null, additionalUrls: [] });
    } finally {
      await app.close();
    }
  });

  it('200 reflète les URLs persistées', async () => {
    const { app, ownership, instanceConfig } = await build(client);
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      await instanceConfig.setStep(1, {
        baseUrl: 'https://varde.example.com',
        additionalUrls: [{ id: 'test-id-1', url: 'http://192.168.1.10:3000', label: 'LAN' }],
      });
      const res = await app.inject({
        method: 'GET',
        url: '/admin/urls',
        headers: ownerSession('111111111111111111'),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        baseUrl: 'https://varde.example.com',
        additionalUrls: [{ id: 'test-id-1', url: 'http://192.168.1.10:3000', label: 'LAN' }],
      });
    } finally {
      await app.close();
    }
  });

  it('401 sans session', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({ method: 'GET', url: '/admin/urls' });
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
        url: '/admin/urls',
        headers: ownerSession('111111111111111111'),
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('PUT /admin/urls/base', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('200 persiste la nouvelle baseUrl normalisée', async () => {
    const { app, ownership, instanceConfig } = await build(client);
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/urls/base',
        headers: ownerSession('111111111111111111'),
        payload: { baseUrl: 'https://varde.example.com/' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { baseUrl: string };
      expect(body.baseUrl).toBe('https://varde.example.com');
      const config = await instanceConfig.getConfig();
      expect(config.baseUrl).toBe('https://varde.example.com');
    } finally {
      await app.close();
    }
  });

  it('400 sur URL invalide', async () => {
    const { app, ownership } = await build(client);
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/urls/base',
        headers: ownerSession('111111111111111111'),
        payload: { baseUrl: 'not a url' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('400 sur protocole non http(s)', async () => {
    const { app, ownership } = await build(client);
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/urls/base',
        headers: ownerSession('111111111111111111'),
        payload: { baseUrl: 'ftp://varde.example.com' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('401 sans session', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({
        method: 'PUT',
        url: '/admin/urls/base',
        payload: { baseUrl: 'https://x.com' },
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
        url: '/admin/urls/base',
        headers: ownerSession('111111111111111111'),
        payload: { baseUrl: 'https://x.com' },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('POST /admin/urls', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('200 crée une URL avec id généré et label', async () => {
    const { app, ownership, instanceConfig } = await build(client);
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'POST',
        url: '/admin/urls',
        headers: ownerSession('111111111111111111'),
        payload: { url: 'http://192.168.1.10:3000', label: 'LAN' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        additionalUrls: { id: string; url: string; label?: string }[];
      };
      expect(body.additionalUrls).toHaveLength(1);
      const entry = body.additionalUrls[0];
      expect(entry).toBeDefined();
      expect(entry?.url).toBe('http://192.168.1.10:3000');
      expect(entry?.label).toBe('LAN');
      expect(entry?.id).toMatch(/^[0-9a-f-]{36}$/);
      const config = await instanceConfig.getConfig();
      expect(config.additionalUrls).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it('200 sans label : URL ajoutée sans label', async () => {
    const { app, ownership } = await build(client);
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'POST',
        url: '/admin/urls',
        headers: ownerSession('111111111111111111'),
        payload: { url: 'https://second.example.com' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        additionalUrls: { url: string; label?: string }[];
      };
      const entry = body.additionalUrls[0];
      expect(entry?.label).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it('409 url_already_exists si URL déjà présente', async () => {
    const { app, ownership } = await build(client);
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      await app.inject({
        method: 'POST',
        url: '/admin/urls',
        headers: ownerSession('111111111111111111'),
        payload: { url: 'http://x.com' },
      });
      const res = await app.inject({
        method: 'POST',
        url: '/admin/urls',
        headers: ownerSession('111111111111111111'),
        payload: { url: 'http://x.com' },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: 'url_already_exists' });
    } finally {
      await app.close();
    }
  });

  it('400 sur URL invalide', async () => {
    const { app, ownership } = await build(client);
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'POST',
        url: '/admin/urls',
        headers: ownerSession('111111111111111111'),
        payload: { url: 'not a url' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('401 sans session', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/admin/urls',
        payload: { url: 'https://x.com' },
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
        url: '/admin/urls',
        headers: ownerSession('111111111111111111'),
        payload: { url: 'https://x.com' },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('DELETE /admin/urls/:id', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('200 retire l URL et retourne le tableau mis à jour', async () => {
    const { app, ownership } = await build(client);
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const created = await app.inject({
        method: 'POST',
        url: '/admin/urls',
        headers: ownerSession('111111111111111111'),
        payload: { url: 'http://x.com' },
      });
      const { additionalUrls } = created.json() as {
        additionalUrls: { id: string }[];
      };
      const id = additionalUrls[0]?.id;
      expect(id).toBeDefined();
      const res = await app.inject({
        method: 'DELETE',
        url: `/admin/urls/${id}`,
        headers: ownerSession('111111111111111111'),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { additionalUrls: unknown[] };
      expect(body.additionalUrls).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('404 si id inconnu', async () => {
    const { app, ownership } = await build(client);
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'DELETE',
        url: '/admin/urls/does-not-exist',
        headers: ownerSession('111111111111111111'),
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ error: 'url_not_found' });
    } finally {
      await app.close();
    }
  });

  it('401 sans session', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({ method: 'DELETE', url: '/admin/urls/abc' });
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
        method: 'DELETE',
        url: '/admin/urls/abc',
        headers: ownerSession('111111111111111111'),
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('GET /admin/urls/redirect-uris', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('utilise envBaseUrl quand baseUrl=null', async () => {
    const { app, ownership } = await build(client);
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'GET',
        url: '/admin/urls/redirect-uris',
        headers: ownerSession('111111111111111111'),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        redirectUris: ['http://localhost:3000/api/auth/callback/discord'],
      });
    } finally {
      await app.close();
    }
  });

  it('liste base + additional avec dédup', async () => {
    const { app, ownership, instanceConfig } = await build(client);
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      await instanceConfig.setStep(1, {
        baseUrl: 'https://varde.example.com',
        additionalUrls: [
          { id: 'a', url: 'http://192.168.1.10:3000' },
          { id: 'b', url: 'https://varde.example.com' },
        ],
      });
      const res = await app.inject({
        method: 'GET',
        url: '/admin/urls/redirect-uris',
        headers: ownerSession('111111111111111111'),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { redirectUris: readonly string[] };
      expect(body.redirectUris).toEqual([
        'https://varde.example.com/api/auth/callback/discord',
        'http://192.168.1.10:3000/api/auth/callback/discord',
      ]);
    } finally {
      await app.close();
    }
  });

  it('401 sans session', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({ method: 'GET', url: '/admin/urls/redirect-uris' });
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
        url: '/admin/urls/redirect-uris',
        headers: ownerSession('111111111111111111'),
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
