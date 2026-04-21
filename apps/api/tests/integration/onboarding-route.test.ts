import type { GuildId, OnboardingActionContext, OnboardingDraft, UserId } from '@varde/contracts';
import {
  CORE_ACTIONS,
  createConfigService,
  createLogger,
  createOnboardingExecutor,
} from '@varde/core';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import { communityTechSmall, PRESET_CATALOG } from '@varde/presets';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type Authenticator,
  createApiServer,
  createDiscordClient,
  type DiscordGuild,
  type FetchLike,
  registerOnboardingRoutes,
  type SessionData,
} from '../../src/index.js';

/**
 * Tests d'intégration des routes `/onboarding/*` (PR 3.4). Le Fastify
 * est piloté via `app.inject()` avec un authenticator header. Les
 * actions de l'executor tapent sur un `OnboardingActionContext` mocké :
 * les `discord.create*` retournent des faux snowflakes séquentiels.
 * Cette surface d'isolation nous permet de jouer tout le cycle
 * create → patch → preview → apply → rollback sans vrai bot.
 */

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

const GUILD: GuildId = '111' as GuildId;
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

const authHeader = {
  'x-test-session': JSON.stringify({ userId: USER, accessToken: 'tok' }),
};

interface MockDiscord {
  readonly createRole: ReturnType<typeof vi.fn>;
  readonly deleteRole: ReturnType<typeof vi.fn>;
  readonly createCategory: ReturnType<typeof vi.fn>;
  readonly deleteCategory: ReturnType<typeof vi.fn>;
  readonly createChannel: ReturnType<typeof vi.fn>;
  readonly deleteChannel: ReturnType<typeof vi.fn>;
}

const buildMockDiscord = (opts: { failOnChannelNamed?: string } = {}): MockDiscord => {
  let counter = 0;
  const nextId = (): string => {
    counter += 1;
    return `snowflake-${counter}`;
  };
  const createRole = vi.fn(async () => ({ id: nextId() }));
  const deleteRole = vi.fn(async () => undefined);
  const createCategory = vi.fn(async () => ({ id: nextId() }));
  const deleteCategory = vi.fn(async () => undefined);
  const createChannel = vi.fn(async (p: { name: string }) => {
    if (opts.failOnChannelNamed && p.name === opts.failOnChannelNamed) {
      throw new Error(`boom on channel ${p.name}`);
    }
    return { id: nextId() };
  });
  const deleteChannel = vi.fn(async () => undefined);
  return { createRole, deleteRole, createCategory, deleteCategory, createChannel, deleteChannel };
};

