import { type ChannelId, DependencyFailureError, type ModuleId } from '@varde/contracts';
import { createLogger } from '@varde/core';
import { describe, expect, it } from 'vitest';

import { type ChannelSender, createDiscordService } from '../../src/discord-service.js';

const CHANNEL: ChannelId = '222' as ChannelId;
const MODULE: ModuleId = 'moderation' as ModuleId;

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

const okSender = (): ChannelSender & { calls: [ChannelId, string][] } => {
  const calls: [ChannelId, string][] = [];
  return {
    calls,
    async sendMessage(channelId, content) {
      calls.push([channelId, content]);
    },
  };
};

describe('createDiscordService', () => {
  it('délègue au sender sans rate limit', async () => {
    const sender = okSender();
    const service = createDiscordService({ sender, logger: silentLogger() });
    await service.sendMessage(CHANNEL, 'salut');
    expect(sender.calls).toEqual([[CHANNEL, 'salut']]);
  });

  it('applique la fenêtre de rate limit et rejette au-delà', async () => {
    const sender = okSender();
    const fakeNow = 1_000;
    const service = createDiscordService({
      sender,
      logger: silentLogger(),
      moduleId: MODULE,
      rateLimit: { tokens: 2, windowMs: 1_000 },
      now: () => fakeNow,
    });

    await service.sendMessage(CHANNEL, 'a');
    await service.sendMessage(CHANNEL, 'b');
    await expect(service.sendMessage(CHANNEL, 'c')).rejects.toBeInstanceOf(DependencyFailureError);
    expect(sender.calls).toHaveLength(2);
  });

  it('libère des crédits après la fenêtre', async () => {
    const sender = okSender();
    let fakeNow = 1_000;
    const service = createDiscordService({
      sender,
      logger: silentLogger(),
      rateLimit: { tokens: 1, windowMs: 500 },
      now: () => fakeNow,
    });

    await service.sendMessage(CHANNEL, 'a');
    await expect(service.sendMessage(CHANNEL, 'b')).rejects.toBeInstanceOf(DependencyFailureError);
    fakeNow += 600;
    await service.sendMessage(CHANNEL, 'c');
    expect(sender.calls.map((c) => c[1])).toEqual(['a', 'c']);
  });

  it("encapsule l'erreur du sender en DependencyFailureError", async () => {
    const sender: ChannelSender = {
      sendMessage: async () => {
        throw new Error('network');
      },
    };
    const service = createDiscordService({ sender, logger: silentLogger() });
    const error = await service.sendMessage(CHANNEL, 'x').catch((e: unknown) => e as Error);
    expect(error).toBeInstanceOf(DependencyFailureError);
    expect(error.cause).toBeInstanceOf(Error);
    expect((error.cause as Error).message).toBe('network');
  });

  it('deux instances ont des fenêtres indépendantes (par module)', async () => {
    const sender = okSender();
    const logger = silentLogger();
    const a = createDiscordService({
      sender,
      logger,
      moduleId: 'mod-a' as ModuleId,
      rateLimit: { tokens: 1, windowMs: 1_000 },
      now: () => 0,
    });
    const b = createDiscordService({
      sender,
      logger,
      moduleId: 'mod-b' as ModuleId,
      rateLimit: { tokens: 1, windowMs: 1_000 },
      now: () => 0,
    });
    await a.sendMessage(CHANNEL, 'a');
    await b.sendMessage(CHANNEL, 'b');
    expect(sender.calls.map((c) => c[1])).toEqual(['a', 'b']);
    await expect(a.sendMessage(CHANNEL, 'blocked')).rejects.toBeInstanceOf(DependencyFailureError);
  });

  it('log un warn lorsque le sender échoue (non bloquant pour le test)', async () => {
    const sender: ChannelSender = {
      sendMessage: async () => {
        throw new Error('boom');
      },
    };
    const capture: unknown[] = [];
    const logger = createLogger({
      destination: {
        write: (chunk: string) => {
          for (const line of chunk.split('\n')) {
            if (line.length === 0) continue;
            capture.push(JSON.parse(line));
          }
        },
      },
    });
    const service = createDiscordService({ sender, logger });
    await service.sendMessage(CHANNEL, 'x').catch(() => undefined);
    const warn = capture.find(
      (entry) =>
        typeof entry === 'object' && entry !== null && (entry as { level?: number }).level === 40,
    );
    expect(warn).toBeDefined();
  });
});
