import { createLogger, createOwnershipService } from '@varde/core';
import { applyMigrations, createDbClient, type DbClient } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type Authenticator,
  createApiServer,
  registerAdminOwnershipRoutes,
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

const build = async (
  client: DbClient<'sqlite'>,
): Promise<{
  app: Awaited<ReturnType<typeof createApiServer>>;
  ownership: ReturnType<typeof createOwnershipService>;
}> => {
  const ownership = createOwnershipService({ client });
  const app = await createApiServer({
    logger: silentLogger(),
    version: 'test',
    authenticator: noAuthAuthenticator,
    rateLimitMax: false,
  });
  registerAdminOwnershipRoutes(app, { ownership, logger: silentLogger() });
  return { app, ownership };
};

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
