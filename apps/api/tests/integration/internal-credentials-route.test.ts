import { randomBytes } from 'node:crypto';

import { createInstanceConfigService, createLogger } from '@varde/core';
import { applyMigrations, createDbClient, type DbClient } from '@varde/db';
import { describe, expect, it } from 'vitest';

import {
  type Authenticator,
  createApiServer,
  registerInternalCredentialsRoutes,
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

const APP_ID = '987654321098765432';
const CLIENT_SECRET = 'test-client-secret-very-real';
const INTERNAL_SECRET = 'shared-secret-between-api-and-dashboard';

const setupClient = async (): Promise<DbClient<'sqlite'>> => {
  const client = createDbClient({ driver: 'sqlite', url: ':memory:' });
  await applyMigrations(client);
  return client;
};

interface BuildOptions {
  readonly seedAppId?: boolean;
  readonly seedClientSecret?: boolean;
}

const build = async (
  client: DbClient<'sqlite'>,
  buildOptions: BuildOptions = {},
): Promise<{ app: Awaited<ReturnType<typeof createApiServer>> }> => {
  const masterKey = randomBytes(32);
  const instanceConfig = createInstanceConfigService({
    client,
    masterKey,
    logger: silentLogger(),
  });
  if (buildOptions.seedAppId !== false) {
    await instanceConfig.setStep(3, {
      discordAppId: APP_ID,
      discordPublicKey: '0'.repeat(64),
    });
  }
  if (buildOptions.seedClientSecret !== false) {
    await instanceConfig.setStep(5, { discordClientSecret: CLIENT_SECRET });
  }
  const app = await createApiServer({
    logger: silentLogger(),
    version: 'test',
    authenticator: headerAuthenticator,
    rateLimitMax: false,
  });
  registerInternalCredentialsRoutes(app, {
    instanceConfig,
    internalAuthSecret: INTERNAL_SECRET,
    logger: silentLogger(),
  });
  return { app };
};

describe('GET /internal/oauth-credentials', () => {
  it('rejette sans header Authorization', async () => {
    const client = await setupClient();
    const { app } = await build(client);

    const res = await app.inject({ method: 'GET', url: '/internal/oauth-credentials' });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'unauthenticated' });
  });

  it('rejette un Bearer faux', async () => {
    const client = await setupClient();
    const { app } = await build(client);

    const res = await app.inject({
      method: 'GET',
      url: '/internal/oauth-credentials',
      headers: { authorization: 'Bearer wrong-secret' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('rejette un schéma autre que Bearer', async () => {
    const client = await setupClient();
    const { app } = await build(client);

    const res = await app.inject({
      method: 'GET',
      url: '/internal/oauth-credentials',
      headers: { authorization: `Basic ${INTERNAL_SECRET}` },
    });

    expect(res.statusCode).toBe(401);
  });

  it('renvoie les credentials avec un Bearer valide', async () => {
    const client = await setupClient();
    const { app } = await build(client);

    const res = await app.inject({
      method: 'GET',
      url: '/internal/oauth-credentials',
      headers: { authorization: `Bearer ${INTERNAL_SECRET}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ clientId: APP_ID, clientSecret: CLIENT_SECRET });
  });

  it('renvoie 404 quand aucun appId n est configuré', async () => {
    const client = await setupClient();
    const { app } = await build(client, { seedAppId: false, seedClientSecret: false });

    const res = await app.inject({
      method: 'GET',
      url: '/internal/oauth-credentials',
      headers: { authorization: `Bearer ${INTERNAL_SECRET}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'not_configured' });
  });

  it('renvoie 404 quand le clientSecret n est pas encore posé', async () => {
    const client = await setupClient();
    const { app } = await build(client, { seedClientSecret: false });

    const res = await app.inject({
      method: 'GET',
      url: '/internal/oauth-credentials',
      headers: { authorization: `Bearer ${INTERNAL_SECRET}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'not_configured' });
  });

  it('rejette en timing-safe quand la longueur du token diffère', async () => {
    const client = await setupClient();
    const { app } = await build(client);

    const res = await app.inject({
      method: 'GET',
      url: '/internal/oauth-credentials',
      headers: { authorization: `Bearer ${INTERNAL_SECRET}-extra` },
    });

    expect(res.statusCode).toBe(401);
  });
});
