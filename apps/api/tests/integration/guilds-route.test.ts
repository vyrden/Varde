import { createLogger } from '@varde/core';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import type { FastifyRequest } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type Authenticator,
  createApiServer,
  createDiscordClient,
  type DiscordGuild,
  type FetchLike,
  registerGuildsRoutes,
  type SessionData,
} from '../../src/index.js';

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

const headerAuthenticator: Authenticator = (request: FastifyRequest) => {
  const raw = request.headers['x-test-session'];
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
};

const guildFixture = (
  id: string,
  permissions: string,
  icon: string | null = null,
): DiscordGuild => ({ id, name: `Guild ${id}`, icon, permissions });

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('GET /guilds — end-to-end', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
  });

  afterEach(async () => {
    await client.close();
  });

  const buildApp = (fetchImpl: FetchLike) => {
    const discord = createDiscordClient({ fetch: fetchImpl });
    return createApiServer({
      logger: silentLogger(),
      version: 'test',
      authenticator: headerAuthenticator,
    }).then(async (app) => {
      registerGuildsRoutes(app, { client, discord });
      return app;
    });
  };

  it("renvoie 401 si l'appelant n'est pas authentifié", async () => {
    const fetch = vi.fn<FetchLike>();
    const app = await buildApp(fetch);
    try {
      const response = await app.inject({ method: 'GET', url: '/guilds' });
      expect(response.statusCode).toBe(401);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("renvoie 400 si la session n'a pas d'accessToken", async () => {
    const fetch = vi.fn<FetchLike>();
    const app = await buildApp(fetch);
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/guilds',
        headers: { 'x-test-session': JSON.stringify({ userId: '42' }) },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: 'missing_access_token' });
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('renvoie l intersection des guilds admin du user et des guilds où le bot est présent', async () => {
    // Seed : bot présent sur 111 et 222, pas sur 333.
    await client.db
      .insert(sqliteSchema.guilds)
      .values([
        { id: '111', name: 'Alpha' },
        { id: '222', name: 'Beta' },
      ])
      .run();

    // Discord renvoie 4 guilds pour le user : 111 admin, 222 non-admin,
    // 333 admin, 444 non-admin.
    const fetch = vi
      .fn<FetchLike>()
      .mockResolvedValue(
        jsonResponse([
          guildFixture('111', '0x20', 'iconA'),
          guildFixture('222', '0x8'),
          guildFixture('333', '0x20'),
          guildFixture('444', '0x8'),
        ]),
      );
    const app = await buildApp(fetch);
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/guilds',
        headers: {
          'x-test-session': JSON.stringify({ userId: '42', accessToken: 'tok' }),
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([
        {
          id: '111',
          name: 'Guild 111',
          iconUrl: 'https://cdn.discordapp.com/icons/111/iconA.png',
        },
      ]);
    } finally {
      await app.close();
    }
  });

  it('renvoie un tableau vide si aucune guild admin ne matche le bot', async () => {
    await client.db.insert(sqliteSchema.guilds).values({ id: '111', name: 'Alpha' }).run();
    const fetch = vi.fn<FetchLike>().mockResolvedValue(jsonResponse([guildFixture('999', '0x20')]));
    const app = await buildApp(fetch);
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/guilds',
        headers: {
          'x-test-session': JSON.stringify({ userId: '42', accessToken: 'tok' }),
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('propage 502 (DependencyFailureError) quand Discord répond en erreur', async () => {
    await client.db.insert(sqliteSchema.guilds).values({ id: '111', name: 'Alpha' }).run();
    const fetch = vi
      .fn<FetchLike>()
      .mockResolvedValue(new Response('rate limited', { status: 429 }));
    const app = await buildApp(fetch);
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/guilds',
        headers: {
          'x-test-session': JSON.stringify({ userId: '42', accessToken: 'tok' }),
        },
      });
      expect(response.statusCode).toBe(502);
    } finally {
      await app.close();
    }
  });
});
