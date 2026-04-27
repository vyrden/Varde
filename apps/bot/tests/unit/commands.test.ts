import {
  type ChannelId,
  type CommandInteractionInput,
  type GuildId,
  type ModuleContext,
  ModuleError,
  type ModuleId,
  type PermissionId,
  type UserId,
} from '@varde/contracts';
import { createUIService, type ModuleRef } from '@varde/core';
import { describe, expect, it, vi } from 'vitest';

import {
  type CommandCtxFactory,
  type CommandPermissionsPort,
  createCommandRegistry,
  routeCommandInteraction,
} from '../../src/commands.js';

const GUILD: GuildId = '111' as GuildId;
const USER: UserId = '42' as UserId;
const CHANNEL: ChannelId = '222' as ChannelId;
const HELLO: ModuleId = 'hello-world' as ModuleId;
const MODERATION: ModuleId = 'moderation' as ModuleId;

const refFor = (id: ModuleId): ModuleRef => ({ id, version: '1.0.0' });

const stubCtx = (ref: ModuleRef): ModuleContext =>
  ({
    module: { id: ref.id, version: ref.version },
    ui: createUIService(),
  }) as unknown as ModuleContext;

const stubCtxFactory: CommandCtxFactory = (ref) => stubCtx(ref);

const baseInput = (commandName: string): CommandInteractionInput => ({
  commandName,
  guildId: GUILD,
  channelId: CHANNEL,
  userId: USER,
  options: {},
  resolved: { users: {}, roles: {}, channels: {} },
});

describe('createCommandRegistry', () => {
  it('enregistre et résout les commandes déclarées par un module', () => {
    const ui = createUIService();
    const registry = createCommandRegistry();
    registry.register(refFor(HELLO), {
      ping: {
        name: 'ping',
        description: 'Ping !',
        handler: () => ui.success('pong'),
      },
    });
    expect(registry.resolve('ping')?.moduleRef.id).toBe(HELLO);
    expect(registry.resolve('pong')).toBeNull();
  });

  it('refuse un nom de commande déjà pris par un autre module', () => {
    const ui = createUIService();
    const registry = createCommandRegistry();
    registry.register(refFor(HELLO), {
      ping: { name: 'ping', description: 'a', handler: () => ui.success('ok') },
    });
    expect(() =>
      registry.register(refFor(MODERATION), {
        ping: { name: 'ping', description: 'b', handler: () => ui.success('ok') },
      }),
    ).toThrow(ModuleError);
  });

  it('re-registre du même module remplace ses commandes précédentes', () => {
    const ui = createUIService();
    const registry = createCommandRegistry();
    registry.register(refFor(HELLO), {
      ping: { name: 'ping', description: 'a', handler: () => ui.success('v1') },
    });
    registry.register(refFor(HELLO), {
      pong: { name: 'pong', description: 'b', handler: () => ui.success('v2') },
    });
    expect(registry.resolve('ping')).toBeNull();
    expect(registry.resolve('pong')?.command.description).toBe('b');
  });

  it('unregister retire toutes les commandes du module', () => {
    const ui = createUIService();
    const registry = createCommandRegistry();
    registry.register(refFor(HELLO), {
      ping: { name: 'ping', description: 'a', handler: () => ui.success('ok') },
      pong: { name: 'pong', description: 'b', handler: () => ui.success('ok') },
    });
    registry.unregister(HELLO);
    expect(registry.list()).toHaveLength(0);
  });

  it('list() renvoie les commandes triées par nom', () => {
    const ui = createUIService();
    const registry = createCommandRegistry();
    registry.register(refFor(HELLO), {
      zeta: { name: 'zeta', description: 'z', handler: () => ui.success('z') },
      alpha: { name: 'alpha', description: 'a', handler: () => ui.success('a') },
    });
    expect(registry.list().map((c) => c.command.name)).toEqual(['alpha', 'zeta']);
  });
});

