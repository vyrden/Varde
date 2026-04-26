import {
  type ChannelId,
  DiscordSendError,
  type GuildId,
  type Logger,
  type UserId,
} from '@varde/contracts';
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

const GUILD: GuildId = '111' as GuildId;
const USER: UserId = '42' as UserId;
const CHANNEL: ChannelId = '222' as ChannelId;

const noopSender: ChannelSender = {
  sendMessage: vi.fn(),
  sendEmbed: vi.fn(),
};

/** Fake guild minimaliste pour banMember/unbanMember. */
const makeFakeGuild = (overrides: {
  ban?: ReturnType<typeof vi.fn>;
  unban?: ReturnType<typeof vi.fn>;
}) => ({
  name: 'g',
  members: { ban: overrides.ban ?? vi.fn().mockResolvedValue(undefined) },
  bans: { remove: overrides.unban ?? vi.fn().mockResolvedValue(undefined) },
  roles: { cache: { get: vi.fn() }, create: vi.fn() },
});

/** Fake textChannel pour bulkDelete/setSlowmode. */
const makeFakeChannel = (overrides: {
  bulkDelete?: ReturnType<typeof vi.fn>;
  setRateLimitPerUser?: ReturnType<typeof vi.fn>;
}) => ({
  messages: { fetch: vi.fn() },
  bulkDelete: overrides.bulkDelete,
  setRateLimitPerUser: overrides.setRateLimitPerUser,
});

const makeClient = (opts: {
  guild?: ReturnType<typeof makeFakeGuild>;
  channel?: ReturnType<typeof makeFakeChannel>;
}) => ({
  guilds: { cache: new Map(opts.guild ? [[GUILD, opts.guild]] : []) },
  channels: { cache: new Map(opts.channel ? [[CHANNEL, opts.channel]] : []) },
});

describe('DiscordService.banMember', () => {
  it('appelle guild.members.ban avec deleteMessageSeconds dérivé des jours', async () => {
    const ban = vi.fn().mockResolvedValue(undefined);
    const guild = makeFakeGuild({ ban });
    const svc = createDiscordService({
      sender: noopSender,
      logger: noopLogger(),
      // biome-ignore lint/suspicious/noExplicitAny: fake client de test
      client: makeClient({ guild }) as any,
    });
    await svc.banMember(GUILD, USER, 'spam', 7);
    expect(ban).toHaveBeenCalledWith(USER, { deleteMessageSeconds: 7 * 86400, reason: 'spam' });
  });

  it('omet deleteMessageSeconds quand deleteMessageDays absent', async () => {
    const ban = vi.fn().mockResolvedValue(undefined);
    const guild = makeFakeGuild({ ban });
    const svc = createDiscordService({
      sender: noopSender,
      logger: noopLogger(),
      // biome-ignore lint/suspicious/noExplicitAny: fake client de test
      client: makeClient({ guild }) as any,
    });
    await svc.banMember(GUILD, USER, 'raid');
    expect(ban).toHaveBeenCalledWith(USER, { reason: 'raid' });
  });

  it('jette DiscordSendError(unknown) si la guild n est pas en cache', async () => {
    const svc = createDiscordService({
      sender: noopSender,
      logger: noopLogger(),
      // biome-ignore lint/suspicious/noExplicitAny: fake client de test
      client: makeClient({}) as any,
    });
    await expect(svc.banMember(GUILD, USER)).rejects.toBeInstanceOf(DiscordSendError);
  });

  it('propage missing-permission sur code 50013', async () => {
    const ban = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('Missing Permissions'), { code: 50013 }));
    const guild = makeFakeGuild({ ban });
    const svc = createDiscordService({
      sender: noopSender,
      logger: noopLogger(),
      // biome-ignore lint/suspicious/noExplicitAny: fake client de test
      client: makeClient({ guild }) as any,
    });
    const err = await svc.banMember(GUILD, USER).catch((e: unknown) => e as DiscordSendError);
    expect(err.reason).toBe('missing-permission');
  });
});

