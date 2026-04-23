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

// Empêche le linter de se plaindre de vi non utilisé si aucun mock inline.
void vi;
