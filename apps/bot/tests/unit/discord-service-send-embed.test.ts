import { type ChannelId, DiscordSendError, type Logger, type UIMessage } from '@varde/contracts';
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

const embedMessage = (): UIMessage => ({
  kind: 'embed',
  payload: { title: 'T', description: 'D' },
});

describe('createDiscordService — sendEmbed', () => {
  it('appelle sender.sendEmbed pour un UIMessage de kind embed', async () => {
    const sendEmbed = vi.fn().mockResolvedValue(undefined);
    const sender: ChannelSender = {
      sendMessage: vi.fn(),
      sendEmbed,
    };
    const svc = createDiscordService({ sender, logger: noopLogger() });

    await svc.sendEmbed('chan' as ChannelId, embedMessage());

    expect(sendEmbed).toHaveBeenCalledTimes(1);
    expect(sendEmbed).toHaveBeenCalledWith('chan', expect.objectContaining({ kind: 'embed' }));
  });

  it('refuse un UIMessage non-embed avec TypeError explicite', async () => {
    const sender: ChannelSender = {
      sendMessage: vi.fn(),
      sendEmbed: vi.fn(),
    };
    const svc = createDiscordService({ sender, logger: noopLogger() });

    const notAnEmbed: UIMessage = { kind: 'success', payload: { message: 'oops' } };

    await expect(svc.sendEmbed('c' as ChannelId, notAnEmbed)).rejects.toThrow(TypeError);
    expect(sender.sendEmbed).not.toHaveBeenCalled();
  });

  it('mappe une erreur "Unknown Channel" sur DiscordSendError reason=channel-not-found', async () => {
    const sender: ChannelSender = {
      sendMessage: vi.fn(),
      sendEmbed: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('Unknown Channel'), { code: 10003 })),
    };
    const svc = createDiscordService({ sender, logger: noopLogger() });

    await expect(svc.sendEmbed('c' as ChannelId, embedMessage())).rejects.toMatchObject({
      name: 'DiscordSendError',
      reason: 'channel-not-found',
    });
  });

  it('mappe une erreur "Missing Permissions" sur reason=missing-permission', async () => {
    const sender: ChannelSender = {
      sendMessage: vi.fn(),
      sendEmbed: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('Missing Permissions'), { code: 50013 })),
    };
    const svc = createDiscordService({ sender, logger: noopLogger() });

    await expect(svc.sendEmbed('c' as ChannelId, embedMessage())).rejects.toBeInstanceOf(
      DiscordSendError,
    );
    await expect(svc.sendEmbed('c' as ChannelId, embedMessage())).rejects.toMatchObject({
      reason: 'missing-permission',
    });
  });

  it('mappe une autre erreur sur reason=unknown', async () => {
    const sender: ChannelSender = {
      sendMessage: vi.fn(),
      sendEmbed: vi.fn().mockRejectedValue(new Error('ECONNRESET')),
    };
    const svc = createDiscordService({ sender, logger: noopLogger() });

    await expect(svc.sendEmbed('c' as ChannelId, embedMessage())).rejects.toMatchObject({
      reason: 'unknown',
    });
  });

  it('respecte le rate-limit applicatif et throw rate-limit-exhausted si fenêtre pleine', async () => {
    let now = 0;
    const sender: ChannelSender = {
      sendMessage: vi.fn(),
      sendEmbed: vi.fn().mockResolvedValue(undefined),
    };
    const svc = createDiscordService({
      sender,
      logger: noopLogger(),
      rateLimit: { tokens: 2, windowMs: 1000 },
      now: () => now,
    });

    await svc.sendEmbed('c' as ChannelId, embedMessage());
    await svc.sendEmbed('c' as ChannelId, embedMessage());
    await expect(svc.sendEmbed('c' as ChannelId, embedMessage())).rejects.toMatchObject({
      reason: 'rate-limit-exhausted',
    });

    now = 1500;
    await expect(svc.sendEmbed('c' as ChannelId, embedMessage())).resolves.toBeUndefined();
  });
});
