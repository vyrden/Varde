import type {
  GuildMessageReactionAddEvent,
  GuildMessageReactionRemoveEvent,
  ModuleContext,
} from '@varde/contracts';
import { describe, expect, it, vi } from 'vitest';

import { handleReactionAdd, handleReactionRemove } from '../../src/runtime.js';
import { createSelfCausedTracker } from '../../src/self-caused.js';

const GUILD = '111111111111111111' as never;
const CHANNEL = '222222222222222222' as never;
const MESSAGE = '333333333333333333' as never;
const USER = '444444444444444444' as never;
const ROLE_EU = '555555555555555555' as never;
const ROLE_AS = '666666666666666666' as never;

const makeCtx = (configForGuild: unknown): ModuleContext => {
  return {
    logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
    config: { get: vi.fn().mockResolvedValue({ modules: { 'reaction-roles': configForGuild } }) },
    discord: {
      addMemberRole: vi.fn().mockResolvedValue(undefined),
      removeMemberRole: vi.fn().mockResolvedValue(undefined),
      memberHasRole: vi.fn().mockResolvedValue(false),
      removeUserReaction: vi.fn().mockResolvedValue(undefined),
      sendDirectMessage: vi.fn().mockResolvedValue(true),
      getGuildName: vi.fn().mockReturnValue('Test Guild'),
      getRoleName: vi.fn().mockReturnValue('Test Role'),
      kickMember: vi.fn().mockResolvedValue(undefined),
      getMemberCount: vi.fn().mockReturnValue(100),
      getUserDisplayInfo: vi.fn().mockResolvedValue(null),
    },
    audit: { log: vi.fn().mockResolvedValue(undefined) },
  } as unknown as ModuleContext;
};

const addEvent = (
  overrides: Partial<GuildMessageReactionAddEvent> = {},
): GuildMessageReactionAddEvent => ({
  type: 'guild.messageReactionAdd',
  guildId: GUILD,
  channelId: CHANNEL,
  messageId: MESSAGE,
  userId: USER,
  emoji: { type: 'unicode', value: '🇪🇺' },
  reactedAt: 1,
  ...overrides,
});

const removeEvent = (
  overrides: Partial<GuildMessageReactionRemoveEvent> = {},
): GuildMessageReactionRemoveEvent => ({
  type: 'guild.messageReactionRemove',
  guildId: GUILD,
  channelId: CHANNEL,
  messageId: MESSAGE,
  userId: USER,
  emoji: { type: 'unicode', value: '🇪🇺' },
  reactedAt: 1,
  ...overrides,
});

const baseMessage = {
  id: '00000000-0000-4000-8000-000000000001',
  label: 'Continents',
  channelId: CHANNEL,
  messageId: MESSAGE,
  mode: 'unique' as const,
  pairs: [
    { emoji: { type: 'unicode' as const, value: '🇪🇺' }, roleId: ROLE_EU },
    { emoji: { type: 'unicode' as const, value: '🌏' }, roleId: ROLE_AS },
  ],
};

const continentsConfig = {
  version: 1,
  messages: [baseMessage],
};

describe('runtime — mode normal', () => {
  const normalCfg = {
    version: 1,
    messages: [{ ...baseMessage, mode: 'normal' as const }],
  };

  it('reactionAdd assigne le rôle', async () => {
    const ctx = makeCtx(normalCfg);
    await handleReactionAdd(ctx, addEvent(), createSelfCausedTracker());
    expect(ctx.discord.addMemberRole).toHaveBeenCalledWith(GUILD, USER, ROLE_EU);
  });

  it('reactionRemove retire le rôle', async () => {
    const ctx = makeCtx(normalCfg);
    await handleReactionRemove(ctx, removeEvent(), createSelfCausedTracker());
    expect(ctx.discord.removeMemberRole).toHaveBeenCalledWith(GUILD, USER, ROLE_EU);
  });
});

describe('runtime — mode verifier', () => {
  const verifierCfg = {
    version: 1,
    messages: [{ ...baseMessage, mode: 'verifier' as const }],
  };

  it('reactionAdd assigne le rôle', async () => {
    const ctx = makeCtx(verifierCfg);
    await handleReactionAdd(ctx, addEvent(), createSelfCausedTracker());
    expect(ctx.discord.addMemberRole).toHaveBeenCalled();
  });

  it('reactionRemove retire le rôle (symétrie sur tous les modes)', async () => {
    const ctx = makeCtx(verifierCfg);
    await handleReactionRemove(ctx, removeEvent(), createSelfCausedTracker());
    expect(ctx.discord.removeMemberRole).toHaveBeenCalledWith(GUILD, USER, ROLE_EU);
  });
});

