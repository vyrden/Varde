import type { Logger } from '@varde/contracts';
import type { Client } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { attachDiscordClient } from '../../src/client-adapter.js';
import type { BotDispatcher } from '../../src/dispatcher.js';

type Handler = (...args: unknown[]) => void;

interface FakeClient {
  readonly handlers: Map<string, Handler>;
  readonly client: Client;
  trigger(event: string, ...args: unknown[]): void;
}

const makeFakeClient = (): FakeClient => {
  const handlers = new Map<string, Handler>();
  const client = {
    on(event: string, handler: Handler) {
      handlers.set(event, handler);
    },
    off() {
      /* no-op pour tests */
    },
  } as unknown as Client;
  return {
    handlers,
    client,
    trigger(event, ...args) {
      handlers.get(event)?.(...args);
    },
  };
};

const makeSilentLogger = (): Logger => {
  const noop = () => {};
  const logger: Logger = {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => logger,
  };
  return logger;
};

const makeFakeDispatcher = (): BotDispatcher & { readonly calls: unknown[] } => {
  const calls: unknown[] = [];
  return {
    calls,
    async dispatchEvent(input) {
      calls.push(input);
    },
    async dispatchCommand() {
      return { kind: 'success', payload: { message: '' } };
    },
  } as BotDispatcher & { readonly calls: unknown[] };
};

describe('attachDiscordClient — channelUpdate', () => {
  it('extrait les diffs name/topic/position/parent depuis oldChannel et newChannel', async () => {
    const fake = makeFakeClient();
    const dispatcher = makeFakeDispatcher();
    attachDiscordClient(fake.client, dispatcher, makeSilentLogger());

    const oldChannel = {
      id: '222',
      guildId: '111',
      name: 'général',
      position: 0,
      parentId: null,
      topic: 'Discussions',
    };
    const newChannel = {
      id: '222',
      guildId: '111',
      name: 'général-archive',
      position: 5,
      parentId: '333',
      topic: null,
    };
    fake.trigger('channelUpdate', oldChannel, newChannel);
    // dispatchEvent est async mais ici c'est synchrone côté adapter (void).
    await Promise.resolve();

    expect(dispatcher.calls).toHaveLength(1);
    expect(dispatcher.calls[0]).toMatchObject({
      kind: 'channelUpdate',
      guildId: '111',
      channelId: '222',
      nameBefore: 'général',
      nameAfter: 'général-archive',
      topicBefore: 'Discussions',
      topicAfter: null,
      positionBefore: 0,
      positionAfter: 5,
      parentIdBefore: null,
      parentIdAfter: '333',
    });
  });

  it('tolère un oldChannel sans topic (salon non textuel) : topicBefore et topicAfter à null', () => {
    const fake = makeFakeClient();
    const dispatcher = makeFakeDispatcher();
    attachDiscordClient(fake.client, dispatcher, makeSilentLogger());

    const oldChannel = {
      id: '222',
      guildId: '111',
      name: 'Voice Lobby',
      position: 2,
      parentId: null,
    };
    const newChannel = {
      id: '222',
      guildId: '111',
      name: 'Voice Lounge',
      position: 2,
      parentId: null,
    };
    fake.trigger('channelUpdate', oldChannel, newChannel);

    expect(dispatcher.calls).toHaveLength(1);
    expect(dispatcher.calls[0]).toMatchObject({
      kind: 'channelUpdate',
      topicBefore: null,
      topicAfter: null,
      nameBefore: 'Voice Lobby',
      nameAfter: 'Voice Lounge',
    });
  });

  it('ignore un channelUpdate sans guildId (DM — ne devrait pas arriver en prod)', () => {
    const fake = makeFakeClient();
    const dispatcher = makeFakeDispatcher();
    attachDiscordClient(fake.client, dispatcher, makeSilentLogger());

    fake.trigger(
      'channelUpdate',
      { id: '1', name: 'old' },
      { id: '1', name: 'new' }, // pas de guildId
    );

    expect(dispatcher.calls).toHaveLength(0);
  });
});

