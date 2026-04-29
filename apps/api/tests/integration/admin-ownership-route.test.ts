import { randomBytes } from 'node:crypto';

import { createInstanceConfigService, createLogger, createOwnershipService } from '@varde/core';
import { applyMigrations, createDbClient, type DbClient } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type Authenticator,
  createApiServer,
  type FetchLike,
  registerAdminOwnershipRoutes,
  type SessionData,
} from '../../src/index.js';

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

const noAuthAuthenticator: Authenticator = (): SessionData | null => null;

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

interface BuildOptions {
  readonly authenticator?: Authenticator;
  readonly fetchImpl?: FetchLike;
  readonly seedBotToken?: boolean;
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
  if (buildOptions.seedBotToken !== false) {
    await instanceConfig.setStep(4, { discordBotToken: 'mock-bot-token' });
  }
  const app = await createApiServer({
    logger: silentLogger(),
    version: 'test',
    authenticator: buildOptions.authenticator ?? noAuthAuthenticator,
    rateLimitMax: false,
  });
  registerAdminOwnershipRoutes(app, {
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

const userResponse = (id: string, username: string): Response =>
  new Response(JSON.stringify({ id, username, discriminator: '0' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('POST /admin/ownership/claim-first', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('200 claimed=true et persiste l owner sur DB vide', async () => {
    const { app, ownership } = await build(client);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/admin/ownership/claim-first',
        payload: { discordUserId: '111111111111111111', username: 'alice' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ claimed: true });
      expect(await ownership.isOwner('111111111111111111')).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('200 claimed=false en idempotence (table déjà non-vide)', async () => {
    const { app, ownership } = await build(client);
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'POST',
        url: '/admin/ownership/claim-first',
        payload: { discordUserId: '222222222222222222' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ claimed: false });
      expect(await ownership.isOwner('222222222222222222')).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('200 claimed=false sur 2e appel avec le même user (no-op)', async () => {
    const { app } = await build(client);
    try {
      const first = await app.inject({
        method: 'POST',
        url: '/admin/ownership/claim-first',
        payload: { discordUserId: '111111111111111111' },
      });
      expect(first.json()).toEqual({ claimed: true });
      const second = await app.inject({
        method: 'POST',
        url: '/admin/ownership/claim-first',
        payload: { discordUserId: '111111111111111111' },
      });
      expect(second.json()).toEqual({ claimed: false });
    } finally {
      await app.close();
    }
  });

  it('400 sur body invalide (discordUserId manquant)', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/admin/ownership/claim-first',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'invalid_body' });
    } finally {
      await app.close();
    }
  });

  it('400 sur discordUserId mal formé (pas un snowflake)', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/admin/ownership/claim-first',
        payload: { discordUserId: 'pas-un-snowflake' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('aucune session requise (pas de 401)', async () => {
    const { app } = await build(client);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/admin/ownership/claim-first',
        payload: { discordUserId: '111111111111111111' },
      });
      expect(res.statusCode).not.toBe(401);
    } finally {
      await app.close();
    }
  });
});

describe('GET /admin/ownership', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('200 retourne la liste des owners pour un owner authentifié', async () => {
    const { app, ownership } = await build(client, {
      authenticator: headerAuthenticator,
    });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      await ownership.addOwner('222222222222222222', '111111111111111111');
      const res = await app.inject({
        method: 'GET',
        url: '/admin/ownership',
        headers: ownerSession('111111111111111111'),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        owners: { discordUserId: string; grantedByDiscordUserId: string | null }[];
      };
      expect(body.owners.map((o) => o.discordUserId)).toEqual([
        '111111111111111111',
        '222222222222222222',
      ]);
      expect(body.owners[0]?.grantedByDiscordUserId).toBeNull();
      expect(body.owners[1]?.grantedByDiscordUserId).toBe('111111111111111111');
    } finally {
      await app.close();
    }
  });

  it('401 sans session', async () => {
    const { app } = await build(client, { authenticator: headerAuthenticator });
    try {
      const res = await app.inject({ method: 'GET', url: '/admin/ownership' });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('404 si la session n est pas un owner (ne révèle pas l existence)', async () => {
    const { app, ownership } = await build(client, {
      authenticator: headerAuthenticator,
    });
    try {
      await ownership.claimFirstOwnership('999999999999999999');
      const res = await app.inject({
        method: 'GET',
        url: '/admin/ownership',
        headers: ownerSession('111111111111111111'),
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('POST /admin/ownership', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('200 ajoute un owner après validation Discord du discordUserId', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => userResponse('222222222222222222', 'bob'));
    const { app, ownership } = await build(client, {
      authenticator: headerAuthenticator,
      fetchImpl,
    });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'POST',
        url: '/admin/ownership',
        headers: ownerSession('111111111111111111'),
        payload: { discordUserId: '222222222222222222' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ added: true });
      expect(await ownership.isOwner('222222222222222222')).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('appelle Discord en GET /users/{id} avec Authorization: Bot <token>', async () => {
    const fetchImpl = vi.fn(async () => userResponse('222222222222222222', 'bob'));
    const { app, ownership } = await build(client, {
      authenticator: headerAuthenticator,
      fetchImpl,
    });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      await app.inject({
        method: 'POST',
        url: '/admin/ownership',
        headers: ownerSession('111111111111111111'),
        payload: { discordUserId: '222222222222222222' },
      });
      expect(fetchImpl).toHaveBeenCalledWith(
        'https://discord.com/api/v10/users/222222222222222222',
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: 'Bot mock-bot-token' }),
        }),
      );
    } finally {
      await app.close();
    }
  });

  it('400 invalid_user si Discord retourne 404', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => new Response('not found', { status: 404 }));
    const { app, ownership } = await build(client, {
      authenticator: headerAuthenticator,
      fetchImpl,
    });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'POST',
        url: '/admin/ownership',
        headers: ownerSession('111111111111111111'),
        payload: { discordUserId: '222222222222222222' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'invalid_user' });
      expect(await ownership.isOwner('222222222222222222')).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('400 missing_bot_token si la setup n a pas posé de token', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => userResponse('222', 'x'));
    const { app, ownership } = await build(client, {
      authenticator: headerAuthenticator,
      fetchImpl,
      seedBotToken: false,
    });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'POST',
        url: '/admin/ownership',
        headers: ownerSession('111111111111111111'),
        payload: { discordUserId: '222222222222222222' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'missing_bot_token' });
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('502 discord_unreachable si Discord répond 5xx', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => new Response('ko', { status: 503 }));
    const { app, ownership } = await build(client, {
      authenticator: headerAuthenticator,
      fetchImpl,
    });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'POST',
        url: '/admin/ownership',
        headers: ownerSession('111111111111111111'),
        payload: { discordUserId: '222222222222222222' },
      });
      expect(res.statusCode).toBe(502);
    } finally {
      await app.close();
    }
  });