describe('routeCommandInteraction', () => {
  it('retourne un UIMessage d erreur figé pour une commande inconnue', async () => {
    const registry = createCommandRegistry();
    const message = await routeCommandInteraction(baseInput('ghost'), {
      registry,
      ctxFactory: stubCtxFactory,
    });
    expect(message.kind).toBe('error');
  });

  it('invoque le handler avec (input, ctx) et retourne son UIMessage', async () => {
    const registry = createCommandRegistry();
    const handler = vi.fn((_input: CommandInteractionInput, ctx: ModuleContext) =>
      ctx.ui.success('pong'),
    );
    registry.register(refFor(HELLO), {
      ping: { name: 'ping', description: 'Ping', handler },
    });
    const ui = createUIService();
    const message = await routeCommandInteraction(baseInput('ping'), {
      registry,
      ctxFactory: stubCtxFactory,
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(message).toEqual(ui.success('pong'));
  });

  it('vérifie defaultPermission si déclarée et refuse sinon', async () => {
    const registry = createCommandRegistry();
    registry.register(refFor(MODERATION), {
      ban: {
        name: 'ban',
        description: 'Ban un user',
        defaultPermission: 'moderation.ban' as PermissionId,
        handler: (_i, ctx) => ctx.ui.success('banni'),
      },
    });
    const permissions: CommandPermissionsPort = {
      canInGuild: async () => false,
    };
    const message = await routeCommandInteraction(baseInput('ban'), {
      registry,
      ctxFactory: stubCtxFactory,
      permissions,
    });
    expect(message.kind).toBe('error');
  });

  it('autorise quand canInGuild retourne true', async () => {
    const registry = createCommandRegistry();
    const handler = vi.fn((_i: CommandInteractionInput, ctx: ModuleContext) =>
      ctx.ui.success('banni'),
    );
    registry.register(refFor(MODERATION), {
      ban: {
        name: 'ban',
        description: 'Ban un user',
        defaultPermission: 'moderation.ban' as PermissionId,
        handler,
      },
    });
    const permissions: CommandPermissionsPort = {
      canInGuild: async () => true,
    };
    const ui = createUIService();
    const message = await routeCommandInteraction(baseInput('ban'), {
      registry,
      ctxFactory: stubCtxFactory,
      permissions,
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(message).toEqual(ui.success('banni'));
  });

  it("lève ModuleError si le handler renvoie autre chose qu'un UIMessage", async () => {
    const registry = createCommandRegistry();
    registry.register(refFor(HELLO), {
      ping: {
        name: 'ping',
        description: 'Ping',
        // biome-ignore lint/suspicious/noExplicitAny: test délibéré d'un retour invalide
        handler: (() => ({ kind: 'success', payload: { message: 'forgé' } })) as any,
      },
    });
    await expect(
      routeCommandInteraction(baseInput('ping'), {
        registry,
        ctxFactory: stubCtxFactory,
      }),
    ).rejects.toBeInstanceOf(ModuleError);
  });

  it("refuse via enablementCheck si le module n'est pas activé pour la guild", async () => {
    const registry = createCommandRegistry();
    const handler = vi.fn();
    registry.register(refFor(HELLO), {
      ping: { name: 'ping', description: 'Ping', handler: handler as never },
    });
    const message = await routeCommandInteraction(baseInput('ping'), {
      registry,
      ctxFactory: stubCtxFactory,
      enablementCheck: { isEnabled: () => false },
    });
    expect(message.kind).toBe('error');
    expect(handler).not.toHaveBeenCalled();
  });

  it('autorise via enablementCheck si le module est activé', async () => {
    const registry = createCommandRegistry();
    const handler = vi.fn((_input: CommandInteractionInput, ctx: ModuleContext) =>
      ctx.ui.success('pong'),
    );
    registry.register(refFor(HELLO), {
      ping: { name: 'ping', description: 'Ping', handler },
    });
    const message = await routeCommandInteraction(baseInput('ping'), {
      registry,
      ctxFactory: stubCtxFactory,
      enablementCheck: { isEnabled: () => true },
    });
    expect(message.kind).toBe('success');
    expect(handler).toHaveBeenCalled();
  });
});
