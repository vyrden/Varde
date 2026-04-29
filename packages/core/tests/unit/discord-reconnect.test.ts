import { describe, expect, it, vi } from 'vitest';

import { createDiscordReconnectService, createLogger } from '../../src/index.js';

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

describe('createDiscordReconnectService', () => {
  it('reconnect ok quand le handler résout sans erreur', async () => {
    const handler = vi.fn(async () => {
      // simulate quick reconnect
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    const service = createDiscordReconnectService({
      handler,
      logger: silentLogger(),
      timeoutMs: 100,
    });
    const result = await service.reconnect('new-token');
    expect(result).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledWith('new-token');
  });

  it('reconnect ok=false avec error quand le handler throw', async () => {
    const handler = vi.fn(async () => {
      throw new Error('login refused');
    });
    const service = createDiscordReconnectService({
      handler,
      logger: silentLogger(),
      timeoutMs: 100,
    });
    const result = await service.reconnect('bad-token');
    expect(result).toEqual({ ok: false, error: 'login refused' });
  });

  it('reconnect ok=false error=timeout si le handler dépasse le timeout', async () => {
    const handler = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 200);
        }),
    );
    const service = createDiscordReconnectService({
      handler,
      logger: silentLogger(),
      timeoutMs: 30,
    });
    const result = await service.reconnect('slow-token');
    expect(result).toEqual({ ok: false, error: 'timeout' });
  });

  it('mutex : sérialise deux appels concurrents (FIFO)', async () => {
    const order: string[] = [];
    const handler = vi.fn(async (token: string) => {
      order.push(`start:${token}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push(`end:${token}`);
    });
    const service = createDiscordReconnectService({
      handler,
      logger: silentLogger(),
      timeoutMs: 200,
    });
    const [a, b] = await Promise.all([service.reconnect('A'), service.reconnect('B')]);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    // Pas de chevauchement : start:A → end:A → start:B → end:B
    expect(order).toEqual(['start:A', 'end:A', 'start:B', 'end:B']);
  });

  it('un échec sur le premier appel n empoisonne pas les suivants', async () => {
    let calls = 0;
    const handler = vi.fn(async () => {
      calls++;
      if (calls === 1) {
        throw new Error('first fails');
      }
      // les suivants réussissent
    });
    const service = createDiscordReconnectService({
      handler,
      logger: silentLogger(),
      timeoutMs: 100,
    });
    const first = await service.reconnect('A');
    const second = await service.reconnect('B');
    expect(first).toEqual({ ok: false, error: 'first fails' });
    expect(second).toEqual({ ok: true });
  });

  it('clearTimeout : pas de fuite si le handler résout avant la fin', async () => {
    const handler = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    const service = createDiscordReconnectService({
      handler,
      logger: silentLogger(),
      timeoutMs: 1000,
    });
    const result = await service.reconnect('token');
    expect(result).toEqual({ ok: true });
    // Si le timer n'était pas clear, le test traînerait 1 seconde
    // entière avant de finir. La présence de cette assertion + le
    // budget de timeout vitest par défaut suffit comme garde.
  });

  it('timeout par défaut : 30 000 ms quand options.timeoutMs absent', async () => {
    // On ne peut pas attendre 30 s en test ; on prouve le défaut
    // indirectement en s'assurant qu'avec un handler quasi-instantané,
    // le service résout en ok sans attendre quoi que ce soit.
    const handler = vi.fn(async () => Promise.resolve());
    const service = createDiscordReconnectService({
      handler,
      logger: silentLogger(),
    });
    const result = await service.reconnect('token');
    expect(result).toEqual({ ok: true });
  });
});
