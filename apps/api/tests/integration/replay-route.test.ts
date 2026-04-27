import type { ChannelId, DiscordService, GuildId, UIMessage } from '@varde/contracts';
import { DiscordSendError } from '@varde/contracts';
import { createLogger } from '@varde/core';
import { __bufferForTests } from '@varde/module-logs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type Authenticator,
  createApiServer,
  createDiscordClient,
  type DiscordGuild,
  type FetchLike,
  type SessionData,
} from '../../src/index.js';
import { registerLogsRoutes } from '../../src/routes/logs.js';

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

const GUILD: GuildId = '222333444555666777' as GuildId;
const ROUTE = 'route-cassee-1';

const headerAuthenticator: Authenticator = (request) => {
  const raw = request.headers['x-test-session'];
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
};

const discordGuild = (id: string, permissions: string): DiscordGuild => ({
  id,
  name: `Guild ${id}`,
  icon: null,
  permissions,
});

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200 });

const authHeader = {
  'x-test-session': JSON.stringify({ userId: '42', accessToken: 'tok' }),
};

const adminFetch: FetchLike = async () => jsonResponse([discordGuild(GUILD, '0x20')]);
const nonAdminFetch: FetchLike = async () => jsonResponse([discordGuild(GUILD, '0x8')]);

const makeDiscordService = (
  sendEmbedImpl: (channelId: ChannelId, message: UIMessage) => Promise<void>,
): DiscordService => ({
  sendMessage: vi.fn(),
  sendEmbed: vi.fn().mockImplementation(sendEmbedImpl),
});

const build = async (fetchImpl: FetchLike, discordService?: DiscordService) => {
  const logger = silentLogger();
  const discord = createDiscordClient({ fetch: fetchImpl });
  const app = await createApiServer({
    logger,
    version: 'test',
    authenticator: headerAuthenticator,
  });
  registerLogsRoutes(app, { discord, discordService });
  return { app };
};

const seedBuffer = (count: number): void => {
  for (let i = 0; i < count; i += 1) {
    __bufferForTests.push(
      ROUTE,
      {
        type: 'guild.memberJoin',
        guildId: GUILD,
        userId: `u${i}` as never,
        joinedAt: Date.UTC(2026, 3, 24),
      },
      1000 + i,
      { guildId: GUILD, channelId: '999888777123456789', reason: 'unknown' },
    );
  }
};

afterEach(() => {
  for (const routeId of __bufferForTests.brokenRouteIds()) {
    __bufferForTests.clear(routeId);
  }
});

describe('POST /guilds/:guildId/modules/logs/broken-routes/:routeId/replay', () => {
  it('401 sans session', async () => {
    const { app } = await build(adminFetch, undefined);
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/modules/logs/broken-routes/${ROUTE}/replay`,
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('403 si non admin de la guild', async () => {
    const { app } = await build(nonAdminFetch, undefined);
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/modules/logs/broken-routes/${ROUTE}/replay`,
        headers: authHeader,
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('503 si discordService non configuré', async () => {
    const { app } = await build(adminFetch, undefined);
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/modules/logs/broken-routes/${ROUTE}/replay`,
        headers: authHeader,
      });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({ reason: 'service-indisponible' });
    } finally {
      await app.close();
    }
  });

  it('200 {replayed:0, failed:0} quand le buffer est vide pour la route', async () => {
    const service = makeDiscordService(async () => undefined);
    const { app } = await build(adminFetch, service);
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/modules/logs/broken-routes/${ROUTE}/replay`,
        headers: authHeader,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ replayed: 0, failed: 0 });
      expect(service.sendEmbed).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('200 avec replay complet quand sender réussit', async () => {
    seedBuffer(3);
    const service = makeDiscordService(async () => undefined);
    const { app } = await build(adminFetch, service);
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/modules/logs/broken-routes/${ROUTE}/replay`,
        headers: authHeader,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ replayed: 3, failed: 0 });
      expect(service.sendEmbed).toHaveBeenCalledTimes(3);
    } finally {
      await app.close();
    }
  });

  it('200 avec replay partiel quand sender échoue au 2ème envoi', async () => {
    seedBuffer(3);
    let count = 0;
    const service = makeDiscordService(async () => {
      count += 1;
      if (count === 2) throw new DiscordSendError('channel-not-found');
    });
    const { app } = await build(adminFetch, service);
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/modules/logs/broken-routes/${ROUTE}/replay`,
        headers: authHeader,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        replayed: number;
        failed: number;
        firstError?: { reason: string };
      };
      expect(body.replayed).toBe(1);
      expect(body.failed).toBe(2);
      expect(body.firstError).toEqual({ reason: 'channel-not-found' });
      // Les 2 events restants sont réinjectés dans le buffer.
      expect(__bufferForTests.snapshot(ROUTE).events).toHaveLength(2);
    } finally {
      await app.close();
    }
  });
});