describe('attachDiscordClient — roleUpdate', () => {
  const makeRole = (overrides: Record<string, unknown>) => ({
    id: 'r1',
    guild: { id: '111' },
    name: 'Membre',
    color: 0,
    hoist: false,
    mentionable: false,
    permissions: { bitfield: 0n },
    ...overrides,
  });

  it('extrait les diffs name/color/hoist/mentionable/permissions', () => {
    const fake = makeFakeClient();
    const dispatcher = makeFakeDispatcher();
    attachDiscordClient(fake.client, dispatcher, makeSilentLogger());

    const oldRole = makeRole({ name: 'Membre', permissions: { bitfield: 0n } });
    const newRole = makeRole({
      name: 'Membre Vérifié',
      color: 0xff0000,
      hoist: true,
      mentionable: true,
      permissions: { bitfield: 8n },
    });
    fake.trigger('roleUpdate', oldRole, newRole);

    expect(dispatcher.calls).toHaveLength(1);
    expect(dispatcher.calls[0]).toMatchObject({
      kind: 'roleUpdate',
      guildId: '111',
      roleId: 'r1',
      nameBefore: 'Membre',
      nameAfter: 'Membre Vérifié',
      colorBefore: 0,
      colorAfter: 0xff0000,
      hoistBefore: false,
      hoistAfter: true,
      mentionableBefore: false,
      mentionableAfter: true,
      permissionsBefore: '0',
      permissionsAfter: '8',
    });
  });

  it('preserve le bitfield permissions en string (pas de conversion en number)', () => {
    const fake = makeFakeClient();
    const dispatcher = makeFakeDispatcher();
    attachDiscordClient(fake.client, dispatcher, makeSilentLogger());

    const oldRole = makeRole({ permissions: { bitfield: 0n } });
    const newRole = makeRole({ permissions: { bitfield: 1099511627775n } });
    fake.trigger('roleUpdate', oldRole, newRole);

    expect(dispatcher.calls[0]).toMatchObject({ permissionsAfter: '1099511627775' });
  });
});

describe('attachDiscordClient — events minimaux (régression)', () => {
  it('channelCreate et channelDelete restent sur le helper minimal', () => {
    const fake = makeFakeClient();
    const dispatcher = makeFakeDispatcher();
    attachDiscordClient(fake.client, dispatcher, makeSilentLogger());

    fake.trigger('channelCreate', { id: '222', guildId: '111' });
    fake.trigger('channelDelete', { id: '222', guildId: '111' });

    expect(dispatcher.calls).toHaveLength(2);
    expect(dispatcher.calls[0]).toMatchObject({ kind: 'channelCreate', channelId: '222' });
    expect(dispatcher.calls[1]).toMatchObject({ kind: 'channelDelete', channelId: '222' });
  });

  it('roleCreate et roleDelete restent sur le helper minimal', () => {
    const fake = makeFakeClient();
    const dispatcher = makeFakeDispatcher();
    attachDiscordClient(fake.client, dispatcher, makeSilentLogger());

    fake.trigger('roleCreate', { id: 'r1', guild: { id: '111' } });
    fake.trigger('roleDelete', { id: 'r1', guild: { id: '111' } });

    expect(dispatcher.calls).toHaveLength(2);
    expect(dispatcher.calls[0]).toMatchObject({ kind: 'roleCreate', roleId: 'r1' });
    expect(dispatcher.calls[1]).toMatchObject({ kind: 'roleDelete', roleId: 'r1' });
  });
});

