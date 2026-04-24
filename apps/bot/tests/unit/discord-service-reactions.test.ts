import type { ChannelId, Emoji, Logger, MessageId, UserId } from '@varde/contracts';
import { describe, expect, it, vi } from 'vitest';
import { type ChannelSender, createDiscordService } from '../../src/discord-service.js';

const noopLogger = (): Logger => ({
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => noopLogger(),
});

const CHANNEL_ID = '222' as ChannelId;
const MESSAGE_ID = '333' as MessageId;
const USER_ID = '42' as UserId;
const BOT_ID = '999' as UserId;

const unicodeEmoji: Emoji = { type: 'unicode', value: '🎉' };
const customEmoji: Emoji = {
  type: 'custom',
  id: '123456789012345678',
  name: 'rocket',
  animated: false,
};

const noopSender: ChannelSender = {
  sendMessage: vi.fn(),
  sendEmbed: vi.fn(),
};

/** Fabrique un fake Message discord.js avec une réaction dans le cache. */
const makeFakeMessage = (reactFn = vi.fn().mockResolvedValue(undefined)) => {
  const reactionsCache = new Map<
    string,
    {
      emoji: { id: string | null; name: string | null };
      users: { remove: ReturnType<typeof vi.fn> };
    }
  >();
  return {
    react: reactFn,
    reactions: { cache: reactionsCache },
    addReactionToCache(
      key: string,
      emojiData: { id: string | null; name: string | null },
      removeFn = vi.fn().mockResolvedValue(undefined),
    ) {
      reactionsCache.set(key, { emoji: emojiData, users: { remove: removeFn } });
      return removeFn;
    },
  };
};

/** Fabrique un fake Client discord.js avec un canal texte en cache. */
const makeFakeClient = (
  messageResult: {
    react: ReturnType<typeof vi.fn>;
    reactions: { cache: Map<string, unknown> };
  } | null = null,
  opts: { botUserId?: string } = {},
) => {
  const fetchFn = messageResult
    ? vi.fn().mockResolvedValue(messageResult)
    : vi.fn().mockRejectedValue(Object.assign(new Error('Unknown Message'), { code: 10008 }));

  const channelsCache = new Map<string, unknown>([[CHANNEL_ID, { messages: { fetch: fetchFn } }]]);

  return {
    channels: { cache: channelsCache },
    user: opts.botUserId ? { id: opts.botUserId } : null,
    fetchFn,
  };
};

describe('createDiscordService — addReaction', () => {
  it('emoji unicode : appelle message.react avec la valeur unicode', async () => {
    const msg = makeFakeMessage();
    const fakeClient = makeFakeClient(msg);

    const svc = createDiscordService({
      sender: noopSender,
      logger: noopLogger(),
      // biome-ignore lint/suspicious/noExplicitAny: fake client dans les tests
      client: fakeClient as any,
    });

    await svc.addReaction(CHANNEL_ID, MESSAGE_ID, unicodeEmoji);

    expect(msg.react).toHaveBeenCalledWith('🎉');
  });

  it('emoji custom : appelle message.react avec name:id', async () => {
    const msg = makeFakeMessage();
    const fakeClient = makeFakeClient(msg);

    const svc = createDiscordService({
      sender: noopSender,
      logger: noopLogger(),
      // biome-ignore lint/suspicious/noExplicitAny: fake client dans les tests
      client: fakeClient as any,
    });

    await svc.addReaction(CHANNEL_ID, MESSAGE_ID, customEmoji);

    expect(msg.react).toHaveBeenCalledWith('rocket:123456789012345678');
  });

  it('throws DiscordSendError(channel-not-found) si le canal est absent du cache', async () => {
    const fakeClient = {
      channels: { cache: new Map() },
      user: null,
    };

    const svc = createDiscordService({
      sender: noopSender,
      logger: noopLogger(),
      // biome-ignore lint/suspicious/noExplicitAny: fake client dans les tests
      client: fakeClient as any,
    });

    await expect(svc.addReaction(CHANNEL_ID, MESSAGE_ID, unicodeEmoji)).rejects.toMatchObject({
      name: 'DiscordSendError',
      reason: 'channel-not-found',
    });
  });

  it('throws DiscordSendError(message-not-found) si le fetch échoue', async () => {
    const fakeClient = makeFakeClient(null); // fetch rejects

    const svc = createDiscordService({
      sender: noopSender,
      logger: noopLogger(),
      // biome-ignore lint/suspicious/noExplicitAny: fake client dans les tests
      client: fakeClient as any,
    });

    await expect(svc.addReaction(CHANNEL_ID, MESSAGE_ID, unicodeEmoji)).rejects.toMatchObject({
      name: 'DiscordSendError',
      reason: 'message-not-found',
    });
  });
});

describe('createDiscordService — removeUserReaction', () => {
  it('appelle reaction.users.remove(userId) quand la réaction existe (unicode)', async () => {
    const msg = makeFakeMessage();
    const removeFn = msg.addReactionToCache('🎉', { id: null, name: '🎉' });
    const fakeClient = makeFakeClient(msg);

    const svc = createDiscordService({
      sender: noopSender,
      logger: noopLogger(),
      // biome-ignore lint/suspicious/noExplicitAny: fake client dans les tests
      client: fakeClient as any,
    });

    await svc.removeUserReaction(CHANNEL_ID, MESSAGE_ID, USER_ID, unicodeEmoji);

    expect(removeFn).toHaveBeenCalledWith(USER_ID);
  });

  it("no-op si la réaction n'est pas dans le cache", async () => {
    const msg = makeFakeMessage();
    // aucune réaction ajoutée au cache
    const fakeClient = makeFakeClient(msg);

    const svc = createDiscordService({
      sender: noopSender,
      logger: noopLogger(),
      // biome-ignore lint/suspicious/noExplicitAny: fake client dans les tests
      client: fakeClient as any,
    });

    await expect(
      svc.removeUserReaction(CHANNEL_ID, MESSAGE_ID, USER_ID, unicodeEmoji),
    ).resolves.toBeUndefined();
  });
});

describe('createDiscordService — removeOwnReaction', () => {
  it('délègue à removeUserReaction avec client.user.id', async () => {
    const msg = makeFakeMessage();
    const removeFn = msg.addReactionToCache('🎉', { id: null, name: '🎉' });
    const fakeClient = makeFakeClient(msg, { botUserId: BOT_ID });

    const svc = createDiscordService({
      sender: noopSender,
      logger: noopLogger(),
      // biome-ignore lint/suspicious/noExplicitAny: fake client dans les tests
      client: fakeClient as any,
    });

    await svc.removeOwnReaction(CHANNEL_ID, MESSAGE_ID, unicodeEmoji);

    expect(removeFn).toHaveBeenCalledWith(BOT_ID);
  });

  it('throws DiscordSendError(unknown) si client.user est null', async () => {
    const msg = makeFakeMessage();
    const fakeClient = makeFakeClient(msg); // botUserId non défini → user: null

    const svc = createDiscordService({
      sender: noopSender,
      logger: noopLogger(),
      // biome-ignore lint/suspicious/noExplicitAny: fake client dans les tests
      client: fakeClient as any,
    });

    await expect(svc.removeOwnReaction(CHANNEL_ID, MESSAGE_ID, unicodeEmoji)).rejects.toMatchObject(
      {
        name: 'DiscordSendError',
        reason: 'unknown',
      },
    );
  });
});
