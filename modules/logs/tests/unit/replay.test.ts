import { DiscordSendError, type GuildMemberJoinEvent, type UIMessage } from '@varde/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { __bufferForTests, replayBrokenRouteFor } from '../../src/index.js';

type Call = { readonly channelId: string; readonly message: UIMessage };

const makeSender = (
  behaviour: (call: number) => undefined | DiscordSendError,
): {
  readonly fn: (channelId: string, message: UIMessage) => Promise<void>;
  readonly calls: Call[];
} => {
  const calls: Call[] = [];
  return {
    calls,
    fn: async (channelId, message) => {
      calls.push({ channelId, message });
      const maybeError = behaviour(calls.length);
      if (maybeError) throw maybeError;
    },
  };
};

const memberJoin = (overrides?: Partial<GuildMemberJoinEvent>): GuildMemberJoinEvent => ({
  type: 'guild.memberJoin',
  guildId: 'g1' as never,
  userId: 'u1' as never,
  joinedAt: Date.UTC(2026, 3, 24),
  ...(overrides ?? {}),
});

const bufferThreeEvents = (routeId: string): void => {
  const buf = __bufferForTests;
  buf.push(routeId, memberJoin({ userId: 'u1' as never }), 1000, {
    guildId: 'g1',
    channelId: 'c1',
    reason: 'unknown',
  });
  buf.push(routeId, memberJoin({ userId: 'u2' as never }), 1001, {
    guildId: 'g1',
    channelId: 'c1',
    reason: 'unknown',
  });
  buf.push(routeId, memberJoin({ userId: 'u3' as never }), 1002, {
    guildId: 'g1',
    channelId: 'c1',
    reason: 'unknown',
  });
};

afterEach(() => {
  // Nettoie le buffer module-level entre tests.
  for (const routeId of __bufferForTests.brokenRouteIds()) {
    __bufferForTests.clear(routeId);
  }
  vi.useRealTimers();
});

describe('replayBrokenRouteFor', () => {
  it('renvoie {replayed:0, failed:0} et ne sollicite pas sender quand le buffer est vide', async () => {
    const { fn, calls } = makeSender(() => {});
    const result = await replayBrokenRouteFor('g1', 'route-vide', fn, { delayMs: 0 });
    expect(result).toEqual({ replayed: 0, failed: 0 });
    expect(calls).toHaveLength(0);
  });

  it('rejoue les 3 events bufferisés dans l ordre FIFO quand sender réussit', async () => {
    bufferThreeEvents('route-ok');
    const { fn, calls } = makeSender(() => {});
    const result = await replayBrokenRouteFor('g1', 'route-ok', fn, { delayMs: 0 });
    expect(result).toEqual({ replayed: 3, failed: 0 });
    expect(calls).toHaveLength(3);
    expect(calls[0]?.channelId).toBe('c1');
    expect(calls[0]?.message.kind).toBe('embed');
    // buffer vidé
    expect(__bufferForTests.snapshot('route-ok').events).toHaveLength(0);
  });

  it('renvoie un partiel et réinjecte les events restants dans le buffer en cas de DiscordSendError au 2ème envoi', async () => {
    bufferThreeEvents('route-partial');
    const err = new DiscordSendError('channel-not-found');
    const { fn, calls } = makeSender((n) => (n === 2 ? err : undefined));
    const result = await replayBrokenRouteFor('g1', 'route-partial', fn, { delayMs: 0 });
    expect(result.replayed).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.firstError).toBe(err);
    expect(calls).toHaveLength(2);
    // 2 events restants dans le buffer, ordre préservé
    const remaining = __bufferForTests.snapshot('route-partial');
    expect(remaining.events).toHaveLength(2);
  });

  it('idempotent : rappel après succès renvoie 0 sans solliciter sender', async () => {
    bufferThreeEvents('route-idem');
    const { fn } = makeSender(() => {});
    await replayBrokenRouteFor('g1', 'route-idem', fn, { delayMs: 0 });
    const { fn: fn2, calls: calls2 } = makeSender(() => {});
    const result = await replayBrokenRouteFor('g1', 'route-idem', fn2, { delayMs: 0 });
    expect(result).toEqual({ replayed: 0, failed: 0 });
    expect(calls2).toHaveLength(0);
  });

  it('refuse de rejouer une route qui appartient à une autre guild (sécurité inter-guild)', async () => {
    bufferThreeEvents('route-autre-guild');
    const { fn, calls } = makeSender(() => {});
    const result = await replayBrokenRouteFor('autre-guild', 'route-autre-guild', fn, {
      delayMs: 0,
    });
    expect(result).toEqual({ replayed: 0, failed: 0 });
    expect(calls).toHaveLength(0);
    // Le buffer reste inchangé côté route originale.
    expect(__bufferForTests.snapshot('route-autre-guild').events).toHaveLength(3);
  });

  it('espace les envois de delayMs ms (50ms par défaut)', async () => {
    bufferThreeEvents('route-delay');
    const callTimes: number[] = [];
    const fn = async (): Promise<void> => {
      callTimes.push(Date.now());
    };
    vi.useFakeTimers({ now: 1_700_000_000_000 });
    const promise = replayBrokenRouteFor('g1', 'route-delay', fn, { delayMs: 50 });
    // 3 envois avec 50ms entre chaque → total ≈ 100ms (pas de délai avant le 1er).
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;
    expect(result.replayed).toBe(3);
    expect(callTimes).toHaveLength(3);
    // Les timestamps doivent être strictement croissants par pas de ≥ 50.
    const [t0 = 0, t1 = 0, t2 = 0] = callTimes;
    expect(t1 - t0).toBeGreaterThanOrEqual(50);
    expect(t2 - t1).toBeGreaterThanOrEqual(50);
  });
});