describe('runtime — mode unique', () => {
  it('reactionAdd sur nouvelle paire retire le rôle précédent + enlève la réaction + track self-caused', async () => {
    const ctx = makeCtx(continentsConfig);
    (ctx.discord.memberHasRole as ReturnType<typeof vi.fn>).mockImplementation(
      async (_g: unknown, _u: unknown, r: unknown) => r === ROLE_AS,
    );
    const tracker = createSelfCausedTracker();

    await handleReactionAdd(ctx, addEvent(), tracker);

    expect(ctx.discord.addMemberRole).toHaveBeenCalledWith(GUILD, USER, ROLE_EU);
    expect(ctx.discord.removeMemberRole).toHaveBeenCalledWith(GUILD, USER, ROLE_AS);
    expect(ctx.discord.removeUserReaction).toHaveBeenCalledWith(CHANNEL, MESSAGE, USER, {
      type: 'unicode',
      value: '🌏',
    });
    expect(tracker.size()).toBe(1);
  });

  it("reactionAdd sans autre rôle dans le set n'appelle pas removeMemberRole", async () => {
    const ctx = makeCtx(continentsConfig);
    const tracker = createSelfCausedTracker();
    await handleReactionAdd(ctx, addEvent(), tracker);
    expect(ctx.discord.removeMemberRole).not.toHaveBeenCalled();
    expect(ctx.discord.removeUserReaction).not.toHaveBeenCalled();
  });

  it('reactionRemove est ignoré si self-caused', async () => {
    const ctx = makeCtx(continentsConfig);
    const tracker = createSelfCausedTracker();
    tracker.mark(USER, MESSAGE, 'u:🇪🇺');
    await handleReactionRemove(ctx, removeEvent(), tracker);
    expect(ctx.discord.removeMemberRole).not.toHaveBeenCalled();
  });

  it('reactionRemove non-self retire le rôle (symétrie sur tous les modes)', async () => {
    const ctx = makeCtx(continentsConfig);
    await handleReactionRemove(ctx, removeEvent(), createSelfCausedTracker());
    expect(ctx.discord.removeMemberRole).toHaveBeenCalledWith(GUILD, USER, ROLE_EU);
  });

  it('reactionAdd sur le même emoji quand le user a déjà ce rôle (re-clic) : idempotent, aucune suppression', async () => {
    const ctx = makeCtx(continentsConfig);
    // Le user a déjà le rôle Europe (la paire qu'on re-clique)
    (ctx.discord.memberHasRole as ReturnType<typeof vi.fn>).mockImplementation(
      async (_g: unknown, _u: unknown, r: unknown) => r === ROLE_EU,
    );
    const tracker = createSelfCausedTracker();

    await handleReactionAdd(ctx, addEvent(), tracker);

    // addMemberRole appelé idempotent (même rôle)
    expect(ctx.discord.addMemberRole).toHaveBeenCalledWith(GUILD, USER, ROLE_EU);
    // Mais PAS d'unassign ni de removeUserReaction sur la même paire
    expect(ctx.discord.removeMemberRole).not.toHaveBeenCalled();
    expect(ctx.discord.removeUserReaction).not.toHaveBeenCalled();
    expect(tracker.size()).toBe(0);
  });
});

describe('runtime — no match', () => {
  it('event sur un message non-configuré est silent skip', async () => {
    const ctx = makeCtx(continentsConfig);
    const otherMessage = { ...addEvent(), messageId: '999999999999999999' as never };
    await handleReactionAdd(ctx, otherMessage, createSelfCausedTracker());
    expect(ctx.discord.addMemberRole).not.toHaveBeenCalled();
  });

  it('event avec emoji non-configuré est silent skip', async () => {
    const ctx = makeCtx(continentsConfig);
    const otherEmoji = { ...addEvent(), emoji: { type: 'unicode' as const, value: '❌' } };
    await handleReactionAdd(ctx, otherEmoji, createSelfCausedTracker());
    expect(ctx.discord.addMemberRole).not.toHaveBeenCalled();
  });
});
