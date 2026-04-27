import type { GuildId } from '@varde/contracts';
import { createConfigService, createLogger } from '@varde/core';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type Authenticator,
  createApiServer,
  createDiscordClient,
  type DiscordGuild,
  type FetchLike,
  type SessionData,
} from '../../src/index.js';
import { type BotSettingsDto, registerBotSettingsRoutes } from '../../src/routes/bot-settings.js';

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

const adminFetch: FetchLike = async () =>
  new Response(
    JSON.stringify([
      {
        id: GUILD,
        name: 'Alpha',
        icon: null,
        permissions: '0x20',
      } as DiscordGuild,
    ]),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

const authHeader = { 'x-test-session': JSON.stringify({ userId: '42', accessToken: 'tok' }) };

describe('bot-settings routes', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await client.db.insert(sqliteSchema.guilds).values({ id: GUILD, name: 'Alpha' }).run();
  });

  afterEach(async () => {
    await client.close();
  });

  const build = async () => {
    const logger = silentLogger();
    const config = createConfigService({ client });
    await config.ensureGuild(GUILD);
    const discord = createDiscordClient({ fetch: adminFetch });
    const app = await createApiServer({
      logger,
      version: 'test',
      authenticator: headerAuthenticator,
    });
    registerBotSettingsRoutes(app, { config, discord });
    return { app, config };
  };

  describe('GET /guilds/:guildId/settings/bot', () => {
    it('renvoie les défauts (en, UTC, blurple) quand aucune config persistée', async () => {
      const { app } = await build();
      try {
        const res = await app.inject({
          method: 'GET',
          url: `/guilds/${GUILD}/settings/bot`,
          headers: authHeader,
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as BotSettingsDto;
        expect(body.language).toBe('en');
        expect(body.timezone).toBe('UTC');
        expect(body.embedColor).toBe('#5865F2');
        expect(body.updatedAt).toBeNull();
      } finally {
        await app.close();
      }
    });

    it('renvoie les valeurs persistées après un PUT', async () => {
      const { app } = await build();
      try {
        await app.inject({
          method: 'PUT',
          url: `/guilds/${GUILD}/settings/bot`,
          headers: { ...authHeader, 'content-type': 'application/json' },
          payload: JSON.stringify({
            language: 'fr',
            timezone: 'Europe/Paris',
            embedColor: '#ff0000',
          }),
        });
        const res = await app.inject({
          method: 'GET',
          url: `/guilds/${GUILD}/settings/bot`,
          headers: authHeader,
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as BotSettingsDto;
        expect(body.language).toBe('fr');
        expect(body.timezone).toBe('Europe/Paris');
        expect(body.embedColor).toBe('#ff0000');
        expect(body.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      } finally {
        await app.close();
      }
    });

    it('401 sans session', async () => {
      const { app } = await build();
      try {
        const res = await app.inject({
          method: 'GET',
          url: `/guilds/${GUILD}/settings/bot`,
        });
        expect(res.statusCode).toBe(401);
      } finally {
        await app.close();
      }
    });
  });

  describe('PUT /guilds/:guildId/settings/bot', () => {
    it('204 quand body valide', async () => {
      const { app } = await build();
      try {
        const res = await app.inject({
          method: 'PUT',
          url: `/guilds/${GUILD}/settings/bot`,
          headers: { ...authHeader, 'content-type': 'application/json' },
          payload: JSON.stringify({
            language: 'es',
            timezone: 'America/New_York',
            embedColor: '#00ff00',
          }),
        });
        expect(res.statusCode).toBe(204);
      } finally {
        await app.close();
      }
    });

    it('400 quand language hors enum', async () => {
      const { app } = await build();
      try {
        const res = await app.inject({
          method: 'PUT',
          url: `/guilds/${GUILD}/settings/bot`,
          headers: { ...authHeader, 'content-type': 'application/json' },
          payload: JSON.stringify({
            language: 'xx',
            timezone: 'UTC',
            embedColor: '#5865F2',
          }),
        });
        expect(res.statusCode).toBe(400);
      } finally {
        await app.close();
      }
    });

    it('400 quand timezone hors liste IANA supportée', async () => {
      const { app } = await build();
      try {
        const res = await app.inject({
          method: 'PUT',
          url: `/guilds/${GUILD}/settings/bot`,
          headers: { ...authHeader, 'content-type': 'application/json' },
          payload: JSON.stringify({
            language: 'fr',
            timezone: 'Mars/Olympus_Mons',
            embedColor: '#5865F2',
          }),
        });
        expect(res.statusCode).toBe(400);
      } finally {
        await app.close();
      }
    });

    it('400 quand embedColor n est pas un hex #RRGGBB', async () => {
      const { app } = await build();
      try {
        const res = await app.inject({
          method: 'PUT',
          url: `/guilds/${GUILD}/settings/bot`,
          headers: { ...authHeader, 'content-type': 'application/json' },
          payload: JSON.stringify({
            language: 'fr',
            timezone: 'UTC',
            embedColor: 'rouge',
          }),
        });
        expect(res.statusCode).toBe(400);
      } finally {
        await app.close();
      }
    });

    it('401 sans session', async () => {
      const { app } = await build();
      try {
        const res = await app.inject({
          method: 'PUT',
          url: `/guilds/${GUILD}/settings/bot`,
          headers: { 'content-type': 'application/json' },
          payload: JSON.stringify({
            language: 'fr',
            timezone: 'UTC',
            embedColor: '#5865F2',
          }),
        });
        expect(res.statusCode).toBe(401);
      } finally {
        await app.close();
      }
    });
  });
});
