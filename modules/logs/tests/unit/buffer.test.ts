import type { CoreEvent } from '@varde/contracts';
import { describe, expect, it } from 'vitest';

import { createRouteBuffer } from '../../src/buffer.js';

const fakeEvent = (i: number): CoreEvent => ({
  type: 'guild.memberJoin',
  guildId: 'g1' as never,
  userId: `u${i}` as never,
  joinedAt: i,
});

describe('createRouteBuffer', () => {
  it('retourne 0 événements pour une route jamais alimentée', () => {
    const b = createRouteBuffer();
    expect(b.snapshot('route-1')).toEqual({ events: [], droppedCount: 0, markedAt: null });
  });

  it("push jusqu'à 100 events sur une route, les retient tous", () => {
    const b = createRouteBuffer();
    for (let i = 0; i < 100; i++) {
      b.push('route-1', fakeEvent(i), 0);
    }
    const snap = b.snapshot('route-1');
    expect(snap.events).toHaveLength(100);
    expect(snap.droppedCount).toBe(0);
  });

  it('push au-delà de 100 incrémente droppedCount et préserve les 100 premiers', () => {
    const b = createRouteBuffer();
    for (let i = 0; i < 105; i++) {
      b.push('route-1', fakeEvent(i), 0);
    }
    const snap = b.snapshot('route-1');
    expect(snap.events).toHaveLength(100);
    expect(snap.droppedCount).toBe(5);
    // FIFO : les 100 premiers sont conservés.
    expect(snap.events[0]).toMatchObject({ userId: 'u0' });
    expect(snap.events[99]).toMatchObject({ userId: 'u99' });
  });

  it('markedAt est posé au premier push après une période saine', () => {
    const b = createRouteBuffer();
    b.push('route-1', fakeEvent(0), 1000);
    expect(b.snapshot('route-1').markedAt).toBe(1000);
  });

  it('drain retire et retourne les events, reset droppedCount et markedAt', () => {
    const b = createRouteBuffer();
    for (let i = 0; i < 50; i++) b.push('route-1', fakeEvent(i), 1000);
    const drained = b.drain('route-1');
    expect(drained).toHaveLength(50);
    expect(b.snapshot('route-1')).toEqual({ events: [], droppedCount: 0, markedAt: null });
  });

  it('buffers par route sont isolés', () => {
    const b = createRouteBuffer();
    b.push('route-1', fakeEvent(1), 0);
    b.push('route-2', fakeEvent(2), 0);
    expect(b.snapshot('route-1').events).toHaveLength(1);
    expect(b.snapshot('route-2').events).toHaveLength(1);
    expect(b.snapshot('route-1').events[0]?.userId).toBe('u1');
  });

  it('brokenRouteIds liste uniquement les routes avec events ou drop', () => {
    const b = createRouteBuffer();
    b.push('r1', fakeEvent(0), 0);
    expect(b.brokenRouteIds()).toEqual(['r1']);
    b.drain('r1');
    expect(b.brokenRouteIds()).toEqual([]);
  });
});