describe('attachDiscordClient — reactions', () => {
  it('messageReactionAdd propage guildId + emoji unicode', () => {
    const fake = makeFakeClient();
    const dispatcher = makeFakeDispatcher();
    attachDiscordClient(fake.client, dispatcher, makeSilentLogger());
    const reaction = {
      message: { guildId: '111', channelId: '222', id: '333' },
      emoji: { id: null, name: '🎉', animated: false },
    };
    const user = { id: '42' };
    fake.trigger('messageReactionAdd', reaction, user);
    expect(dispatcher.calls).toHaveLength(1);
    expect(dispatcher.calls[0]).toMatchObject({
      kind: 'messageReactionAdd',
      guildId: '111',
      channelId: '222',
      messageId: '333',
      userId: '42',
      emoji: { type: 'unicode', value: '🎉' },
    });
  });

  it('messageReactionAdd avec emoji custom emet type custom', () => {
    const fake = makeFakeClient();
    const dispatcher = makeFakeDispatcher();
    attachDiscordClient(fake.client, dispatcher, makeSilentLogger());
    const reaction = {
      message: { guildId: '111', channelId: '222', id: '333' },
      emoji: { id: '999888777666555444', name: 'rocket', animated: true },
    };
    fake.trigger('messageReactionAdd', reaction, { id: '42' });
    expect(dispatcher.calls[0]).toMatchObject({
      emoji: { type: 'custom', id: '999888777666555444', name: 'rocket', animated: true },
    });
  });

  it('messageReactionAdd sans guildId (DM) est ignoré', () => {
    const fake = makeFakeClient();
    const dispatcher = makeFakeDispatcher();
    attachDiscordClient(fake.client, dispatcher, makeSilentLogger());
    fake.trigger(
      'messageReactionAdd',
      { message: { guildId: null, channelId: '1', id: '2' }, emoji: { id: null, name: '🎉' } },
      { id: '42' },
    );
    expect(dispatcher.calls).toHaveLength(0);
  });
});

