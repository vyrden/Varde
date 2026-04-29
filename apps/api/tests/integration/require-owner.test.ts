import { createLogger, createOwnershipService } from '@varde/core';
import { applyMigrations, createDbClient, type DbClient } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type Authenticator,
  createApiServer,
  requireOwner,
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

const buildApp = async (
  client: DbClient<'sqlite'>,
): Promise<{
  app: Awaited<ReturnType<typeof createApiServer>>;
  ownership: ReturnType<typeof createOwnershipService>;
}> => {
  const ownership = createOwnershipService({ client });
  const app = await createApiServer({
    logger: silentLogger(),
    version: 'test',
    authenticator: headerAuthenticator,
    rateLimitMax: false,
  });
  // Route fictive protégée par requireOwner pour valider le decorator.
  app.get('/__test/admin', async (request) => {
    const session = await requireOwner(app, request, ownership);
    return { ok: true, userId: session.userId };
  });
  return { app, ownership };
};

describe('requireOwner', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = await setupClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('401 quand aucune session n est fournie', async () => {
    const { app } = await buildApp(client);
    try {
      const res = await app.inject({ method: 'GET', url: '/__test/admin' });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('404 quand la session existe mais le user n est pas owner', async () => {
    const { app, ownership } = await buildApp(client);
    try {
      // Un autre user est owner — l'appelant ne l'est pas.
      await ownership.claimFirstOwnership('999999999999999999');
      const res = await app.inject({
        method: 'GET',
        url: '/__test/admin',
        headers: {
          'x-test-session': JSON.stringify({ userId: '111111111111111111' }),
        },
      });
      // 404 (pas 403) pour ne pas révéler l'existence de la page.
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('200 quand la session correspond à un owner — retourne la session', async () => {
    const { app, ownership } = await buildApp(client);
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'GET',
        url: '/__test/admin',
        headers: {
          'x-test-session': JSON.stringify({ userId: '111111111111111111' }),
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true, userId: '111111111111111111' });
    } finally {
      await app.close();
    }
  });

  it('404 quand la session est tronquée (userId vide ou manquant)', async () => {
    const { app, ownership } = await buildApp(client);
    try {
      await ownership.claimFirstOwnership('111111111111111111');
      const res = await app.inject({
        method: 'GET',
        url: '/__test/admin',
        headers: {
          // userId vide → impossible de décider, traité comme non-owner.
          'x-test-session': JSON.stringify({ userId: '' }),
        },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
