import type {
  ChannelId,
  CommandInteractionInput,
  CoreEvent,
  GuildId,
  ModuleContext,
  UserId,
} from '@varde/contracts';
import type { ModuleRef } from '@varde/core';
import { createEventBus, createLogger, createUIService } from '@varde/core';
import { describe, expect, it, vi } from 'vitest';

import { type CommandCtxFactory, createCommandRegistry } from '../../src/commands.js';
import { createDispatcher } from '../../src/dispatcher.js';

const GUILD: GuildId = '111' as GuildId;
const CHANNEL: ChannelId = '222' as ChannelId;
const USER: UserId = '42' as UserId;

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

const stubCtxFactory: CommandCtxFactory = (ref: ModuleRef) =>
  ({
    module: { id: ref.id, version: ref.version },
    ui: createUIService(),
  }) as unknown as ModuleContext;

const baseInteraction = (commandName: string): CommandInteractionInput => ({
  commandName,
  guildId: GUILD,
  channelId: CHANNEL,
  userId: USER,
  options: {},
});

describe('createDispatcher — dispatchEvent', () => {
  it('traduit un événement Discord et l émet sur l EventBus', async () => {
    const logger = silentLogger();
    const eventBus = createEventBus({ logger });
    const received: CoreEvent[] = [];
    eventBus.onAny(async (event) => {
      received.push(event);
    });
    const dispatcher = createDispatcher({
      eventBus,
      commandRegistry: createCommandRegistry(),
      ctxFactory: stubCtxFactory,
      logger,
    });
    await dispatcher.dispatchEvent({
      kind: 'guildMemberAdd',
      guildId: '111',
      userId: '42',
      joinedAt: 1_700_000_000_000,
    });
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      type: 'guild.memberJoin',
      guildId: '111',
      userId: '42',
    });
  });

  it('absorbe une exception du bus sans la rethrow', async () => {
    const logger = silentLogger();
    const eventBus = createEventBus({ logger });
    eventBus.onAny(async () => {
      throw new Error('handler cassé');
    });
    const dispatcher = createDispatcher({
      eventBus,
      commandRegistry: createCommandRegistry(),
      ctxFactory: stubCtxFactory,
      logger,
    });
    await expect(
      dispatcher.dispatchEvent({
        kind: 'guildMemberAdd',
        guildId: '111',
        userId: '42',
        joinedAt: 1,
      }),
    ).resolves.toBeUndefined();
  });
});

describe('createDispatcher — dispatchCommand', () => {
  it('retourne ui.error() si la commande est inconnue', async () => {
    const logger = silentLogger();
    const dispatcher = createDispatcher({
      eventBus: createEventBus({ logger }),
      commandRegistry: createCommandRegistry(),
      ctxFactory: stubCtxFactory,
      logger,
    });
    const reply = await dispatcher.dispatchCommand(baseInteraction('inconnue'));
    expect(reply.kind).toBe('error');
  });

  it('route vers le handler du module et renvoie son UIMessage', async () => {
    const logger = silentLogger();
    const ui = createUIService();
    const registry = createCommandRegistry();
    const handler = vi.fn((_i: CommandInteractionInput, ctx: ModuleContext) =>
      ctx.ui.success('pong'),
    );
    registry.register(
      { id: 'hello-world' as never, version: '1.0.0' },
      {
        ping: { name: 'ping', description: 'ping', handler },
      },
    );
    const dispatcher = createDispatcher({
      eventBus: createEventBus({ logger }),
      commandRegistry: registry,
      ctxFactory: stubCtxFactory,
      logger,
    });
    const reply = await dispatcher.dispatchCommand(baseInteraction('ping'));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(reply).toEqual(ui.success('pong'));
  });
});
