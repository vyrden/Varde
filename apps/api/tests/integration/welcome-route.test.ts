import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GuildId } from '@varde/contracts';
import { createConfigService, createLogger } from '@varde/core';
import { applyMigrations, createDbClient, type DbClient, sqliteSchema } from '@varde/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type Authenticator,
  createApiServer,
  createDiscordClient,
  type DiscordGuild,
  type FetchLike,
  type SessionData,
} from '../../src/index.js';
import { registerWelcomeRoutes } from '../../src/routes/welcome.js';
import { createWelcomeUploadsService } from '../../src/welcome-uploads.js';

/**
 * Tests d'intégration des routes welcome (jalon 5 PR 5.7). Couvre :
 *
 * - Background CRUD (POST upload, DELETE, GET) avec un vrai
 *   `WelcomeUploadsService` adossé à un dossier temporaire.
 * - test-welcome / test-autorole : auth, validation body/draft,
 *   happy path avec un `discordService` mocké.
 * - GET fonts (route triviale auth-only).
 *
 * preview-card n'est pas couvert ici parce qu'il appelle
 * `renderWelcomeCard` (napi-rs/canvas) — heavy. Couverture du
 * pipeline canvas reste dans `modules/welcome` côté unitaire.
 */

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

const authHeader = {
  'x-test-session': JSON.stringify({ userId: '333333333333333333', accessToken: 'tok' }),
};

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const PNG_DATA_URL = `data:image/png;base64,${PNG_BYTES.toString('base64')}`;

interface MockDiscordService {
  sendMessage: ReturnType<typeof vi.fn>;
  sendDirectMessage: ReturnType<typeof vi.fn>;
  addMemberRole: ReturnType<typeof vi.fn>;
}

const buildMockDiscordService = (): MockDiscordService => ({
  sendMessage: vi.fn().mockResolvedValue({ id: 'msg-1' }),
  sendDirectMessage: vi.fn().mockResolvedValue({ id: 'dm-1' }),
  addMemberRole: vi.fn().mockResolvedValue(undefined),
});

const buildDraft = (overrides: Record<string, unknown> = {}): unknown => ({
  version: 1,
  welcome: {
    enabled: true,
    destination: 'channel',
    channelId: '999888777666555444',
    // mock discord channel ID — accepté tel quel par welcomeConfigSchema
    message: 'Bienvenue {user.mention}',
    embed: { enabled: false, color: '#5865F2' },
    card: {
      enabled: false,
      backgroundColor: '#2C2F33',
      backgroundImagePath: null,
      text: { titleFontSize: 32, subtitleFontSize: 20, fontFamily: 'sans-serif' },
    },
  },
  goodbye: {
    enabled: false,
    channelId: null,
    message: '',
    embed: { enabled: false, color: '#5865F2' },
    card: {
      enabled: false,
      backgroundColor: '#2C2F33',
      backgroundImagePath: null,
      text: { titleFontSize: 32, subtitleFontSize: 20, fontFamily: 'sans-serif' },
    },
  },
  autorole: { enabled: false, roleIds: [], delaySeconds: 0 },
  accountAgeFilter: { enabled: false, minDays: 0, action: 'kick', quarantineRoleId: null },
  ...overrides,
});