describe('DiscordService.unbanMember', () => {
  it('appelle guild.bans.remove avec userId + reason', async () => {
    const unban = vi.fn().mockResolvedValue(undefined);
    const guild = makeFakeGuild({ unban });
    const svc = createDiscordService({
      sender: noopSender,
      logger: noopLogger(),
      // biome-ignore lint/suspicious/noExplicitAny: fake client de test
      client: makeClient({ guild }) as any,
    });
    await svc.unbanMember(GUILD, USER, 'appel accepté');
    expect(unban).toHaveBeenCalledWith(USER, 'appel accepté');
  });

  it('jette DiscordSendError sur erreur Discord', async () => {
    const unban = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('Unknown Ban'), { code: 10026 }));
    const guild = makeFakeGuild({ unban });
    const svc = createDiscordService({
      sender: noopSender,
      logger: noopLogger(),
      // biome-ignore lint/suspicious/noExplicitAny: fake client de test
      client: makeClient({ guild }) as any,
    });
    await expect(svc.unbanMember(GUILD, USER)).rejects.toBeInstanceOf(DiscordSendError);
  });
});

describe('DiscordService.bulkDeleteMessages', () => {
  it('retourne { deleted } correspondant au size de la collection retournée', async () => {
    const bulkDelete = vi.fn().mockResolvedValue({ size: 7 });
    const channel = makeFakeChannel({ bulkDelete });
    const svc = createDiscordService({
      sender: noopSender,
      logger: noopLogger(),
      // biome-ignore lint/suspicious/noExplicitAny: fake client de test
      client: makeClient({ channel }) as any,
    });
    const result = await svc.bulkDeleteMessages(CHANNEL, 10);
    expect(result).toEqual({ deleted: 7 });
    expect(bulkDelete).toHaveBeenCalledWith(10);
  });

  it('jette channel-not-found si le salon n est pas dans le cache', async () => {
    const svc = createDiscordService({
      sender: noopSender,
      logger: noopLogger(),
      // biome-ignore lint/suspicious/noExplicitAny: fake client de test
      client: makeClient({}) as any,
    });
    const err = await svc
      .bulkDeleteMessages(CHANNEL, 5)
      .catch((e: unknown) => e as DiscordSendError);
    expect(err.reason).toBe('channel-not-found');
  });

  it('jette channel-not-found si le salon ne supporte pas bulkDelete', async () => {
    const channel = makeFakeChannel({}); // pas de bulkDelete
    const svc = createDiscordService({
      sender: noopSender,
      logger: noopLogger(),
      // biome-ignore lint/suspicious/noExplicitAny: fake client de test
      client: makeClient({ channel }) as any,
    });
    const err = await svc
      .bulkDeleteMessages(CHANNEL, 5)
      .catch((e: unknown) => e as DiscordSendError);
    expect(err.reason).toBe('channel-not-found');
  });
});

describe('DiscordService.setChannelSlowmode', () => {
  it('appelle channel.setRateLimitPerUser avec le nombre de secondes', async () => {
    const setRate = vi.fn().mockResolvedValue(undefined);
    const channel = makeFakeChannel({ setRateLimitPerUser: setRate });
    const svc = createDiscordService({
      sender: noopSender,
      logger: noopLogger(),
      // biome-ignore lint/suspicious/noExplicitAny: fake client de test
      client: makeClient({ channel }) as any,
    });
    await svc.setChannelSlowmode(CHANNEL, 30);
    expect(setRate).toHaveBeenCalledWith(30);
  });

  it('propage missing-permission sur code 50013', async () => {
    const setRate = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('Missing Permissions'), { code: 50013 }));
    const channel = makeFakeChannel({ setRateLimitPerUser: setRate });
    const svc = createDiscordService({
      sender: noopSender,
      logger: noopLogger(),
      // biome-ignore lint/suspicious/noExplicitAny: fake client de test
      client: makeClient({ channel }) as any,
    });
    const err = await svc
      .setChannelSlowmode(CHANNEL, 60)
      .catch((e: unknown) => e as DiscordSendError);
    expect(err.reason).toBe('missing-permission');
  });
});
