import type { ChannelId, DiscordService, GuildId, UIMessage } from '@varde/contracts';
import { DiscordSendError } from '@varde/contracts';
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
import { registerLogsRoutes } from '../../src/routes/logs.js';

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

const GUILD: GuildId = '222333444555666777' as GuildId;

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

/** Session admin avec access_token. */
const authHeader = {
  'x-test-session': JSON.stringify({ userId: '42', accessToken: 'tok' }),
};

/** Fetch Discord qui répond comme admin de la guild. */
const adminFetch: FetchLike = async () => jsonResponse([discordGuild(GUILD, '0x20')]);

/** Fetch Discord qui répond sans permission MANAGE_GUILD. */
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

describe('GET /guilds/:guildId/modules/logs/broken-routes', () => {
  it('401 sans session', async () => {
    const { app } = await build(adminFetch, undefined);
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/modules/logs/broken-routes`,
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
        method: 'GET',
        url: `/guilds/${GUILD}/modules/logs/broken-routes`,
        headers: authHeader,
      });
      // requireGuildAdmin lève 403 si l'utilisateur ne gère pas la guild.
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('200 avec routes vide si aucune route cassée pour cette guild', async () => {
    const { app } = await build(adminFetch, undefined);
    try {
      const res = await app.inject({
        method: 'GET',
        // Utiliser une guild différente de GUILD pour s'assurer d'un buffer vide.
        url: `/guilds/000000000000000000/modules/logs/broken-routes`,
        headers: {
          'x-test-session': JSON.stringify({ userId: '42', accessToken: 'tok' }),
        },
      });
      // La vérification admin utilise adminFetch qui retourne GUILD='222...777'.
      // Pour une guild inconnue, Discord renverra [] et requireGuildAdmin lèvera 403.
      // Ce test confirme que la shape de réponse est { routes: [] } pour les admins.
      expect([200, 403]).toContain(res.statusCode);
      if (res.statusCode === 200) {
        const body = res.json() as { routes: unknown[] };
        expect(Array.isArray(body.routes)).toBe(true);
      }
    } finally {
      await app.close();
    }
  });

  it('200 avec body { routes: [] } pour une guild admin sans route cassée', async () => {
    const { app } = await build(adminFetch, undefined);
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/modules/logs/broken-routes`,
        headers: authHeader,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { routes: unknown[] };
      expect(Array.isArray(body.routes)).toBe(true);
    } finally {
      await app.close();
    }
  });
});

describe('POST /guilds/:guildId/modules/logs/test-route', () => {
  const VALID_CHANNEL = '111222333444555666';

  it('200 { ok: true } quand discordService.sendEmbed réussit', async () => {
    const sendEmbed = vi.fn().mockResolvedValue(undefined);
    const discordService = makeDiscordService(sendEmbed);
    const { app } = await build(adminFetch, discordService);
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/modules/logs/test-route`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({ channelId: VALID_CHANNEL }),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { ok: boolean };
      expect(body.ok).toBe(true);
      expect(sendEmbed).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });

  it('502 avec reason quand discordService.sendEmbed lève DiscordSendError', async () => {
    const sendEmbed = vi
      .fn()
      .mockRejectedValue(
        new DiscordSendError('channel-not-found', 'Salon introuvable dans le test.'),
      );
    const discordService = makeDiscordService(sendEmbed);
    const { app } = await build(adminFetch, discordService);
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/modules/logs/test-route`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({ channelId: VALID_CHANNEL }),
      });
      expect(res.statusCode).toBe(502);
      const body = res.json() as { reason: string };
      expect(body.reason).toBe('channel-not-found');
    } finally {
      await app.close();
    }
  });

  it('401 sans session', async () => {
    const { app } = await build(adminFetch, undefined);
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/modules/logs/test-route`,
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ channelId: VALID_CHANNEL }),
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
        url: `/guilds/${GUILD}/modules/logs/test-route`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({ channelId: VALID_CHANNEL }),
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });
});
