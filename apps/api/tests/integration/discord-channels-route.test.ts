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
import { registerDiscordChannelsRoutes } from '../../src/routes/discord-channels.js';

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

const GUILD: GuildId = '333444555666777888' as GuildId;

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

type CreateGuildChannelFn = (
  guildId: string,
  payload: { name: string; type: 'text'; topic?: string },
) => Promise<{ id: string }>;

const build = async (fetchImpl: FetchLike, createGuildChannel?: CreateGuildChannelFn) => {
  const logger = silentLogger();
  const discord = createDiscordClient({ fetch: fetchImpl });
  const app = await createApiServer({
    logger,
    version: 'test',
    authenticator: headerAuthenticator,
  });
  registerDiscordChannelsRoutes(app, { discord, createGuildChannel });
  return { app };
};

const VALID_PAYLOAD = JSON.stringify({ name: 'logs', type: 'text', topic: 'Journal' });

describe('POST /guilds/:guildId/discord/channels', () => {
  it('200 + { channelId, channelName } quand createGuildChannel réussit', async () => {
    const createGuildChannel = vi.fn().mockResolvedValue({ id: '999888777666555444' });
    const { app } = await build(adminFetch, createGuildChannel);
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/discord/channels`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: VALID_PAYLOAD,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { channelId: string; channelName: string };
      expect(body.channelId).toBe('999888777666555444');
      expect(body.channelName).toBe('logs');
      expect(createGuildChannel).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });

  it('403 + reason permission-denied quand createGuildChannel lève code 50013', async () => {
    const err = Object.assign(new Error('Missing Permissions'), { code: 50013 });
    const createGuildChannel = vi.fn().mockRejectedValue(err);
    const { app } = await build(adminFetch, createGuildChannel);
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/discord/channels`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: VALID_PAYLOAD,
      });
      expect(res.statusCode).toBe(403);
      const body = res.json() as { reason: string };
      expect(body.reason).toBe('permission-denied');
    } finally {
      await app.close();
    }
  });

  it('409 + reason quota-exceeded quand createGuildChannel lève code 30013', async () => {
    const err = Object.assign(new Error('Too many channels'), { code: 30013 });
    const createGuildChannel = vi.fn().mockRejectedValue(err);
    const { app } = await build(adminFetch, createGuildChannel);
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/discord/channels`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: VALID_PAYLOAD,
      });
      expect(res.statusCode).toBe(409);
      const body = res.json() as { reason: string };
      expect(body.reason).toBe('quota-exceeded');
    } finally {
      await app.close();
    }
  });

  it('401 sans session', async () => {
    const { app } = await build(adminFetch, undefined);
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/discord/channels`,
        headers: { 'content-type': 'application/json' },
        payload: VALID_PAYLOAD,
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
        url: `/guilds/${GUILD}/discord/channels`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: VALID_PAYLOAD,
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('503 quand createGuildChannel est absent (bridge non câblé)', async () => {
    const { app } = await build(adminFetch, undefined);
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/discord/channels`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: VALID_PAYLOAD,
      });
      expect(res.statusCode).toBe(503);
      const body = res.json() as { reason: string };
      expect(body.reason).toBe('discord_bridge_unavailable');
    } finally {
      await app.close();
    }
  });
});