describe('attachDiscordClient — interactionCreate (resolved)', () => {
  /**
   * Construit une fausse `ChatInputCommandInteraction`. Discord.js v14
   * expose `options.resolved` sous forme de `Collection<Snowflake, T>` ;
   * on simule via un `Map` qui implémente `forEach` + iteration, ce
   * dont `extractResolved` a besoin. `data` mime
   * `interaction.options.data` pour `extractCommandOptions`.
   */
  const makeFakeInteraction = (
    resolved: {
      users?: Map<string, unknown>;
      members?: Map<string, unknown>;
      roles?: Map<string, unknown>;
      channels?: Map<string, unknown>;
    },
    data: ReadonlyArray<{ name: string; value?: string | number | boolean }> = [],
  ) => ({
    isChatInputCommand: () => true,
    inGuild: () => true,
    guildId: '111',
    channelId: '222',
    user: { id: '42' },
    commandName: 'warn',
    options: { resolved, data },
    replied: false,
    reply: vi.fn().mockResolvedValue(undefined),
    deferred: false,
    followUp: vi.fn().mockResolvedValue(undefined),
  });

  it('peuple resolved.users avec tag + displayName + isBot', async () => {
    const fake = makeFakeClient();
    const dispatchCommand = vi
      .fn()
      .mockResolvedValue({ kind: 'success', payload: { message: '' } });
    const dispatcher = {
      dispatchEvent: vi.fn(),
      dispatchCommand,
    } as unknown as BotDispatcher;
    attachDiscordClient(fake.client, dispatcher, makeSilentLogger());

    const interaction = makeFakeInteraction({
      users: new Map([
        [
          '42',
          {
            tag: 'foo#0',
            username: 'foo',
            globalName: 'Foo Bar',
            bot: false,
          },
        ],
      ]),
      members: new Map([['42', { displayName: 'Fooschmoo' }]]),
    });
    fake.trigger('interactionCreate', interaction);
    await Promise.resolve();
    await Promise.resolve();

    expect(dispatchCommand).toHaveBeenCalledTimes(1);
    const input = dispatchCommand.mock.calls[0]?.[0] as {
      resolved: { users: Record<string, { tag: string; displayName: string; isBot: boolean }> };
    };
    expect(input.resolved.users['42']).toEqual({
      id: '42',
      tag: 'foo#0',
      displayName: 'Fooschmoo',
      isBot: false,
    });
  });

  it('displayName cascade : member.displayName > user.globalName > user.username', async () => {
    const fake = makeFakeClient();
    const dispatchCommand = vi
      .fn()
      .mockResolvedValue({ kind: 'success', payload: { message: '' } });
    const dispatcher = {
      dispatchEvent: vi.fn(),
      dispatchCommand,
    } as unknown as BotDispatcher;
    attachDiscordClient(fake.client, dispatcher, makeSilentLogger());

    // Pas de member → fallback sur globalName.
    const interaction = makeFakeInteraction({
      users: new Map([
        ['42', { tag: 'bar#0', username: 'bar', globalName: 'Bar Baz', bot: false }],
      ]),
    });
    fake.trigger('interactionCreate', interaction);
    await Promise.resolve();
    await Promise.resolve();

    const input = dispatchCommand.mock.calls[0]?.[0] as {
      resolved: { users: Record<string, { displayName: string }> };
    };
    expect(input.resolved.users['42']?.displayName).toBe('Bar Baz');
  });

  it('peuple resolved.roles avec name + position', async () => {
    const fake = makeFakeClient();
    const dispatchCommand = vi
      .fn()
      .mockResolvedValue({ kind: 'success', payload: { message: '' } });
    const dispatcher = {
      dispatchEvent: vi.fn(),
      dispatchCommand,
    } as unknown as BotDispatcher;
    attachDiscordClient(fake.client, dispatcher, makeSilentLogger());

    const interaction = makeFakeInteraction({
      roles: new Map([['r1', { name: 'Modo', position: 12 }]]),
    });
    fake.trigger('interactionCreate', interaction);
    await Promise.resolve();
    await Promise.resolve();

    const input = dispatchCommand.mock.calls[0]?.[0] as {
      resolved: { roles: Record<string, { id: string; name: string; position: number }> };
    };
    expect(input.resolved.roles['r1']).toEqual({ id: 'r1', name: 'Modo', position: 12 });
  });

  it('peuple resolved.channels avec name + type', async () => {
    const fake = makeFakeClient();
    const dispatchCommand = vi
      .fn()
      .mockResolvedValue({ kind: 'success', payload: { message: '' } });
    const dispatcher = {
      dispatchEvent: vi.fn(),
      dispatchCommand,
    } as unknown as BotDispatcher;
    attachDiscordClient(fake.client, dispatcher, makeSilentLogger());

    const interaction = makeFakeInteraction({
      channels: new Map([['c1', { name: 'général', type: 0 }]]),
    });
    fake.trigger('interactionCreate', interaction);
    await Promise.resolve();
    await Promise.resolve();

    const input = dispatchCommand.mock.calls[0]?.[0] as {
      resolved: { channels: Record<string, { id: string; name: string; type: number }> };
    };
    expect(input.resolved.channels['c1']).toEqual({ id: 'c1', name: 'général', type: 0 });
  });

  it('resolved est un objet vide quand options.resolved est absent', async () => {
    const fake = makeFakeClient();
    const dispatchCommand = vi
      .fn()
      .mockResolvedValue({ kind: 'success', payload: { message: '' } });
    const dispatcher = {
      dispatchEvent: vi.fn(),
      dispatchCommand,
    } as unknown as BotDispatcher;
    attachDiscordClient(fake.client, dispatcher, makeSilentLogger());

    const interaction = {
      isChatInputCommand: () => true,
      inGuild: () => true,
      guildId: '111',
      channelId: '222',
      user: { id: '42' },
      commandName: 'ping',
      options: { data: [] }, // pas de resolved
      replied: false,
      reply: vi.fn().mockResolvedValue(undefined),
    };
    fake.trigger('interactionCreate', interaction);
    await Promise.resolve();
    await Promise.resolve();

    const input = dispatchCommand.mock.calls[0]?.[0] as {
      resolved: {
        users: Record<string, unknown>;
        roles: Record<string, unknown>;
        channels: Record<string, unknown>;
      };
    };
    expect(input.resolved).toEqual({ users: {}, roles: {}, channels: {} });
  });
});

