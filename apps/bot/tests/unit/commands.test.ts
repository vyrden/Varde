import {
  type ChannelId,
  type CommandInteractionInput,
  defineModule,
  type GuildId,
  ModuleError,
  type ModuleId,
  type PermissionId,
  type UserId,
} from '@varde/contracts';
import { createUIService } from '@varde/core';
import { describe, expect, it, vi } from 'vitest';

import {
  type CommandPermissionsPort,
  createCommandRegistry,
  routeCommandInteraction,
} from '../../src/commands.js';

const GUILD: GuildId = '111' as GuildId;
const USER: UserId = '42' as UserId;
const CHANNEL: ChannelId = '222' as ChannelId;
const HELLO: ModuleId = 'hello-world' as ModuleId;
const MODERATION: ModuleId = 'moderation' as ModuleId;

const baseInput = (commandName: string): CommandInteractionInput => ({
  commandName,
  guildId: GUILD,
  channelId: CHANNEL,
  userId: USER,
  options: {},
});

const manifestFor = (id: string) => ({
  id,
  name: id,
  version: '1.0.0',
  coreVersion: '^1.0.0',
  description: id,
  author: { name: 'X' },
  license: 'Apache-2.0',
  schemaVersion: 1,
  permissions: [],
  events: { listen: [], emit: [] as string[] },
});

describe('createCommandRegistry', () => {
  it('enregistre et résout les commandes déclarées par un module', () => {
    const ui = createUIService();
    const registry = createCommandRegistry();
    const definition = defineModule({
      manifest: manifestFor('hello-world'),
      commands: {
        ping: {
          name: 'ping',
          description: 'Ping !',
          handler: () => ui.success('pong'),
        },
      },
    });
    registry.register(HELLO, definition.commands ?? {});
    expect(registry.resolve('ping')?.moduleId).toBe(HELLO);
    expect(registry.resolve('pong')).toBeNull();
  });

  it('refuse un nom de commande déjà pris par un autre module', () => {
    const ui = createUIService();
    const registry = createCommandRegistry();
    registry.register(HELLO, {
      ping: { name: 'ping', description: 'a', handler: () => ui.success('ok') },
    });
    expect(() =>
      registry.register(MODERATION, {
        ping: { name: 'ping', description: 'b', handler: () => ui.success('ok') },
      }),
    ).toThrow(ModuleError);
  });

  it('re-registre du même module remplace ses commandes précédentes', () => {
    const ui = createUIService();
    const registry = createCommandRegistry();
    registry.register(HELLO, {
      ping: { name: 'ping', description: 'a', handler: () => ui.success('v1') },
    });
    registry.register(HELLO, {
      pong: { name: 'pong', description: 'b', handler: () => ui.success('v2') },
    });
    expect(registry.resolve('ping')).toBeNull();
    expect(registry.resolve('pong')?.command.description).toBe('b');
  });

  it('unregister retire toutes les commandes du module', () => {
    const ui = createUIService();
    const registry = createCommandRegistry();
    registry.register(HELLO, {
      ping: { name: 'ping', description: 'a', handler: () => ui.success('ok') },
      pong: { name: 'pong', description: 'b', handler: () => ui.success('ok') },
    });
    registry.unregister(HELLO);
    expect(registry.list()).toHaveLength(0);
  });

  it('list() renvoie les commandes triées par nom', () => {
    const ui = createUIService();
    const registry = createCommandRegistry();
    registry.register(HELLO, {
      zeta: { name: 'zeta', description: 'z', handler: () => ui.success('z') },
      alpha: { name: 'alpha', description: 'a', handler: () => ui.success('a') },
    });
    expect(registry.list().map((c) => c.command.name)).toEqual(['alpha', 'zeta']);
  });
});

describe('routeCommandInteraction', () => {
  it('retourne ui.error() pour une commande inconnue', async () => {
    const ui = createUIService();
    const registry = createCommandRegistry();
    const message = await routeCommandInteraction(baseInput('ghost'), { registry, ui });
    expect(message.kind).toBe('error');
  });

  it('invoque le handler et retourne le UIMessage produit', async () => {
    const ui = createUIService();
    const registry = createCommandRegistry();
    const handler = vi.fn(() => ui.success('pong'));
    registry.register(HELLO, {
      ping: { name: 'ping', description: 'Ping', handler },
    });
    const message = await routeCommandInteraction(baseInput('ping'), { registry, ui });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(message).toEqual(ui.success('pong'));
  });

  it('vérifie defaultPermission si déclarée et refuse sinon', async () => {
    const ui = createUIService();
    const registry = createCommandRegistry();
    registry.register(MODERATION, {
      ban: {
        name: 'ban',
        description: 'Ban un user',
        defaultPermission: 'moderation.ban' as PermissionId,
        handler: () => ui.success('banni'),
      },
    });
    const permissions: CommandPermissionsPort = {
      canInGuild: async () => false,
    };
    const message = await routeCommandInteraction(baseInput('ban'), {
      registry,
      ui,
      permissions,
    });
    expect(message.kind).toBe('error');
  });

  it('autorise quand canInGuild retourne true', async () => {
    const ui = createUIService();
    const registry = createCommandRegistry();
    const handler = vi.fn(() => ui.success('banni'));
    registry.register(MODERATION, {
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
    const message = await routeCommandInteraction(baseInput('ban'), {
      registry,
      ui,
      permissions,
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(message).toEqual(ui.success('banni'));
  });

  it("lève ModuleError si le handler renvoie autre chose qu'un UIMessage", async () => {
    const ui = createUIService();
    const registry = createCommandRegistry();
    registry.register(HELLO, {
      ping: {
        name: 'ping',
        description: 'Ping',
        // biome-ignore lint/suspicious/noExplicitAny: test délibéré d'un retour invalide
        handler: (() => ({ kind: 'success', payload: { message: 'forgé' } })) as any,
      },
    });
    await expect(
      routeCommandInteraction(baseInput('ping'), { registry, ui }),
    ).rejects.toBeInstanceOf(ModuleError);
  });
});
