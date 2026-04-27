import type { GuildId } from '@varde/contracts';
import { createLogger } from '@varde/core';
import { describe, expect, it, vi } from 'vitest';

import {
  type Authenticator,
  createApiServer,
  createDiscordClient,
  type DiscordGuild,
  type FetchLike,
  type SessionData,
} from '../../src/index.js';
import {
  type ListGuildEmojisResult,
  registerDiscordEmojisRoutes,
} from '../../src/routes/discord-emojis.js';

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

const GUILD: GuildId = '111111111111111111' as GuildId;

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

const adminFetch: FetchLike = async () =>
  new Response(JSON.stringify([discordGuild(GUILD, '0x20')]), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const authHeader = { 'x-test-session': JSON.stringify({ userId: '42', accessToken: 'tok' }) };

const build = async (listGuildEmojis?: (guildId: string) => Promise<ListGuildEmojisResult>) => {
  const logger = silentLogger();
  const discord = createDiscordClient({ fetch: adminFetch });
  const app = await createApiServer({
    logger,
    version: 'test',
    authenticator: headerAuthenticator,
  });
  registerDiscordEmojisRoutes(app, {
    discord,
    ...(listGuildEmojis ? { listGuildEmojis } : {}),
  });
  return { app };
};

describe('GET /guilds/:guildId/discord/emojis', () => {
  it('renvoie 200 avec current + external quand listGuildEmojis est fourni', async () => {
    const list = vi.fn().mockResolvedValue({
      current: [{ id: '1', name: 'pepe', animated: false }],
      external: [{ id: '2', name: 'wave', animated: true, guildName: 'Autre' }],
    });
    const { app } = await build(list);
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/discord/emojis`,
        headers: authHeader,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as ListGuildEmojisResult;
      expect(body.current).toHaveLength(1);
      expect(body.external).toHaveLength(1);
      expect(body.current[0]?.name).toBe('pepe');
      expect(body.external[0]?.guildName).toBe('Autre');
      expect(list).toHaveBeenCalledWith(GUILD);
    } finally {
      await app.close();
    }
  });

  it('renvoie 503 quand listGuildEmojis est absent (bridge Discord indisponible)', async () => {
    const { app } = await build();
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/discord/emojis`,
        headers: authHeader,
      });
      expect(res.statusCode).toBe(503);
      expect((res.json() as { reason: string }).reason).toBe('discord_bridge_unavailable');
    } finally {
      await app.close();
    }
  });

  it('renvoie 401 sans session', async () => {
    const list = vi.fn();
    const { app } = await build(list);
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/discord/emojis`,
      });
      expect(res.statusCode).toBe(401);
      expect(list).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('renvoie 403 sans MANAGE_GUILD', async () => {
    const nonAdminFetch: FetchLike = async () =>
      new Response(JSON.stringify([discordGuild(GUILD, '0x8')]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    const logger = silentLogger();
    const discord = createDiscordClient({ fetch: nonAdminFetch });
    const app = await createApiServer({
      logger,
      version: 'test',
      authenticator: headerAuthenticator,
    });
    const list = vi.fn();
    registerDiscordEmojisRoutes(app, { discord, listGuildEmojis: list });
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/discord/emojis`,
        headers: authHeader,
      });
      expect(res.statusCode).toBe(403);
      expect(list).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
