import type { CoreEvent, GuildId, UserId } from '@varde/contracts';
import { describe, expect, it, vi } from 'vitest';

import { createEventBus } from '../../src/events.js';
import { createLogger } from '../../src/logger.js';

const silentLogger = () =>
  createLogger({
    destination: { write: () => undefined },
    level: 'fatal',
  });

const memberJoinEvent = (userId: string = '42'): CoreEvent => ({
  type: 'guild.memberJoin',
  guildId: '111' as GuildId,
  userId: userId as UserId,
  joinedAt: Date.now(),
});

const memberLeaveEvent = (): CoreEvent => ({
  type: 'guild.memberLeave',
  guildId: '111' as GuildId,
  userId: '42' as UserId,
  leftAt: Date.now(),
});

describe('createEventBus', () => {
  it('dispatche vers les handlers abonnés au type', async () => {
    const bus = createEventBus({ logger: silentLogger() });
    const joinHandler = vi.fn();
    const leaveHandler = vi.fn();
    bus.on('guild.memberJoin', joinHandler);
    bus.on('guild.memberLeave', leaveHandler);

    await bus.emit(memberJoinEvent());

    expect(joinHandler).toHaveBeenCalledTimes(1);
    expect(leaveHandler).not.toHaveBeenCalled();
  });

  it('onAny reçoit tous les événements', async () => {
    const bus = createEventBus({ logger: silentLogger() });
    const wild = vi.fn();
    bus.onAny(wild);

    await bus.emit(memberJoinEvent());
    await bus.emit(memberLeaveEvent());

    expect(wild).toHaveBeenCalledTimes(2);
  });

  it('l unsubscribe retourné par on() retire le handler', async () => {
    const bus = createEventBus({ logger: silentLogger() });
    const handler = vi.fn();
    const off = bus.on('guild.memberJoin', handler);

    await bus.emit(memberJoinEvent());
    off();
    await bus.emit(memberJoinEvent());

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('isole les erreurs : un handler qui jette ne bloque pas les autres', async () => {
    const bus = createEventBus({ logger: silentLogger() });
    const crasher = vi.fn(() => {
      throw new Error('boom');
    });
    const survivor = vi.fn();
    bus.on('guild.memberJoin', crasher);
    bus.on('guild.memberJoin', survivor);

    await bus.emit(memberJoinEvent());

    expect(crasher).toHaveBeenCalledTimes(1);
    expect(survivor).toHaveBeenCalledTimes(1);
  });

  it('attend la résolution des handlers asynchrones', async () => {
    const bus = createEventBus({ logger: silentLogger() });
    let resolved = false;
    bus.on('guild.memberJoin', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      resolved = true;
    });

    await bus.emit(memberJoinEvent());
    expect(resolved).toBe(true);
  });

  it('onAny + on() reçoivent le même événement une fois chacun', async () => {
    const bus = createEventBus({ logger: silentLogger() });
    const wild = vi.fn();
    const typed = vi.fn();
    bus.onAny(wild);
    bus.on('guild.memberJoin', typed);

    await bus.emit(memberJoinEvent());

    expect(wild).toHaveBeenCalledTimes(1);
    expect(typed).toHaveBeenCalledTimes(1);
  });

  it('plusieurs handlers pour un même type reçoivent tous l événement', async () => {
    const bus = createEventBus({ logger: silentLogger() });
    const a = vi.fn();
    const b = vi.fn();
    bus.on('guild.memberJoin', a);
    bus.on('guild.memberJoin', b);

    await bus.emit(memberJoinEvent());

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
