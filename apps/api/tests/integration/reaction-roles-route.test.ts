import type {
  ChannelId,
  DiscordService,
  Emoji,
  GuildId,
  MessageId,
  RoleId,
} from '@varde/contracts';
import { DiscordSendError } from '@varde/contracts';
import type { CoreConfigService } from '@varde/core';
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
import { registerReactionRolesRoutes } from '../../src/routes/reaction-roles.js';

// ---------------------------------------------------------------------------
// Helpers partagés
// ---------------------------------------------------------------------------

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

const GUILD: GuildId = '222333444555666777' as GuildId;
const CHANNEL: ChannelId = '111222333444555666' as ChannelId;
const MESSAGE_ID: MessageId = '999888777666555444' as MessageId;
const ROLE_ID: RoleId = '444555666777888999' as RoleId;
const NEW_ROLE_ID: RoleId = '555666777888999000' as RoleId;

const headerAuthenticator: Authenticator = (request) => {
  const raw = request.headers['x-test-session'];
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
};

const discordGuildDto = (id: string, permissions: string): DiscordGuild => ({
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

const adminFetch: FetchLike = async () => jsonResponse([discordGuildDto(GUILD, '0x20')]);
const nonAdminFetch: FetchLike = async () => jsonResponse([discordGuildDto(GUILD, '0x8')]);

// ---------------------------------------------------------------------------
// Factories de mocks
// ---------------------------------------------------------------------------

const makeConfig = (overrides: Partial<CoreConfigService> = {}): CoreConfigService =>
  ({
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(undefined),
    setWith: vi.fn().mockResolvedValue(undefined),
    ensureGuild: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as unknown as CoreConfigService;

const makeDiscordService = (overrides: Partial<DiscordService> = {}): DiscordService => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
  sendEmbed: vi.fn().mockResolvedValue(undefined),
  addReaction: vi.fn().mockResolvedValue(undefined),
  removeUserReaction: vi.fn().mockResolvedValue(undefined),
  removeOwnReaction: vi.fn().mockResolvedValue(undefined),
  addMemberRole: vi.fn().mockResolvedValue(undefined),
  removeMemberRole: vi.fn().mockResolvedValue(undefined),
  memberHasRole: vi.fn().mockResolvedValue(false),
  postMessage: vi.fn().mockResolvedValue({ id: MESSAGE_ID }),
  createRole: vi.fn().mockResolvedValue({ id: NEW_ROLE_ID }),
  deleteMessage: vi.fn().mockResolvedValue(undefined),
  editMessage: vi.fn().mockResolvedValue(undefined),
  sendDirectMessage: vi.fn().mockResolvedValue(true),
  getGuildName: vi.fn().mockReturnValue('Test Guild'),
  getRoleName: vi.fn().mockReturnValue('Test Role'),
  kickMember: vi.fn().mockResolvedValue(undefined),
  getMemberCount: vi.fn().mockReturnValue(100),
  getUserDisplayInfo: vi.fn().mockResolvedValue(null),
  ...overrides,
});

const build = async (
  fetchImpl: FetchLike,
  discordService?: DiscordService,
  config?: CoreConfigService,
) => {
  const logger = silentLogger();
  const discord = createDiscordClient({ fetch: fetchImpl });
  const app = await createApiServer({
    logger,
    version: 'test',
    authenticator: headerAuthenticator,
  });
  registerReactionRolesRoutes(app, {
    discord,
    discordService,
    config: config ?? makeConfig(),
  });
  return { app };
};

// ---------------------------------------------------------------------------
// Corps de requête valides
// ---------------------------------------------------------------------------

const validPublishBody = {
  label: 'Rôles de jeu',
  channelId: CHANNEL,
  message: 'Choisissez votre rôle !',
  mode: 'normal',
  pairs: [
    { emoji: { type: 'unicode', value: '🎮' }, roleId: ROLE_ID },
    { emoji: { type: 'unicode', value: '🎨' }, roleName: 'Artiste' },
  ],
};

const validSyncBody = {
  label: 'Rôles de jeu (màj)',
  channelId: CHANNEL,
  message: 'Choisis ton/tes rôles de jeu (màj)',
  mode: 'unique',
  pairs: [{ emoji: { type: 'unicode', value: '🎮' }, roleId: ROLE_ID }],
};

// ---------------------------------------------------------------------------
// Tests — POST publish
// ---------------------------------------------------------------------------

describe('POST /guilds/:guildId/modules/reaction-roles/publish', () => {
  const url = `/guilds/${GUILD}/modules/reaction-roles/publish`;

  it('401 sans session', async () => {
    const { app } = await build(adminFetch);
    try {
      const res = await app.inject({ method: 'POST', url });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('403 si non admin de la guild', async () => {
    const { app } = await build(nonAdminFetch, makeDiscordService());
    try {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify(validPublishBody),
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('503 si discordService absent', async () => {
    const { app } = await build(adminFetch, undefined);
    try {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify(validPublishBody),
      });
      expect(res.statusCode).toBe(503);
    } finally {
      await app.close();
    }
  });

  it('400 si body invalide (0 paires)', async () => {
    const { app } = await build(adminFetch, makeDiscordService());
    try {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({ ...validPublishBody, pairs: [] }),
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('400 si body invalide (label manquant)', async () => {
    const { app } = await build(adminFetch, makeDiscordService());
    try {
      const body = { ...validPublishBody };
      const { label: _label, ...bodyWithoutLabel } = body;
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify(bodyWithoutLabel),
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('400 si une paire sans roleId ni roleName', async () => {
    const { app } = await build(adminFetch, makeDiscordService());
    try {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({
          ...validPublishBody,
          pairs: [{ emoji: { type: 'unicode', value: '🎮' } }],
        }),
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('201 succès complet : createRole (roleName), postMessage, addReaction x2', async () => {
    const config = makeConfig();
    const discordService = makeDiscordService();
    const { app } = await build(adminFetch, discordService, config);
    try {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify(validPublishBody),
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as { id: string; messageId: string };
      expect(typeof body.id).toBe('string');
      expect(body.messageId).toBe(MESSAGE_ID);

      // createRole appelé une seule fois (la paire avec roleName)
      expect(discordService.createRole).toHaveBeenCalledOnce();
      expect(discordService.createRole).toHaveBeenCalledWith(
        GUILD,
        expect.objectContaining({ name: 'Artiste', mentionable: true }),
      );

      // postMessage appelé une fois — en kind 'reactions' (default), aucun
      // composant n'est passé donc le 3e argument est `undefined`.
      expect(discordService.postMessage).toHaveBeenCalledOnce();
      expect(discordService.postMessage).toHaveBeenCalledWith(
        CHANNEL,
        validPublishBody.message,
        undefined,
      );

      // addReaction appelé deux fois (une par paire)
      expect(discordService.addReaction).toHaveBeenCalledTimes(2);

      // Config persistée avec la bonne shape
      expect(config.setWith).toHaveBeenCalledOnce();
      const setWithArgs = (config.setWith as ReturnType<typeof vi.fn>).mock.calls[0] as [
        unknown,
        unknown,
        unknown,
      ];
      const patch = setWithArgs[1] as { modules: { 'reaction-roles': { messages: unknown[] } } };
      expect(patch.modules['reaction-roles'].messages).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it("paires kind: 'button' postent avec components et n'appellent pas addReaction", async () => {
    const discordService = makeDiscordService();
    const config = makeConfig();
    const { app } = await build(adminFetch, discordService, config);
    try {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({
          label: 'Boutons',
          channelId: CHANNEL,
          message: 'Choisis ton rôle',
          mode: 'normal',
          feedback: 'ephemeral',
          pairs: [
            {
              kind: 'button',
              emoji: { type: 'unicode', value: '🎮' },
              roleId: ROLE_ID,
              label: 'Joueur',
              style: 'primary',
            },
          ],
        }),
      });
      expect(res.statusCode).toBe(201);
      expect(discordService.postMessage).toHaveBeenCalledOnce();
      const callArgs = (discordService.postMessage as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        string,
        { components?: unknown[] },
      ];
      expect(callArgs[2]?.components).toBeDefined();
      expect(callArgs[2]?.components).toHaveLength(1);
      expect(discordService.addReaction).not.toHaveBeenCalled();

      const setWithArgs = (config.setWith as ReturnType<typeof vi.fn>).mock.calls[0] as [
        unknown,
        unknown,
        unknown,
      ];
      const patch = setWithArgs[1] as {
        modules: {
          'reaction-roles': {
            messages: { feedback: string; pairs: { kind: string }[] }[];
          };
        };
      };
      expect(patch.modules['reaction-roles'].messages[0]?.feedback).toBe('ephemeral');
      expect(patch.modules['reaction-roles'].messages[0]?.pairs[0]?.kind).toBe('button');
    } finally {
      await app.close();
    }
  });

  it("mélange kind: 'reaction' + 'button' : poste components ET appelle addReaction pour la paire reaction", async () => {
    const discordService = makeDiscordService();
    const { app } = await build(adminFetch, discordService);
    try {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({
          label: 'Mix',
          channelId: CHANNEL,
          message: 'Choisis comme tu veux',
          mode: 'normal',
          feedback: 'ephemeral',
          pairs: [
            {
              kind: 'reaction',
              emoji: { type: 'unicode', value: '🎮' },
              roleId: ROLE_ID,
            },
            {
              kind: 'button',
              emoji: { type: 'unicode', value: '🎨' },
              roleId: ROLE_ID,
              label: 'Artiste',
            },
          ],
        }),
      });
      expect(res.statusCode).toBe(201);
      expect(discordService.postMessage).toHaveBeenCalledOnce();
      const callArgs = (discordService.postMessage as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        string,
        { components?: unknown[] },
      ];
      expect(callArgs[2]?.components).toHaveLength(1); // une row, un seul bouton
      expect(discordService.addReaction).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });

  it("400 si feedback: 'ephemeral' sans aucune paire kind: 'button'", async () => {
    const { app } = await build(adminFetch, makeDiscordService());
    try {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({ ...validPublishBody, feedback: 'ephemeral' }),
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('502 si postMessage lève DiscordSendError', async () => {
    const discordService = makeDiscordService({
      postMessage: vi
        .fn()
        .mockRejectedValue(new DiscordSendError('channel-not-found', 'Salon introuvable')),
    });
    const { app } = await build(adminFetch, discordService);
    try {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify(validPublishBody),
      });
      expect(res.statusCode).toBe(502);
      const body = res.json() as { reason: string };
      expect(body.reason).toBe('channel-not-found');
    } finally {
      await app.close();
    }
  });

  it('502 si addReaction lève DiscordSendError en cours de boucle', async () => {
    const discordService = makeDiscordService({
      addReaction: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new DiscordSendError('emoji-not-found', 'Emoji inconnu')),
    });
    const { app } = await build(adminFetch, discordService);
    try {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify(validPublishBody),
      });
      expect(res.statusCode).toBe(502);
      const body = res.json() as { reason: string };
      expect(body.reason).toBe('emoji-not-found');
    } finally {
      await app.close();
    }
  });

  it('espace les appels addReaction d au moins 45ms (rate-limit Discord)', async () => {
    const addReactionTimes: number[] = [];
    const discordService = makeDiscordService({
      addReaction: vi.fn().mockImplementation(async () => {
        addReactionTimes.push(Date.now());
      }),
    });
    const { app } = await build(adminFetch, discordService);
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/guilds/${GUILD}/modules/reaction-roles/publish`,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({
          label: 'Throttle Test',
          channelId: CHANNEL,
          message: 'Choose',
          mode: 'normal',
          pairs: [
            { emoji: { type: 'unicode', value: '🎉' }, roleId: ROLE_ID },
            { emoji: { type: 'unicode', value: '🔥' }, roleId: ROLE_ID },
            { emoji: { type: 'unicode', value: '💯' }, roleId: ROLE_ID },
          ],
        }),
      });
      expect(res.statusCode).toBe(201);
      // 3 emojis → 3 appels addReaction
      expect(addReactionTimes).toHaveLength(3);
      // 2 intervalles entre les 3 appels — chacun doit être ≥ 45ms
      for (let i = 1; i < addReactionTimes.length; i += 1) {
        const t1 = addReactionTimes[i] ?? 0;
        const t0 = addReactionTimes[i - 1] ?? 0;
        expect(t1 - t0).toBeGreaterThanOrEqual(45);
      }
    } finally {
      await app.close();
    }
  });

  it('502 avec reason role-creation-failed si createRole échoue', async () => {
    const discordService = makeDiscordService({
      createRole: vi
        .fn()
        .mockRejectedValue(new DiscordSendError('missing-permission', 'Pas les droits')),
    });
    const { app } = await build(adminFetch, discordService);
    try {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify(validPublishBody),
      });
      expect(res.statusCode).toBe(502);
      const body = res.json() as { reason: string; detail: string };
      expect(body.reason).toBe('role-creation-failed');
      expect(body.detail).toBe('missing-permission');
    } finally {
      await app.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Tests — POST sync
// ---------------------------------------------------------------------------

describe('POST /guilds/:guildId/modules/reaction-roles/:messageId/sync', () => {
  const url = `/guilds/${GUILD}/modules/reaction-roles/${MESSAGE_ID}/sync`;

  /** Config contenant un message persisté avec deux paires. */
  const configWithMessage = (pairs: Array<{ emoji: Emoji; roleId: RoleId }>) =>
    makeConfig({
      get: vi.fn().mockResolvedValue({
        modules: {
          'reaction-roles': {
            version: 1,
            messages: [
              {
                id: 'entry-1',
                label: 'Rôles de jeu',
                channelId: CHANNEL,
                messageId: MESSAGE_ID,
                mode: 'normal',
                pairs,
              },
            ],
          },
        },
      }),
    });

  it('404 si messageId absent de la config', async () => {
    const config = makeConfig({ get: vi.fn().mockResolvedValue({}) });
    const { app } = await build(adminFetch, makeDiscordService(), config);
    try {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify(validSyncBody),
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('addReaction appelé pour chaque nouvelle paire', async () => {
    // Config initiale : une seule paire (🎮/ROLE_ID)
    const config = configWithMessage([
      { emoji: { type: 'unicode', value: '🎮' } as Emoji, roleId: ROLE_ID },
    ]);
    const discordService = makeDiscordService();
    const { app } = await build(adminFetch, discordService, config);
    try {
      // Body sync : ajoute 🎨 en plus de 🎮
      const syncBody = {
        label: 'Màj',
        channelId: CHANNEL,
        message: 'Réagis pour obtenir un rôle',
        mode: 'normal',
        pairs: [
          { emoji: { type: 'unicode', value: '🎮' }, roleId: ROLE_ID },
          { emoji: { type: 'unicode', value: '🎨' }, roleId: NEW_ROLE_ID },
        ],
      };
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify(syncBody),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { added: number; removed: number };
      expect(body.added).toBe(1);
      expect(body.removed).toBe(0);
      expect(discordService.addReaction).toHaveBeenCalledOnce();
      expect(discordService.removeOwnReaction).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('removeOwnReaction appelé pour chaque paire retirée', async () => {
    // Config initiale : deux paires (🎮 + 🎨)
    const config = configWithMessage([
      { emoji: { type: 'unicode', value: '🎮' } as Emoji, roleId: ROLE_ID },
      { emoji: { type: 'unicode', value: '🎨' } as Emoji, roleId: NEW_ROLE_ID },
    ]);
    const discordService = makeDiscordService();
    const { app } = await build(adminFetch, discordService, config);
    try {
      // Body sync : garde seulement 🎮
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify(validSyncBody),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { added: number; removed: number };
      expect(body.added).toBe(0);
      expect(body.removed).toBe(1);
      expect(discordService.addReaction).not.toHaveBeenCalled();
      expect(discordService.removeOwnReaction).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });

  it('met à jour le label et le mode dans la config persistée', async () => {
    const config = configWithMessage([
      { emoji: { type: 'unicode', value: '🎮' } as Emoji, roleId: ROLE_ID },
    ]);
    const discordService = makeDiscordService();
    const { app } = await build(adminFetch, discordService, config);
    try {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify(validSyncBody),
      });
      expect(res.statusCode).toBe(200);
      expect(config.setWith).toHaveBeenCalledOnce();
      const setWithArgs = (config.setWith as ReturnType<typeof vi.fn>).mock.calls[0] as [
        unknown,
        unknown,
        unknown,
      ];
      const patch = setWithArgs[1] as {
        modules: { 'reaction-roles': { messages: Array<{ label: string; mode: string }> } };
      };
      const updatedMsg = patch.modules['reaction-roles'].messages[0];
      expect(updatedMsg?.label).toBe('Rôles de jeu (màj)');
      expect(updatedMsg?.mode).toBe('unique');
    } finally {
      await app.close();
    }
  });

  it('retourne { added, removed } corrects avec ajout et retrait simultanés', async () => {
    // Config initiale : 🎮 + 🎨
    const config = configWithMessage([
      { emoji: { type: 'unicode', value: '🎮' } as Emoji, roleId: ROLE_ID },
      { emoji: { type: 'unicode', value: '🎨' } as Emoji, roleId: NEW_ROLE_ID },
    ]);
    const discordService = makeDiscordService();
    const { app } = await build(adminFetch, discordService, config);
    try {
      // Body sync : retire 🎨, ajoute 🚀
      const syncBody = {
        label: 'Màj mixte',
        channelId: CHANNEL,
        message: 'Réagis pour obtenir un rôle',
        mode: 'normal',
        pairs: [
          { emoji: { type: 'unicode', value: '🎮' }, roleId: ROLE_ID },
          { emoji: { type: 'unicode', value: '🚀' }, roleId: ROLE_ID },
        ],
      };
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify(syncBody),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { added: number; removed: number };
      expect(body.added).toBe(1);
      expect(body.removed).toBe(1);
    } finally {
      await app.close();
    }
  });

  it('401 sans session', async () => {
    const { app } = await build(adminFetch, makeDiscordService());
    try {
      const res = await app.inject({ method: 'POST', url });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('503 si discordService absent', async () => {
    const config = configWithMessage([
      { emoji: { type: 'unicode', value: '🎮' } as Emoji, roleId: ROLE_ID },
    ]);
    const { app } = await build(adminFetch, undefined, config);
    try {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { ...authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify(validSyncBody),
      });
      expect(res.statusCode).toBe(503);
    } finally {
      await app.close();
    }
  });
});