describe('attachDiscordClient — interactionCreate (options)', () => {
  it('aplatit options.data en Record<name, value> primitives + snowflakes', async () => {
    const fake = makeFakeClient();
    const dispatchCommand = vi
      .fn()
      .mockResolvedValue({ kind: 'success', payload: { message: '' } });
    const dispatcher = {
      dispatchEvent: vi.fn(),
      dispatchCommand,
    } as unknown as BotDispatcher;
    attachDiscordClient(fake.client, dispatcher, makeSilentLogger());

    const interaction = {
      isChatInputCommand: () => true,
      inGuild: () => true,
      guildId: '111',
      channelId: '222',
      user: { id: '42' },
      commandName: 'warn',
      options: {
        resolved: undefined,
        data: [
          { name: 'member', type: 6, value: '999' },
          { name: 'reason', type: 3, value: 'spam' },
          { name: 'count', type: 4, value: 5 },
          { name: 'silent', type: 5, value: true },
        ],
      },
      replied: false,
      reply: vi.fn().mockResolvedValue(undefined),
    };
    fake.trigger('interactionCreate', interaction);
    await Promise.resolve();
    await Promise.resolve();

    const input = dispatchCommand.mock.calls[0]?.[0] as {
      options: Record<string, string | number | boolean>;
    };
    expect(input.options).toEqual({
      member: '999',
      reason: 'spam',
      count: 5,
      silent: true,
    });
  });

  it('ignore les entrées sans value (sub-commands, attachments)', async () => {
    const fake = makeFakeClient();
    const dispatchCommand = vi
      .fn()
      .mockResolvedValue({ kind: 'success', payload: { message: '' } });
    const dispatcher = {
      dispatchEvent: vi.fn(),
      dispatchCommand,
    } as unknown as BotDispatcher;
    attachDiscordClient(fake.client, dispatcher, makeSilentLogger());

    const interaction = {
      isChatInputCommand: () => true,
      inGuild: () => true,
      guildId: '111',
      channelId: '222',
      user: { id: '42' },
      commandName: 'subcmd',
      options: {
        resolved: undefined,
        data: [
          { name: 'mygroup', type: 1 },
          { name: 'real', type: 3, value: 'kept' },
        ],
      },
      replied: false,
      reply: vi.fn().mockResolvedValue(undefined),
    };
    fake.trigger('interactionCreate', interaction);
    await Promise.resolve();
    await Promise.resolve();

    const input = dispatchCommand.mock.calls[0]?.[0] as {
      options: Record<string, unknown>;
    };
    expect(input.options).toEqual({ real: 'kept' });
  });
});

