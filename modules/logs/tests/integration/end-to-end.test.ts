import {
  type ActionId,
  type ChannelId,
  DiscordSendError,
  type GuildId,
  type ModuleContext,
  type ModuleId,
  type UIMessage,
  type UserId,
} from '@varde/contracts';
import { createEventBus, createLogger, createUIService } from '@varde/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logs } from '../../src/index.js';
import { locales } from '../../src/locales.js';

// ---------------------------------------------------------------------------
// Constantes de test
// ---------------------------------------------------------------------------

const GUILD = '123456789012345678' as GuildId;
const USER = '987654321098765432' as UserId;
const CHANNEL = '111222333444555666' as ChannelId;
const ROUTE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const memberJoinEvent = {
  type: 'guild.memberJoin' as const,
  guildId: GUILD,
  userId: USER,
  joinedAt: new Date('2026-04-22T10:00:00.000Z').getTime(),
};

// ---------------------------------------------------------------------------
// Factory ctx minimal
// ---------------------------------------------------------------------------

function buildCtx(
  overrides: Partial<Pick<ModuleContext, 'discord' | 'config' | 'audit'>> = {},
): ModuleContext {
  const logger = createLogger({ destination: { write: () => undefined }, level: 'fatal' });
  const eventBus = createEventBus({ logger });
  const ui = createUIService();

  const noop = logger.child({ module: 'logs' });

  const defaultConfig = {
    version: 1 as const,
    routes: [
      {
        id: ROUTE_ID,
        label: 'Logs généraux',
        events: ['guild.memberJoin'],
        channelId: CHANNEL,
        verbosity: 'detailed' as const,
      },
    ],
    exclusions: { userIds: [], roleIds: [], channelIds: [], excludeBots: true },
  };

  const ctx: ModuleContext = {
    module: { id: 'logs' as ModuleId, version: '1.0.0' },
    logger: noop,
    config: {
      get: async (_guildId) => ({ modules: { logs: defaultConfig } }),
      set: async () => undefined,
    },
    db: { __scoped: true },
    events: eventBus,
    audit: {
      log: vi.fn().mockResolvedValue(undefined),
    },
    permissions: {
      can: async () => false,
    },
    discord: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
      sendEmbed: vi.fn().mockResolvedValue(undefined),
    },
    scheduler: {
      in: vi.fn().mockResolvedValue(undefined),
      at: vi.fn().mockResolvedValue(undefined),
      cron: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(false),
    },
    i18n: {
      t: (key: string, params?: Record<string, string | number>) => {
        // Résolution identity avec substitution basique des params.
        let out = locales.fr[key as keyof typeof locales.fr] ?? key;
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            out = out.replaceAll(`{${k}}`, String(v));
          }
        }
        return out;
      },
    },
    modules: {
      query: async () => {
        throw new Error('stub');
      },
      isEnabled: async () => false,
    },
    keystore: {
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    ai: null,
    ui,
    onboarding: {
      registerAction: () => undefined,
      contributeHint: () => undefined,
    },
    ...overrides,
  };

  return ctx;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('logs — intégration end-to-end', () => {
  let ctx: ModuleContext;

  beforeEach(async () => {
    ctx = buildCtx();
    await logs.onLoad(ctx);
  });

  afterEach(async () => {
    await logs.onUnload(ctx);
  });

  it('guild.memberJoin → sendEmbed appelé avec le bon channelId et un UIMessage embed', async () => {
    await ctx.events.emit(memberJoinEvent);

    // Laisser les microtasks se résoudre.
    await Promise.resolve();

    expect(ctx.discord.sendEmbed).toHaveBeenCalledOnce();
    const [calledChannelId, calledMessage] = (ctx.discord.sendEmbed as ReturnType<typeof vi.fn>)
      .mock.calls[0] as [ChannelId, UIMessage];
    expect(calledChannelId).toBe(CHANNEL);
    expect(calledMessage.kind).toBe('embed');
  });

  it('DiscordSendError → pas de crash du bus, audit.log appelé avec severity warn', async () => {
    const sendEmbedMock = vi
      .fn()
      .mockRejectedValue(
        new DiscordSendError('channel-not-found', 'Salon introuvable dans le test.'),
      );
    const auditMock = vi.fn().mockResolvedValue(undefined);

    ctx = buildCtx({
      discord: {
        sendMessage: vi.fn().mockResolvedValue(undefined),
        sendEmbed: sendEmbedMock,
      },
      audit: { log: auditMock },
    });
    // Réinitialiser le module avec le nouveau ctx.
    await logs.onLoad(ctx);

    // Ne doit pas lever d'exception.
    await expect(ctx.events.emit(memberJoinEvent)).resolves.not.toThrow();
    await Promise.resolve();
    // Laisser les promesses void (audit) se régler.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendEmbedMock).toHaveBeenCalledOnce();
    expect(auditMock).toHaveBeenCalledOnce();
    const entry = (auditMock as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      severity: string;
      action: ActionId;
    };
    expect(entry.severity).toBe('warn');
    expect(entry.action).toBe('logs.route.broken');
  });

  it("event sans route correspondante → sendEmbed n'est pas appelé", async () => {
    // Config avec une route qui écoute uniquement guild.memberLeave.
    const sendEmbedMock = vi.fn().mockResolvedValue(undefined);
    const ctxNoMatch = buildCtx({
      config: {
        get: async (_guildId) => ({
          modules: {
            logs: {
              version: 1,
              routes: [
                {
                  id: ROUTE_ID,
                  label: 'Départs seulement',
                  events: ['guild.memberLeave'],
                  channelId: CHANNEL,
                  verbosity: 'detailed',
                },
              ],
              exclusions: { userIds: [], roleIds: [], channelIds: [], excludeBots: true },
            },
          },
        }),
        set: async () => undefined,
      },
      discord: {
        sendMessage: vi.fn().mockResolvedValue(undefined),
        sendEmbed: sendEmbedMock,
      },
    });

    await logs.onLoad(ctxNoMatch);
    // Émettre guild.memberJoin — aucune route ne matche.
    await ctxNoMatch.events.emit(memberJoinEvent);
    await Promise.resolve();

    expect(sendEmbedMock).not.toHaveBeenCalled();

    await logs.onUnload(ctxNoMatch);
  });
});
