import { randomBytes } from 'node:crypto';
import type { GuildId, ModuleId } from '@varde/contracts';
import { createConfigService, createKeystoreService, createLogger } from '@varde/core';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type Authenticator,
  createApiServer,
  createDiscordClient,
  type DiscordGuild,
  type FetchLike,
  registerAiSettingsRoutes,
  type SessionData,
} from '../../src/index.js';

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

const GUILD: GuildId = '111' as GuildId;
const AI_MODULE: ModuleId = 'core.ai' as ModuleId;

const headerAuth: Authenticator = (request) => {
  const raw = request.headers['x-test-session'];
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
};

const authHeader = { 'x-test-session': JSON.stringify({ userId: '42', accessToken: 'tok' }) };

const discordGuild = (id: string, permissions: string): DiscordGuild => ({
  id,
  name: `Guild ${id}`,
  icon: null,
  permissions,
});

const adminFetch: FetchLike = async () =>
  new Response(JSON.stringify([discordGuild(GUILD, '0x20')]), { status: 200 });

describe('routes /guilds/:guildId/settings/ai', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await client.db.insert(sqliteSchema.guilds).values({ id: GUILD, name: 'Alpha' }).run();
    // Pseudo-module core.ai requis par la FK keystore.
    await client.db
      .insert(sqliteSchema.modulesRegistry)
      .values({ id: AI_MODULE, version: '1.0.0', manifest: {}, schemaVersion: 0 })
      .run();
  });

  afterEach(async () => {
    await client.close();
  });

  const build = async (opts: { fetchImpl?: FetchLike } = {}) => {
    const logger = silentLogger();
    const config = createConfigService({ client });
    await config.ensureGuild(GUILD);
    const keystore = createKeystoreService({
      client,
      moduleId: AI_MODULE,
      masterKey: randomBytes(32),
    });
    const discord = createDiscordClient({ fetch: adminFetch });
    const app = await createApiServer({
      logger,
      version: 'test',
      authenticator: headerAuth,
    });
    registerAiSettingsRoutes(app, {
      config,
      keystore,
      discord,
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl as typeof fetch } : {}),
    });
    return { app, config, keystore };
  };

  it('GET renvoie { providerId: none, hasApiKey: false } par défaut', async () => {
    const { app } = await build();
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/settings/ai`,
        headers: authHeader,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        providerId: 'none',
        endpoint: null,
        model: null,
        hasApiKey: false,
      });
    } finally {
      await app.close();
    }
  });

  it('PUT ollama sauvegarde sans toucher au keystore', async () => {
    const { app, keystore } = await build();
    try {
      const put = await app.inject({
        method: 'PUT',
        url: `/guilds/${GUILD}/settings/ai`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({
          providerId: 'ollama',
          endpoint: 'http://localhost:11434',
          model: 'llama3.1:8b',
        }),
      });
      expect(put.statusCode).toBe(204);

      const get = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/settings/ai`,
        headers: authHeader,
      });
      expect(get.json()).toMatchObject({
        providerId: 'ollama',
        endpoint: 'http://localhost:11434',
        model: 'llama3.1:8b',
        hasApiKey: false,
      });
      const stored = await keystore.get(GUILD, 'providerApiKey');
      expect(stored).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('PUT openai-compat avec apiKey → chiffrée dans le keystore', async () => {
    const { app, keystore } = await build();
    try {
      const put = await app.inject({
        method: 'PUT',
        url: `/guilds/${GUILD}/settings/ai`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({
          providerId: 'openai-compat',
          endpoint: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
          apiKey: 'sk-secret-abc',
        }),
      });
      expect(put.statusCode).toBe(204);

      const stored = await keystore.get(GUILD, 'providerApiKey');
      expect(stored).toBe('sk-secret-abc');

      const get = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/settings/ai`,
        headers: authHeader,
      });
      // La clé n'est jamais retournée en clair, seulement hasApiKey.
      expect(get.json().hasApiKey).toBe(true);
      expect(JSON.stringify(get.json())).not.toContain('sk-secret-abc');
    } finally {
      await app.close();
    }
  });

  it('PUT openai-compat sans apiKey ET sans clé stockée → 400 missing_api_key', async () => {
    const { app } = await build();
    try {
      const put = await app.inject({
        method: 'PUT',
        url: `/guilds/${GUILD}/settings/ai`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({
          providerId: 'openai-compat',
          endpoint: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
        }),
      });
      expect(put.statusCode).toBe(400);
      expect(put.json()).toMatchObject({ error: 'missing_api_key' });
    } finally {
      await app.close();
    }
  });

  it('PUT openai-compat → ollama supprime la clé stockée', async () => {
    const { app, keystore } = await build();
    try {
      await app.inject({
        method: 'PUT',
        url: `/guilds/${GUILD}/settings/ai`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({
          providerId: 'openai-compat',
          endpoint: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
          apiKey: 'sk-abc',
        }),
      });
      expect(await keystore.get(GUILD, 'providerApiKey')).toBe('sk-abc');

      await app.inject({
        method: 'PUT',
        url: `/guilds/${GUILD}/settings/ai`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({
          providerId: 'ollama',
          endpoint: 'http://localhost:11434',
          model: 'llama3.1:8b',
        }),
      });
      expect(await keystore.get(GUILD, 'providerApiKey')).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('POST /test ollama : construit un provider et appelle /api/tags', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [{ name: 'llama3.1:8b' }] }), { status: 200 });
      }
      return new Response('?', { status: 404 });
    });
    const { app } = await build({ fetchImpl: fetchMock as unknown as FetchLike });
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/settings/ai/test`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({
          providerId: 'ollama',
          endpoint: 'http://localhost:11434',
          model: 'llama3.1:8b',
        }),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        providerId: 'ollama',
        model: 'llama3.1:8b',
        ok: true,
      });
    } finally {
      await app.close();
    }
  });

  it('POST /test openai-compat sans apiKey dans le body → utilise la clé stockée', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ data: [{ id: 'gpt-4o-mini' }] }), { status: 200 }),
    );
    const { app } = await build({ fetchImpl: fetchMock as unknown as FetchLike });
    try {
      // Stocker la clé via PUT.
      await app.inject({
        method: 'PUT',
        url: `/guilds/${GUILD}/settings/ai`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({
          providerId: 'openai-compat',
          endpoint: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
          apiKey: 'sk-abc',
        }),
      });

      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/settings/ai/test`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({
          providerId: 'openai-compat',
          endpoint: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
        }),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().ok).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('POST /test none : stub → ok=true', async () => {
    const { app } = await build();
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/settings/ai/test`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({ providerId: 'none' }),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ providerId: 'none', ok: true });
    } finally {
      await app.close();
    }
  });

  it('401 sans session', async () => {
    const { app } = await build();
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/settings/ai`,
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});
