import type { ActionId, GuildId, UserId } from '@varde/contracts';
import { createAuditService, createLogger } from '@varde/core';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type Authenticator,
  createApiServer,
  createDiscordClient,
  type DiscordGuild,
  type FetchLike,
  registerAuditRoutes,
  type SessionData,
} from '../../src/index.js';

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

const GUILD: GuildId = '111' as GuildId;
const OTHER_GUILD: GuildId = '222' as GuildId;
const USER: UserId = '42' as UserId;

const headerAuthenticator: Authenticator = (request) => {
  const raw = request.headers['x-test-session'];
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
};

const adminAuthHeader = {
  'x-test-session': JSON.stringify({ userId: USER, accessToken: 'tok' }),
};

const discordGuild = (id: string, permissions: string): DiscordGuild => ({
  id,
  name: `Guild ${id}`,
  icon: null,
  permissions,
});

const adminFetch: FetchLike = async () =>
  new Response(JSON.stringify([discordGuild(GUILD, '0x20')]), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('GET /guilds/:guildId/audit', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await client.db
      .insert(sqliteSchema.guilds)
      .values([
        { id: GUILD, name: 'Alpha' },
        { id: OTHER_GUILD, name: 'Beta' },
      ])
      .run();
  });

  afterEach(async () => {
    await client.close();
  });

  const build = async (fetchImpl: FetchLike = adminFetch) => {
    const audit = createAuditService({ client });
    const discord = createDiscordClient({ fetch: fetchImpl });
    const app = await createApiServer({
      logger: silentLogger(),
      version: 'test',
      authenticator: headerAuthenticator,
    });
    registerAuditRoutes(app, { audit, discord });
    return { app, audit };
  };

  const seed = async (count: number, guildId: GuildId = GUILD): Promise<void> => {
    const audit = createAuditService({ client });
    for (let i = 0; i < count; i += 1) {
      await audit.log({
        guildId,
        action: 'core.audit.seeded' as ActionId,
        actor: { type: 'system' },
        severity: 'info',
        metadata: { index: i },
      });
      // Laisse l'horloge avancer entre les insertions pour que les
      // ULID soient strictement ordonnés (monotonicFactory garantit
      // le monotone intra-ms, mais on varie pour robustesse).
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
  };

  it('401 sans session', async () => {
    const { app } = await build();
    try {
      const res = await app.inject({ method: 'GET', url: `/guilds/${GUILD}/audit` });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('403 sans MANAGE_GUILD', async () => {
    const fetch: FetchLike = async () =>
      new Response(JSON.stringify([discordGuild(GUILD, '0x8')]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    const { app } = await build(fetch);
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/audit`,
        headers: adminAuthHeader,
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('renvoie items ordonnés par createdAt desc', async () => {
    await seed(3);
    const { app } = await build();
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/audit`,
        headers: adminAuthHeader,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { items: Array<{ metadata: { index: number } }> };
      expect(body.items.map((i) => i.metadata.index)).toEqual([2, 1, 0]);
    } finally {
      await app.close();
    }
  });

  it('filtre par severity', async () => {
    const audit = createAuditService({ client });
    await audit.log({
      guildId: GUILD,
      action: 'x.y.z' as ActionId,
      actor: { type: 'system' },
      severity: 'warn',
    });
    await audit.log({
      guildId: GUILD,
      action: 'x.y.z' as ActionId,
      actor: { type: 'system' },
      severity: 'info',
    });
    const { app } = await build();
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/audit?severity=warn`,
        headers: adminAuthHeader,
      });
      const body = res.json() as { items: Array<{ severity: string }> };
      expect(body.items).toHaveLength(1);
      expect(body.items[0]?.severity).toBe('warn');
    } finally {
      await app.close();
    }
  });

  it("isole par guild (audit d'une autre guild n'apparaît pas)", async () => {
    await seed(1, GUILD);
    await seed(1, OTHER_GUILD);
    const { app } = await build();
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/audit`,
        headers: adminAuthHeader,
      });
      const body = res.json() as { items: unknown[] };
      expect(body.items).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it('limite entre 1 et 100, défaut 50 — renvoie nextCursor si plus de pages', async () => {
    await seed(5);
    const { app } = await build();
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/audit?limit=2`,
        headers: adminAuthHeader,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        items: Array<{ id: string; metadata: { index: number } }>;
        nextCursor?: string;
      };
      expect(body.items).toHaveLength(2);
      expect(body.items.map((i) => i.metadata.index)).toEqual([4, 3]);
      expect(body.nextCursor).toBe(body.items[1]?.id);
    } finally {
      await app.close();
    }
  });

  it('parcourt les pages via cursor jusqu à épuisement', async () => {
    await seed(5);
    const { app } = await build();
    try {
      const page1 = (
        await app.inject({
          method: 'GET',
          url: `/guilds/${GUILD}/audit?limit=2`,
          headers: adminAuthHeader,
        })
      ).json() as { items: Array<{ metadata: { index: number } }>; nextCursor?: string };
      expect(page1.items.map((i) => i.metadata.index)).toEqual([4, 3]);

      const page2 = (
        await app.inject({
          method: 'GET',
          url: `/guilds/${GUILD}/audit?limit=2&cursor=${page1.nextCursor}`,
          headers: adminAuthHeader,
        })
      ).json() as { items: Array<{ metadata: { index: number } }>; nextCursor?: string };
      expect(page2.items.map((i) => i.metadata.index)).toEqual([2, 1]);

      const page3 = (
        await app.inject({
          method: 'GET',
          url: `/guilds/${GUILD}/audit?limit=2&cursor=${page2.nextCursor}`,
          headers: adminAuthHeader,
        })
      ).json() as { items: Array<{ metadata: { index: number } }>; nextCursor?: string };
      expect(page3.items.map((i) => i.metadata.index)).toEqual([0]);
      expect(page3.nextCursor).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it('400 sur query invalide (limit hors bornes)', async () => {
    const { app } = await build();
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/audit?limit=999`,
        headers: adminAuthHeader,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'invalid_query' });
    } finally {
      await app.close();
    }
  });

  it('400 sur actorType hors enum', async () => {
    const { app } = await build();
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/audit?actorType=bot`,
        headers: adminAuthHeader,
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('filtre since + until (fenêtre temporelle)', async () => {
    const audit = createAuditService({ client });
    // Row ancienne (2020), récente (2030).
    await client.db
      .insert(sqliteSchema.auditLog)
      .values([
        {
          id: '01HZ0000000000000000000010',
          guildId: GUILD,
          actorType: 'system',
          action: 'x.y.z',
          severity: 'info',
          createdAt: '2020-01-01T00:00:00.000Z',
        },
        {
          id: '01HZ0000000000000000000020',
          guildId: GUILD,
          actorType: 'system',
          action: 'x.y.z',
          severity: 'info',
          createdAt: '2030-01-01T00:00:00.000Z',
        },
      ])
      .run();
    void audit;
    const { app } = await build();
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/audit?since=2025-01-01T00:00:00.000Z&until=2031-01-01T00:00:00.000Z`,
        headers: adminAuthHeader,
      });
      const body = res.json() as { items: Array<{ id: string }> };
      expect(body.items).toHaveLength(1);
      expect(body.items[0]?.id).toBe('01HZ0000000000000000000020');
    } finally {
      await app.close();
    }
  });

  // Placeholder pour garder vi importé si besoin ; supprime si non utilisé.
  it('fumée : le vi mock est bien disponible', () => {
    expect(vi.fn()).toBeTypeOf('function');
  });
});