describe('routes /guilds/:guildId/onboarding', () => {
  let client: DbClient<'sqlite'>;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await client.db.insert(sqliteSchema.guilds).values({ id: GUILD, name: 'Alpha' }).run();
  });

  afterEach(async () => {
    await client.close();
  });

  const build = async (opts: { mockDiscord?: MockDiscord } = {}) => {
    const logger = silentLogger();
    const config = createConfigService({ client });
    await config.ensureGuild(GUILD);
    const executor = createOnboardingExecutor({
      client,
      logger,
      delayBetweenActionsMs: 0,
    });
    for (const action of CORE_ACTIONS) {
      executor.registerAction(action);
    }
    const discord = createDiscordClient({ fetch: adminFetch });
    const mock = opts.mockDiscord ?? buildMockDiscord();

    const app = await createApiServer({
      logger,
      version: 'test',
      authenticator: headerAuthenticator,
    });
    registerOnboardingRoutes(app, {
      client,
      discord,
      executor,
      presetCatalog: PRESET_CATALOG,
      rollbackWindowMs: 30 * 60 * 1000,
      actionContextFactory: ({ guildId, actorId }): OnboardingActionContext => ({
        guildId,
        actorId,
        logger: {
          info: () => undefined,
          warn: () => undefined,
          error: () => undefined,
        },
        discord: mock,
        configPatch: async (patch) => {
          await config.setWith(guildId, patch, { scope: 'onboarding', updatedBy: actorId });
        },
      }),
    });
    return { app, config, mock, executor };
  };

  // ─── Authentication / authorization ───────────────────────────────

  it('401 sans session sur POST /onboarding', async () => {
    const { app } = await build();
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/onboarding`,
        payload: { source: 'blank' },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('403 sans MANAGE_GUILD', async () => {
    const fetch: FetchLike = async () =>
      new Response(JSON.stringify([discordGuild(GUILD, '0x0')]), { status: 200 });
    const logger = silentLogger();
    const config = createConfigService({ client });
    await config.ensureGuild(GUILD);
    const executor = createOnboardingExecutor({ client, logger, delayBetweenActionsMs: 0 });
    for (const a of CORE_ACTIONS) executor.registerAction(a);
    const discord = createDiscordClient({ fetch });
    const mock = buildMockDiscord();
    const app = await createApiServer({
      logger,
      version: 'test',
      authenticator: headerAuthenticator,
    });
    registerOnboardingRoutes(app, {
      client,
      discord,
      executor,
      presetCatalog: PRESET_CATALOG,
      actionContextFactory: ({ guildId, actorId }) => ({
        guildId,
        actorId,
        logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
        discord: mock,
        configPatch: async () => undefined,
      }),
    });
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/onboarding`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({ source: 'blank' }),
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  // ─── Create ───────────────────────────────────────────────────────

  it('POST /onboarding source=blank crée une session en status draft', async () => {
    const { app } = await build();
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/onboarding`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({ source: 'blank' }),
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toMatchObject({
        guildId: GUILD,
        status: 'draft',
        presetSource: 'blank',
        presetId: null,
        draft: { locale: 'fr', roles: [], categories: [], channels: [], modules: [] },
      });
    } finally {
      await app.close();
    }
  });

  it('POST /onboarding source=preset matérialise le preset en draft', async () => {
    const { app } = await build();
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/onboarding`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({ source: 'preset', presetId: communityTechSmall.id }),
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.presetSource).toBe('preset');
      expect(body.presetId).toBe(communityTechSmall.id);
      expect(body.draft.roles).toHaveLength(communityTechSmall.roles.length);
      expect(body.draft.channels).toHaveLength(communityTechSmall.channels.length);
    } finally {
      await app.close();
    }
  });

  it('POST /onboarding 404 si presetId inconnu', async () => {
    const { app } = await build();
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/onboarding`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({ source: 'preset', presetId: 'does-not-exist' }),
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ error: 'preset_not_found' });
    } finally {
      await app.close();
    }
  });

  it('POST /onboarding 409 si une session active existe déjà', async () => {
    const { app } = await build();
    try {
      await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/onboarding`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({ source: 'blank' }),
      });
      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/onboarding`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({ source: 'blank' }),
      });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: 'onboarding_already_active' });
    } finally {
      await app.close();
    }
  });

  // ─── GET current ──────────────────────────────────────────────────

  it('GET /onboarding/current renvoie la session active', async () => {
    const { app } = await build();
    try {
      const created = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/onboarding`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({ source: 'blank' }),
      });
      const sessionId = created.json().id;

      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/onboarding/current`,
        headers: authHeader,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(sessionId);
    } finally {
      await app.close();
    }
  });

  it('GET /onboarding/current 404 quand aucune session active', async () => {
    const { app } = await build();
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/onboarding/current`,
        headers: authHeader,
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ error: 'no_active_session' });
    } finally {
      await app.close();
    }
  });

  // ─── PATCH draft ──────────────────────────────────────────────────

  it('PATCH /draft fusionne profondément le patch dans le draft existant', async () => {
    const { app } = await build();
    try {
      const created = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/onboarding`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({ source: 'blank' }),
      });
      const sessionId = created.json().id;

      const patch: Partial<OnboardingDraft> = {
        roles: [
          {
            localId: 'r-1',
            name: 'Mod',
            color: 0x3498db,
            permissionPreset: 'moderator-minimal',
            hoist: true,
            mentionable: true,
          },
        ],
      };
      const res = await app.inject({
        method: 'PATCH',
        url: `/guilds/${GUILD}/onboarding/${sessionId}/draft`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify(patch),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().draft.roles).toHaveLength(1);
      expect(res.json().draft.roles[0].name).toBe('Mod');
    } finally {
      await app.close();
    }
  });

  it('PATCH /draft 400 si le draft résultant est invalide', async () => {
    const { app } = await build();
    try {
      const created = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/onboarding`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({ source: 'blank' }),
      });
      const sessionId = created.json().id;

      const res = await app.inject({
        method: 'PATCH',
        url: `/guilds/${GUILD}/onboarding/${sessionId}/draft`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({ locale: 'de' }),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'invalid_draft' });
    } finally {
      await app.close();
    }
  });

  // ─── Preview ──────────────────────────────────────────────────────

  it('POST /preview sérialise le draft en liste d actions', async () => {
    const { app } = await build();
    try {
      const created = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/onboarding`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({ source: 'preset', presetId: communityTechSmall.id }),
      });
      const sessionId = created.json().id;

      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/onboarding/${sessionId}/preview`,
        headers: authHeader,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { actions: { type: string }[] };
      const types = body.actions.map((a) => a.type);
      expect(types).toContain('core.createRole');
      expect(types).toContain('core.createCategory');
      expect(types).toContain('core.createChannel');
      expect(types).toContain('core.patchModuleConfig');

      const after = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/onboarding/current`,
        headers: authHeader,
      });
      expect(after.json().status).toBe('previewing');
    } finally {
      await app.close();
    }
  });

  // ─── Apply ────────────────────────────────────────────────────────

  it('POST /apply applique toutes les actions et passe en status applied', async () => {
    const mock = buildMockDiscord();
    const { app } = await build({ mockDiscord: mock });
    try {
      const created = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/onboarding`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({ source: 'preset', presetId: communityTechSmall.id }),
      });
      const sessionId = created.json().id;

      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/onboarding/${sessionId}/apply`,
        headers: authHeader,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.appliedCount).toBeGreaterThan(0);
      expect(mock.createRole).toHaveBeenCalledTimes(communityTechSmall.roles.length);
      expect(mock.createCategory).toHaveBeenCalledTimes(communityTechSmall.categories.length);
      expect(mock.createChannel).toHaveBeenCalledTimes(communityTechSmall.channels.length);

      // GET /current expose toujours la session après apply pour
      // que l UI puisse montrer l écran "Appliqué" avec rollback.
      const after = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/onboarding/current`,
        headers: authHeader,
      });
      expect(after.statusCode).toBe(200);
      expect(after.json()).toMatchObject({ id: sessionId, status: 'applied' });

      const direct = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/onboarding/${sessionId}/rollback`,
        headers: authHeader,
      });
      expect(direct.statusCode).toBe(200);

      // Après rollback, GET /current retombe à 404 (terminal).
      const afterRollback = await app.inject({
        method: 'GET',
        url: `/guilds/${GUILD}/onboarding/current`,
        headers: authHeader,
      });
      expect(afterRollback.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('POST /apply rollback auto quand une action échoue', async () => {
    const failOn = communityTechSmall.channels[0]?.name;
    const mock = buildMockDiscord({ failOnChannelNamed: failOn });
    const { app } = await build({ mockDiscord: mock });
    try {
      const created = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/onboarding`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({ source: 'preset', presetId: communityTechSmall.id }),
      });
      const sessionId = created.json().id;

      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/onboarding/${sessionId}/apply`,
        headers: authHeader,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(false);
      expect(body.error).toBeDefined();
      // Rôles + catégories déjà créés ont été undo.
      expect(mock.deleteRole).toHaveBeenCalled();
      expect(mock.deleteCategory).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  // ─── Rollback ─────────────────────────────────────────────────────

  it('POST /rollback défait toutes les actions et passe en rolled_back', async () => {
    const mock = buildMockDiscord();
    const { app } = await build({ mockDiscord: mock });
    try {
      const created = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/onboarding`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({ source: 'preset', presetId: communityTechSmall.id }),
      });
      const sessionId = created.json().id;
      await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/onboarding/${sessionId}/apply`,
        headers: authHeader,
      });

      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/onboarding/${sessionId}/rollback`,
        headers: authHeader,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.undoneCount).toBeGreaterThan(0);
      expect(mock.deleteRole).toHaveBeenCalled();
      expect(mock.deleteCategory).toHaveBeenCalled();
      expect(mock.deleteChannel).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('POST /rollback 409 hors fenêtre (expiresAt dans le passé)', async () => {
    const mock = buildMockDiscord();
    const logger = silentLogger();
    const config = createConfigService({ client });
    await config.ensureGuild(GUILD);
    const executor = createOnboardingExecutor({ client, logger, delayBetweenActionsMs: 0 });
    for (const a of CORE_ACTIONS) executor.registerAction(a);
    const discord = createDiscordClient({ fetch: adminFetch });
    const app = await createApiServer({
      logger,
      version: 'test',
      authenticator: headerAuthenticator,
    });
    registerOnboardingRoutes(app, {
      client,
      discord,
      executor,
      presetCatalog: PRESET_CATALOG,
      // Fenêtre 1 ms : le apply sort immédiatement de la zone.
      rollbackWindowMs: 1,
      actionContextFactory: ({ guildId, actorId }) => ({
        guildId,
        actorId,
        logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
        discord: mock,
        configPatch: async () => undefined,
      }),
    });

    try {
      const created = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/onboarding`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({ source: 'preset', presetId: communityTechSmall.id }),
      });
      const sessionId = created.json().id;
      await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/onboarding/${sessionId}/apply`,
        headers: authHeader,
      });
      await new Promise((r) => setTimeout(r, 10));

      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/onboarding/${sessionId}/rollback`,
        headers: authHeader,
      });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: 'rollback_window_expired' });
    } finally {
      await app.close();
    }
  });
});
