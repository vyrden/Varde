import { createLogger } from '@varde/core';
import { describe, expect, it, vi } from 'vitest';

import { createShutdownCoordinator } from '../../src/shutdown.js';

const silentLogger = () =>
  createLogger({ destination: { write: () => undefined }, level: 'fatal' });

describe('createShutdownCoordinator', () => {
  it('exécute les étapes dans l ordre inverse', async () => {
    const order: string[] = [];
    const sc = createShutdownCoordinator({ logger: silentLogger() });
    sc.register({ name: 'a', run: () => order.push('a') });
    sc.register({ name: 'b', run: () => order.push('b') });
    sc.register({ name: 'c', run: () => order.push('c') });
    await sc.run();
    expect(order).toEqual(['c', 'b', 'a']);
  });

  it('continue si une étape lève', async () => {
    const order: string[] = [];
    const sc = createShutdownCoordinator({ logger: silentLogger() });
    sc.register({ name: 'a', run: () => order.push('a') });
    sc.register({
      name: 'b',
      run: () => {
        throw new Error('boom');
      },
    });
    sc.register({ name: 'c', run: () => order.push('c') });
    await sc.run();
    expect(order).toEqual(['c', 'a']);
  });

  it('idempotent : un second run() ne rejoue pas les étapes', async () => {
    const step = vi.fn();
    const sc = createShutdownCoordinator({ logger: silentLogger() });
    sc.register({ name: 'once', run: step });
    await sc.run();
    await sc.run();
    expect(step).toHaveBeenCalledTimes(1);
  });
});