  it('idempotent : ajout d un owner déjà inscrit ne lève pas, retourne added=true', async () => {
    const fetchImpl = vi.fn(async () => userResponse('222222222222222222', 'bob'));
    const { app, ownership } = await build(client, {
      authenticator: headerAuthenticator,
      fetchImpl,
    });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      await ownership.addOwner('222222222222222222', '111111111111111111');
      const res = await app.inject({
        method: 'POST',
        url: '/admin/ownership',
        headers: ownerSession('111111111111111111'),
        payload: { discordUserId: '222222222222222222' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ added: true });
    } finally {
      await app.close();
    }
  });

  it('400 sur body invalide (snowflake mal formé)', async () => {
    const { app, ownership } = await build(client, {
      authenticator: headerAuthenticator,
    });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'POST',
        url: '/admin/ownership',
        headers: ownerSession('111111111111111111'),
        payload: { discordUserId: 'pas-un-snowflake' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('401 sans session', async () => {
    const { app } = await build(client, { authenticator: headerAuthenticator });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/admin/ownership',
        payload: { discordUserId: '222222222222222222' },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('404 si la session n est pas un owner', async () => {
    const { app, ownership } = await build(client, {
      authenticator: headerAuthenticator,
    });
    try {
      await ownership.claimFirstOwnership('999999999999999999');
      const res = await app.inject({
        method: 'POST',
        url: '/admin/ownership',
        headers: ownerSession('111111111111111111'),
        payload: { discordUserId: '222222222222222222' },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('DELETE /admin/ownership/:discordUserId', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('200 retire un owner quand il y en a plusieurs', async () => {
    const { app, ownership } = await build(client, {
      authenticator: headerAuthenticator,
    });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      await ownership.addOwner('222222222222222222', '111111111111111111');
      const res = await app.inject({
        method: 'DELETE',
        url: '/admin/ownership/222222222222222222',
        headers: ownerSession('111111111111111111'),
      });
      expect(res.statusCode).toBe(200);
      expect(await ownership.isOwner('222222222222222222')).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('409 last_owner si on tente de retirer le dernier owner', async () => {
    const { app, ownership } = await build(client, {
      authenticator: headerAuthenticator,
    });
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'DELETE',
        url: '/admin/ownership/111111111111111111',
        headers: ownerSession('111111111111111111'),
      });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: 'last_owner' });
      expect(await ownership.isOwner('111111111111111111')).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('401 sans session', async () => {
    const { app } = await build(client, { authenticator: headerAuthenticator });
    try {
      const res = await app.inject({
        method: 'DELETE',
        url: '/admin/ownership/222222222222222222',
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('404 si la session n est pas un owner', async () => {
    const { app, ownership } = await build(client, {
      authenticator: headerAuthenticator,
    });
    try {
      await ownership.claimFirstOwnership('999999999999999999');
      const res = await app.inject({
        method: 'DELETE',
        url: '/admin/ownership/999999999999999999',
        headers: ownerSession('111111111111111111'),
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