describe('attachDiscordClient — gateway lifecycle (jalon 5 PR 5.9)', () => {
  /**
   * Capture les appels logger pour vérifier que les listeners gateway
   * remontent les incidents avec les bons niveaux et metadata. Sans
   * ces listeners, les erreurs gateway et les disconnects de shard
   * étaient silencieusement avalés par discord.js, sans trace côté
   * audit.
   */
  interface LogCall {
    readonly level: 'info' | 'warn' | 'error';
    readonly message: string;
    readonly error?: Error;
    readonly meta?: Record<string, unknown>;
  }

  const makeRecordingLogger = (calls: LogCall[]): import('@varde/contracts').Logger => {
    const noop = () => {};
    const logger: import('@varde/contracts').Logger = {
      trace: noop,
      debug: noop,
      info: (message, meta) => calls.push({ level: 'info', message, ...(meta ? { meta } : {}) }),
      warn: (message, meta) => calls.push({ level: 'warn', message, ...(meta ? { meta } : {}) }),
      error: (message, error, meta) =>
        calls.push({
          level: 'error',
          message,
          ...(error ? { error } : {}),
          ...(meta ? { meta } : {}),
        }),
      fatal: noop,
      child: () => logger,
    };
    return logger;
  };

  it("loggue 'discord client error' en niveau error sur l'event error", () => {
    const fake = makeFakeClient();
    const dispatcher = makeFakeDispatcher();
    const calls: LogCall[] = [];
    attachDiscordClient(fake.client, dispatcher, makeRecordingLogger(calls));

    const cause = new Error('WS handshake failed');
    fake.trigger('error', cause);

    const entry = calls.find((c) => c.message === 'discord client error');
    expect(entry).toBeDefined();
    expect(entry?.level).toBe('error');
    expect(entry?.error).toBe(cause);
  });

  it("loggue 'discord client warn' en niveau warn avec le message lib", () => {
    const fake = makeFakeClient();
    const dispatcher = makeFakeDispatcher();
    const calls: LogCall[] = [];
    attachDiscordClient(fake.client, dispatcher, makeRecordingLogger(calls));

    fake.trigger('warn', 'Heartbeat ack arrived late');

    const entry = calls.find((c) => c.message === 'discord client warn');
    expect(entry?.level).toBe('warn');
    expect(entry?.meta?.['message']).toBe('Heartbeat ack arrived late');
  });

  it("loggue 'discord shard error' avec le shardId en metadata", () => {
    const fake = makeFakeClient();
    const dispatcher = makeFakeDispatcher();
    const calls: LogCall[] = [];
    attachDiscordClient(fake.client, dispatcher, makeRecordingLogger(calls));

    const cause = new Error('Shard 0 connection refused');
    fake.trigger('shardError', cause, 0);

    const entry = calls.find((c) => c.message === 'discord shard error');
    expect(entry?.level).toBe('error');
    expect(entry?.error).toBe(cause);
    expect(entry?.meta?.['shardId']).toBe(0);
  });

  it("loggue 'discord shard disconnect' avec code+reason+shardId en metadata", () => {
    const fake = makeFakeClient();
    const dispatcher = makeFakeDispatcher();
    const calls: LogCall[] = [];
    attachDiscordClient(fake.client, dispatcher, makeRecordingLogger(calls));

    fake.trigger('shardDisconnect', { code: 4004, reason: 'Authentication failed' }, 0);

    const entry = calls.find((c) => c.message === 'discord shard disconnect');
    expect(entry?.level).toBe('warn');
    expect(entry?.meta?.['shardId']).toBe(0);
    expect(entry?.meta?.['code']).toBe(4004);
    expect(entry?.meta?.['reason']).toBe('Authentication failed');
  });

  it('shardDisconnect sans code/reason structurés met null', () => {
    const fake = makeFakeClient();
    const dispatcher = makeFakeDispatcher();
    const calls: LogCall[] = [];
    attachDiscordClient(fake.client, dispatcher, makeRecordingLogger(calls));

    fake.trigger('shardDisconnect', null, 0);

    const entry = calls.find((c) => c.message === 'discord shard disconnect');
    expect(entry?.meta?.['code']).toBeNull();
    expect(entry?.meta?.['reason']).toBeNull();
  });

  it("loggue 'discord shard reconnecting' en info", () => {
    const fake = makeFakeClient();
    const dispatcher = makeFakeDispatcher();
    const calls: LogCall[] = [];
    attachDiscordClient(fake.client, dispatcher, makeRecordingLogger(calls));

    fake.trigger('shardReconnecting', 1);

    const entry = calls.find((c) => c.message === 'discord shard reconnecting');
    expect(entry?.level).toBe('info');
    expect(entry?.meta?.['shardId']).toBe(1);
  });

  it("loggue 'discord shard ready' en info à la (re)connexion", () => {
    const fake = makeFakeClient();
    const dispatcher = makeFakeDispatcher();
    const calls: LogCall[] = [];
    attachDiscordClient(fake.client, dispatcher, makeRecordingLogger(calls));

    fake.trigger('shardReady', 0);

    const entry = calls.find((c) => c.message === 'discord shard ready');
    expect(entry?.level).toBe('info');
    expect(entry?.meta?.['shardId']).toBe(0);
  });

  it("loggue 'discord shard resume' avec replayedEvents", () => {
    const fake = makeFakeClient();
    const dispatcher = makeFakeDispatcher();
    const calls: LogCall[] = [];
    attachDiscordClient(fake.client, dispatcher, makeRecordingLogger(calls));

    fake.trigger('shardResume', 0, 42);

    const entry = calls.find((c) => c.message === 'discord shard resume');
    expect(entry?.level).toBe('info');
    expect(entry?.meta?.['shardId']).toBe(0);
    expect(entry?.meta?.['replayedEvents']).toBe(42);
  });

  it('shardResume sans replayedEvents numérique met 0 par défaut', () => {
    const fake = makeFakeClient();
    const dispatcher = makeFakeDispatcher();
    const calls: LogCall[] = [];
    attachDiscordClient(fake.client, dispatcher, makeRecordingLogger(calls));

    fake.trigger('shardResume', 0, undefined);

    const entry = calls.find((c) => c.message === 'discord shard resume');
    expect(entry?.meta?.['replayedEvents']).toBe(0);
  });
});

// Empêche le linter de se plaindre de vi non utilisé si aucun mock inline.
void vi;