describe('routes welcome', () => {
  let client: DbClient<'sqlite'>;
  let uploadsDir: string;

  beforeEach(async () => {
    client = createDbClient({ driver: 'sqlite', url: ':memory:' });
    await applyMigrations(client);
    await client.db.insert(sqliteSchema.guilds).values({ id: GUILD, name: 'Alpha' }).run();
    uploadsDir = await mkdtemp(join(tmpdir(), 'varde-welcome-route-'));
  });

  afterEach(async () => {
    await client.close();
    await rm(uploadsDir, { recursive: true, force: true });
  });

  const build = async (
    opts: { withUploads?: boolean; withDiscordService?: MockDiscordService | null } = {},
  ) => {
    const logger = silentLogger();
    const config = createConfigService({ client });
    await config.ensureGuild(GUILD);
    const discord = createDiscordClient({ fetch: adminFetch });
    const app = await createApiServer({
      logger,
      version: 'test',
      authenticator: headerAuthenticator,
    });
    const uploads =
      opts.withUploads !== false ? createWelcomeUploadsService(uploadsDir) : undefined;
    // `null` désactive explicitement, `undefined` retombe sur un mock par défaut.
    const discordService =
      opts.withDiscordService === null
        ? null
        : (opts.withDiscordService ?? buildMockDiscordService());
    registerWelcomeRoutes(app, {
      discord,
      config,
      ...(uploads ? { uploads } : {}),
      // biome-ignore lint/suspicious/noExplicitAny: tests injectent un mock minimal
      ...(discordService ? { discordService: discordService as any } : {}),
    });
    return { app, config, discordService };
  };

  // ─── Background : POST (upload) ─────────────────────────────────

  describe('POST /modules/welcome/background', () => {
    it('200 + persiste l image quand body et target valides', async () => {
      const { app } = await build();
      try {
        const res = await app.inject({
          method: 'POST',
          url: `/guilds/${GUILD}/modules/welcome/background?target=welcome`,
          headers: { ...authHeader, 'content-type': 'application/json' },
          payload: JSON.stringify({ dataUrl: PNG_DATA_URL }),
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { ok: boolean; relativePath: string };
        expect(body.ok).toBe(true);
        expect(body.relativePath).toMatch(/welcome-bg\.png$/);
      } finally {
        await app.close();
      }
    });

    it('400 quand target absent ou invalide', async () => {
      const { app } = await build();
      try {
        const res = await app.inject({
          method: 'POST',
          url: `/guilds/${GUILD}/modules/welcome/background?target=invalid`,
          headers: { ...authHeader, 'content-type': 'application/json' },
          payload: JSON.stringify({ dataUrl: PNG_DATA_URL }),
        });
        expect(res.statusCode).toBe(400);
        expect((res.json() as { reason: string }).reason).toBe('target-invalide');
      } finally {
        await app.close();
      }
    });

    it('400 + reason invalid-image-content quand magic bytes ne matchent pas', async () => {
      const { app } = await build();
      try {
        const html = Buffer.from('<html></html>').toString('base64');
        const res = await app.inject({
          method: 'POST',
          url: `/guilds/${GUILD}/modules/welcome/background?target=welcome`,
          headers: { ...authHeader, 'content-type': 'application/json' },
          payload: JSON.stringify({ dataUrl: `data:image/png;base64,${html}` }),
        });
        expect(res.statusCode).toBe(400);
        expect((res.json() as { reason: string }).reason).toBe('invalid-image-content');
      } finally {
        await app.close();
      }
    });

    it('503 quand service uploads non câblé', async () => {
      const { app } = await build({ withUploads: false });
      try {
        const res = await app.inject({
          method: 'POST',
          url: `/guilds/${GUILD}/modules/welcome/background?target=welcome`,
          headers: { ...authHeader, 'content-type': 'application/json' },
          payload: JSON.stringify({ dataUrl: PNG_DATA_URL }),
        });
        expect(res.statusCode).toBe(503);
        expect((res.json() as { reason: string }).reason).toBe('uploads-indisponible');
      } finally {
        await app.close();
      }
    });

    it('401 sans session', async () => {
      const { app } = await build();
      try {
        const res = await app.inject({
          method: 'POST',
          url: `/guilds/${GUILD}/modules/welcome/background?target=welcome`,
          headers: { 'content-type': 'application/json' },
          payload: JSON.stringify({ dataUrl: PNG_DATA_URL }),
        });
        expect(res.statusCode).toBe(401);
      } finally {
        await app.close();
      }
    });
  });

  // ─── Background : DELETE ────────────────────────────────────────

  describe('DELETE /modules/welcome/background', () => {
    it('204 même quand aucune image existe (idempotent)', async () => {
      const { app } = await build();
      try {
        const res = await app.inject({
          method: 'DELETE',
          url: `/guilds/${GUILD}/modules/welcome/background?target=welcome`,
          headers: authHeader,
        });
        expect(res.statusCode).toBe(204);
      } finally {
        await app.close();
      }
    });

    it('204 et supprime le fichier après upload + delete', async () => {
      const { app } = await build();
      try {
        await app.inject({
          method: 'POST',
          url: `/guilds/${GUILD}/modules/welcome/background?target=welcome`,
          headers: { ...authHeader, 'content-type': 'application/json' },
          payload: JSON.stringify({ dataUrl: PNG_DATA_URL }),
        });
        const del = await app.inject({
          method: 'DELETE',
          url: `/guilds/${GUILD}/modules/welcome/background?target=welcome`,
          headers: authHeader,
        });
        expect(del.statusCode).toBe(204);
        const get = await app.inject({
          method: 'GET',
          url: `/guilds/${GUILD}/modules/welcome/background?target=welcome`,
          headers: authHeader,
        });
        expect(get.statusCode).toBe(404);
      } finally {
        await app.close();
      }
    });

    it('400 sans target valide', async () => {
      const { app } = await build();
      try {
        const res = await app.inject({
          method: 'DELETE',
          url: `/guilds/${GUILD}/modules/welcome/background?target=mars`,
          headers: authHeader,
        });
        expect(res.statusCode).toBe(400);
      } finally {
        await app.close();
      }
    });

    it('503 quand uploads non câblé', async () => {
      const { app } = await build({ withUploads: false });
      try {
        const res = await app.inject({
          method: 'DELETE',
          url: `/guilds/${GUILD}/modules/welcome/background?target=welcome`,
          headers: authHeader,
        });
        expect(res.statusCode).toBe(503);
      } finally {
        await app.close();
      }
    });
  });

  // ─── Background : GET ───────────────────────────────────────────

  describe('GET /modules/welcome/background', () => {
    it('200 avec content-type image après upload', async () => {
      const { app } = await build();
      try {
        await app.inject({
          method: 'POST',
          url: `/guilds/${GUILD}/modules/welcome/background?target=goodbye`,
          headers: { ...authHeader, 'content-type': 'application/json' },
          payload: JSON.stringify({ dataUrl: PNG_DATA_URL }),
        });
        const res = await app.inject({
          method: 'GET',
          url: `/guilds/${GUILD}/modules/welcome/background?target=goodbye`,
          headers: authHeader,
        });
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toBe('image/png');
        expect(res.rawPayload).toBeInstanceOf(Buffer);
      } finally {
        await app.close();
      }
    });

    it('404 reason no-background quand aucune image persistée', async () => {
      const { app } = await build();
      try {
        const res = await app.inject({
          method: 'GET',
          url: `/guilds/${GUILD}/modules/welcome/background?target=welcome`,
          headers: authHeader,
        });
        expect(res.statusCode).toBe(404);
        expect((res.json() as { reason: string }).reason).toBe('no-background');
      } finally {
        await app.close();
      }
    });

    it('503 quand uploads non câblé', async () => {
      const { app } = await build({ withUploads: false });
      try {
        const res = await app.inject({
          method: 'GET',
          url: `/guilds/${GUILD}/modules/welcome/background?target=welcome`,
          headers: authHeader,
        });
        expect(res.statusCode).toBe(503);
      } finally {
        await app.close();
      }
    });
  });

  // ─── test-autorole ──────────────────────────────────────────────

  describe('POST /modules/welcome/test-autorole', () => {
    it('200 + assigned[] quand draft valide avec autorole activé', async () => {
      const { app, discordService } = await build();
      try {
        const draft = buildDraft({
          autorole: {
            enabled: true,
            roleIds: ['111111111111111111', '222222222222222222'],
            delaySeconds: 0,
          },
        });
        const res = await app.inject({
          method: 'POST',
          url: `/guilds/${GUILD}/modules/welcome/test-autorole`,
          headers: { ...authHeader, 'content-type': 'application/json' },
          payload: JSON.stringify({ draft, target: 'welcome' }),
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { ok: boolean; assigned: string[] };
        expect(body.ok).toBe(true);
        expect(body.assigned).toEqual(['111111111111111111', '222222222222222222']);
        expect(discordService?.addMemberRole).toHaveBeenCalledTimes(2);
      } finally {
        await app.close();
      }
    });

    it('400 reason autorole-désactivé quand draft sans autorole actif', async () => {
      const { app } = await build();
      try {
        const draft = buildDraft();
        const res = await app.inject({
          method: 'POST',
          url: `/guilds/${GUILD}/modules/welcome/test-autorole`,
          headers: { ...authHeader, 'content-type': 'application/json' },
          payload: JSON.stringify({ draft }),
        });
        expect(res.statusCode).toBe(400);
        expect((res.json() as { reason: string }).reason).toBe('autorole-désactivé');
      } finally {
        await app.close();
      }
    });

    it('502 reason all-roles-failed quand toutes les attributions échouent', async () => {
      const failingService = buildMockDiscordService();
      failingService.addMemberRole.mockRejectedValue(new Error('Missing Permissions'));
      const { app } = await build({ withDiscordService: failingService });
      try {
        const draft = buildDraft({
          autorole: { enabled: true, roleIds: ['111111111111111111'], delaySeconds: 0 },
        });
        const res = await app.inject({
          method: 'POST',
          url: `/guilds/${GUILD}/modules/welcome/test-autorole`,
          headers: { ...authHeader, 'content-type': 'application/json' },
          payload: JSON.stringify({ draft }),
        });
        expect(res.statusCode).toBe(502);
        expect((res.json() as { reason: string }).reason).toBe('all-roles-failed');
      } finally {
        await app.close();
      }
    });

    it('503 quand discordService non câblé', async () => {
      const { app } = await build({ withDiscordService: null });
      try {
        const draft = buildDraft({
          autorole: { enabled: true, roleIds: ['111111111111111111'], delaySeconds: 0 },
        });
        const res = await app.inject({
          method: 'POST',
          url: `/guilds/${GUILD}/modules/welcome/test-autorole`,
          headers: { ...authHeader, 'content-type': 'application/json' },
          payload: JSON.stringify({ draft }),
        });
        expect(res.statusCode).toBe(503);
      } finally {
        await app.close();
      }
    });

    it('400 quand body est malformé', async () => {
      const { app } = await build();
      try {
        const res = await app.inject({
          method: 'POST',
          url: `/guilds/${GUILD}/modules/welcome/test-autorole`,
          headers: { ...authHeader, 'content-type': 'application/json' },
          payload: JSON.stringify({ wrong: 'shape' }),
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
          method: 'POST',
          url: `/guilds/${GUILD}/modules/welcome/test-autorole`,
          headers: { 'content-type': 'application/json' },
          payload: JSON.stringify({ draft: buildDraft() }),
        });
        expect(res.statusCode).toBe(401);
      } finally {
        await app.close();
      }
    });
  });

  // ─── fonts ──────────────────────────────────────────────────────

  describe('GET /modules/welcome/fonts', () => {
    it('200 avec liste des polices enregistrées', async () => {
      const { app } = await build();
      try {
        const res = await app.inject({
          method: 'GET',
          url: `/guilds/${GUILD}/modules/welcome/fonts`,
          headers: authHeader,
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { fonts: string[] };
        expect(Array.isArray(body.fonts)).toBe(true);
      } finally {
        await app.close();
      }
    });

    it('401 sans session', async () => {
      const { app } = await build();
      try {
        const res = await app.inject({
          method: 'GET',
          url: `/guilds/${GUILD}/modules/welcome/fonts`,
        });
        expect(res.statusCode).toBe(401);
      } finally {
        await app.close();
      }
    });
  });

  // ─── preview-card : auth + validation seulement ─────────────────

  describe('POST /modules/welcome/preview-card', () => {
    it('400 quand body invalide (pas de champ obligatoire)', async () => {
      const { app } = await build();
      try {
        const res = await app.inject({
          method: 'POST',
          url: `/guilds/${GUILD}/modules/welcome/preview-card`,
          headers: { ...authHeader, 'content-type': 'application/json' },
          payload: JSON.stringify({}),
        });
        expect(res.statusCode).toBe(400);
        expect((res.json() as { reason: string }).reason).toBe('body-invalide');
      } finally {
        await app.close();
      }
    });

    it('401 sans session', async () => {
      const { app } = await build();
      try {
        const res = await app.inject({
          method: 'POST',
          url: `/guilds/${GUILD}/modules/welcome/preview-card`,
          headers: { 'content-type': 'application/json' },
          payload: JSON.stringify({ backgroundColor: '#000', title: 'T', subtitle: '' }),
        });
        expect(res.statusCode).toBe(401);
      } finally {
        await app.close();
      }
    });
  });
});
