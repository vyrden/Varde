import type { GuildMemberJoinEvent, GuildMemberLeaveEvent, ModuleContext } from '@varde/contracts';
import { describe, expect, it, vi } from 'vitest';

import { handleMemberJoin, handleMemberLeave } from '../../src/runtime.js';

const GUILD = '111111111111111111' as never;
const USER = '222222222222222222' as never;
const ROLE = '333333333333333333' as never;
const CHANNEL = '444444444444444444' as never;
const QUARANTINE_ROLE = '555555555555555555' as never;

const makeCtx = (config: unknown, overrides: Record<string, unknown> = {}): ModuleContext => {
  return {
    logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn(), child: () => ({}) },
    config: { get: vi.fn().mockResolvedValue({ modules: { welcome: config } }) },
    discord: {
      addMemberRole: vi.fn().mockResolvedValue(undefined),
      removeMemberRole: vi.fn().mockResolvedValue(undefined),
      kickMember: vi.fn().mockResolvedValue(undefined),
      postMessage: vi.fn().mockResolvedValue({ id: 'msg-1' }),
      sendDirectMessage: vi.fn().mockResolvedValue(true),
      getGuildName: vi.fn().mockReturnValue('Test Guild'),
      getMemberCount: vi.fn().mockReturnValue(42),
      getUserDisplayInfo: vi.fn().mockResolvedValue({
        username: 'alice',
        tag: 'alice',
        avatarUrl: '',
        // 30 jours d'âge
        accountCreatedAt: Date.now() - 30 * 24 * 3600 * 1000,
      }),
      ...overrides,
    },
    audit: { log: vi.fn().mockResolvedValue(undefined) },
    scheduler: {
      in: vi
        .fn()
        .mockImplementation(async (_ms: number, _key: string, fn: () => Promise<void>) => fn()),
    },
  } as unknown as ModuleContext;
};

const joinEvent = (): GuildMemberJoinEvent => ({
  type: 'guild.memberJoin',
  guildId: GUILD,
  userId: USER,
  joinedAt: Date.now(),
});

const leaveEvent = (): GuildMemberLeaveEvent => ({
  type: 'guild.memberLeave',
  guildId: GUILD,
  userId: USER,
  leftAt: Date.now(),
});

describe('handleMemberJoin', () => {
  it('ne fait rien si welcome désactivé et autorole désactivé', async () => {
    const ctx = makeCtx({});
    await handleMemberJoin(ctx, joinEvent());
    expect(ctx.discord.postMessage).not.toHaveBeenCalled();
    expect(ctx.discord.addMemberRole).not.toHaveBeenCalled();
  });

  it('attribue les rôles auto immédiatement quand delaySeconds=0', async () => {
    const ctx = makeCtx({
      autorole: { enabled: true, roleIds: [ROLE], delaySeconds: 0 },
    });
    await handleMemberJoin(ctx, joinEvent());
    expect(ctx.discord.addMemberRole).toHaveBeenCalledWith(GUILD, USER, ROLE);
  });

  it('passe par scheduler.in si delaySeconds > 0', async () => {
    const ctx = makeCtx({
      autorole: { enabled: true, roleIds: [ROLE], delaySeconds: 60 },
    });
    await handleMemberJoin(ctx, joinEvent());
    expect(ctx.scheduler.in).toHaveBeenCalled();
    expect(ctx.discord.addMemberRole).toHaveBeenCalledWith(GUILD, USER, ROLE);
  });

  it('kick un compte trop neuf et saute welcome + autorole', async () => {
    const ctx = makeCtx(
      {
        accountAgeFilter: { enabled: true, minDays: 60, action: 'kick', quarantineRoleId: null },
        autorole: { enabled: true, roleIds: [ROLE], delaySeconds: 0 },
        welcome: { enabled: true, destination: 'channel', channelId: CHANNEL, message: 'Hi' },
      },
      {
        getUserDisplayInfo: vi.fn().mockResolvedValue({
          username: 'newbie',
          tag: 'newbie',
          avatarUrl: '',
          accountCreatedAt: Date.now() - 5 * 24 * 3600 * 1000,
        }),
      },
    );
    await handleMemberJoin(ctx, joinEvent());
    expect(ctx.discord.kickMember).toHaveBeenCalled();
    expect(ctx.discord.addMemberRole).not.toHaveBeenCalled();
    expect(ctx.discord.postMessage).not.toHaveBeenCalled();
  });

  it('met en quarantaine un compte trop neuf en mode quarantine', async () => {
    const ctx = makeCtx(
      {
        accountAgeFilter: {
          enabled: true,
          minDays: 60,
          action: 'quarantine',
          quarantineRoleId: QUARANTINE_ROLE,
        },
        autorole: { enabled: true, roleIds: [ROLE], delaySeconds: 0 },
      },
      {
        getUserDisplayInfo: vi.fn().mockResolvedValue({
          username: 'newbie',
          tag: 'newbie',
          avatarUrl: '',
          accountCreatedAt: Date.now() - 5 * 24 * 3600 * 1000,
        }),
      },
    );
    await handleMemberJoin(ctx, joinEvent());
    expect(ctx.discord.addMemberRole).toHaveBeenCalledWith(GUILD, USER, QUARANTINE_ROLE);
    expect(ctx.discord.kickMember).not.toHaveBeenCalled();
    // L'auto-rôle régulier est court-circuité par la quarantaine.
    expect(ctx.discord.addMemberRole).toHaveBeenCalledTimes(1);
  });

  it('poste le message welcome en mode channel', async () => {
    const ctx = makeCtx({
      welcome: {
        enabled: true,
        destination: 'channel',
        channelId: CHANNEL,
        message: 'Bienvenue {user}',
      },
    });
    await handleMemberJoin(ctx, joinEvent());
    expect(ctx.discord.postMessage).toHaveBeenCalled();
    expect(ctx.discord.sendDirectMessage).not.toHaveBeenCalled();
  });

  it("envoie en DM en mode 'dm'", async () => {
    const ctx = makeCtx({
      welcome: {
        enabled: true,
        destination: 'dm',
        channelId: null,
        message: 'Bienvenue {user}',
      },
    });
    await handleMemberJoin(ctx, joinEvent());
    expect(ctx.discord.sendDirectMessage).toHaveBeenCalled();
    expect(ctx.discord.postMessage).not.toHaveBeenCalled();
  });

  it("envoie en channel ET en DM en mode 'both'", async () => {
    const ctx = makeCtx({
      welcome: {
        enabled: true,
        destination: 'both',
        channelId: CHANNEL,
        message: 'Bienvenue {user}',
      },
    });
    await handleMemberJoin(ctx, joinEvent());
    expect(ctx.discord.postMessage).toHaveBeenCalled();
    expect(ctx.discord.sendDirectMessage).toHaveBeenCalled();
  });
});

describe('handleMemberLeave', () => {
  it('poste le message goodbye dans le salon configuré', async () => {
    const ctx = makeCtx({
      goodbye: { enabled: true, channelId: CHANNEL, message: '{user.tag} est parti.' },
    });
    await handleMemberLeave(ctx, leaveEvent());
    expect(ctx.discord.postMessage).toHaveBeenCalled();
  });

  it('ne fait rien si goodbye désactivé', async () => {
    const ctx = makeCtx({});
    await handleMemberLeave(ctx, leaveEvent());
    expect(ctx.discord.postMessage).not.toHaveBeenCalled();
  });
});
