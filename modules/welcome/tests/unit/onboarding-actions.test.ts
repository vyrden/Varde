import type { OnboardingActionContext } from '@varde/contracts';
import { describe, expect, it, vi } from 'vitest';

import { setWelcomeAutoroleAction, setWelcomeChannelAction } from '../../src/onboarding-actions.js';

const GUILD = '111111111111111111' as never;
const ACTOR = '222222222222222222' as never;

const makeCtx = (
  resolveLocalIdImpl: (id: string) => string | null = () => null,
): OnboardingActionContext => {
  return {
    guildId: GUILD,
    actorId: ACTOR,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    discord: {
      createChannel: vi.fn().mockResolvedValue({ id: '999999999999999999' }),
      deleteChannel: vi.fn().mockResolvedValue(undefined),
      createRole: vi.fn().mockResolvedValue({ id: '888888888888888888' }),
      deleteRole: vi.fn().mockResolvedValue(undefined),
      createCategory: vi.fn(),
      deleteCategory: vi.fn(),
    },
    configPatch: vi.fn().mockResolvedValue(undefined),
    resolveLocalId: vi.fn().mockImplementation(resolveLocalIdImpl),
    permissions: { bind: vi.fn(), unbind: vi.fn() },
  };
};

describe('welcome.set-channel', () => {
  it('utilise channelId quand fourni directement', async () => {
    const ctx = makeCtx();
    const result = await setWelcomeChannelAction.apply(ctx, {
      target: 'welcome',
      channelId: '123456789012345678',
      delaySeconds: 0,
    } as never);
    expect(result.channelId).toBe('123456789012345678');
    expect(result.createdChannelId).toBeNull();
    expect(ctx.discord.createChannel).not.toHaveBeenCalled();
    expect(ctx.configPatch).toHaveBeenCalledWith({
      modules: {
        welcome: {
          welcome: { enabled: true, channelId: '123456789012345678' },
        },
      },
    });
  });

  it('résout channelLocalId via resolveLocalId', async () => {
    const ctx = makeCtx((id) => (id === 'chan-welcome' ? '777777777777777777' : null));
    const result = await setWelcomeChannelAction.apply(ctx, {
      target: 'welcome',
      channelLocalId: 'chan-welcome',
    } as never);
    expect(result.channelId).toBe('777777777777777777');
    expect(result.createdChannelId).toBeNull();
  });

  it('jette une erreur si channelLocalId introuvable', async () => {
    const ctx = makeCtx(() => null);
    await expect(
      setWelcomeChannelAction.apply(ctx, {
        target: 'welcome',
        channelLocalId: 'unknown',
      } as never),
    ).rejects.toThrow(/introuvable/);
  });

  it("crée un salon en mode createChannel et marque l'undo", async () => {
    const ctx = makeCtx();
    const result = await setWelcomeChannelAction.apply(ctx, {
      target: 'goodbye',
      createChannel: { name: 'au-revoir' },
    } as never);
    expect(result.createdChannelId).toBe('999999999999999999');
    expect(ctx.discord.createChannel).toHaveBeenCalledWith({
      name: 'au-revoir',
      type: 'text',
    });

    // Undo : seul le createdChannelId doit déclencher deleteChannel.
    await setWelcomeChannelAction.undo(ctx, {} as never, result);
    expect(ctx.discord.deleteChannel).toHaveBeenCalledWith('999999999999999999');
  });

  it('undo no-op quand createdChannelId est null', async () => {
    const ctx = makeCtx();
    await setWelcomeChannelAction.undo(ctx, {} as never, {
      channelId: '111',
      createdChannelId: null,
    });
    expect(ctx.discord.deleteChannel).not.toHaveBeenCalled();
  });
});

describe('welcome.set-autorole', () => {
  it('crée un rôle en mode createRole et patche la config', async () => {
    const ctx = makeCtx();
    const result = await setWelcomeAutoroleAction.apply(ctx, {
      createRole: { name: 'Member', mentionable: true },
      delaySeconds: 60,
    } as never);
    expect(result.createdRoleId).toBe('888888888888888888');
    expect(ctx.configPatch).toHaveBeenCalledWith({
      modules: {
        welcome: {
          autorole: {
            enabled: true,
            roleIds: ['888888888888888888'],
            delaySeconds: 60,
          },
        },
      },
    });
  });

  it('résout roleLocalId', async () => {
    const ctx = makeCtx((id) => (id === 'role-member' ? '666666666666666666' : null));
    const result = await setWelcomeAutoroleAction.apply(ctx, {
      roleLocalId: 'role-member',
      delaySeconds: 0,
    } as never);
    expect(result.roleId).toBe('666666666666666666');
    expect(result.createdRoleId).toBeNull();
  });
});
