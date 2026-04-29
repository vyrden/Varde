import { EventEmitter } from 'node:events';
import type { GuildPermissionsService } from '@varde/core';
import { describe, expect, it, vi } from 'vitest';

import { attachGuildPermissionsListeners } from '../../src/guild-permissions-listeners.js';

/**
 * Tests unitaires des listeners — on instancie un EventEmitter
 * Node natif comme stand-in pour le `Client` discord.js. Le helper
 * n'utilise que `client.on()` / `client.off()` qui sont compatibles.
 */

const createMockService = (): GuildPermissionsService => ({
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
  getUserLevel: vi.fn(),
  canAccessModule: vi.fn(),
  cleanupDeletedRole: vi.fn(async () => undefined),
  invalidateGuild: vi.fn(),
  invalidateMember: vi.fn(),
});

describe('attachGuildPermissionsListeners', () => {
  it('roleDelete → service.cleanupDeletedRole(guildId, roleId)', async () => {
    const emitter = new EventEmitter();
    const service = createMockService();
    attachGuildPermissionsListeners({
      client: emitter as unknown as Parameters<typeof attachGuildPermissionsListeners>[0]['client'],
      service,
    });
    emitter.emit('roleDelete', { id: 'role-123', guild: { id: 'guild-1' } });
    // cleanupDeletedRole est appelé en async via void — attente d'un tick
    await new Promise((resolve) => setImmediate(resolve));
    expect(service.cleanupDeletedRole).toHaveBeenCalledWith('guild-1', 'role-123');
  });

  it('roleUpdate → service.invalidateGuild(guildId)', () => {
    const emitter = new EventEmitter();
    const service = createMockService();
    attachGuildPermissionsListeners({
      client: emitter as unknown as Parameters<typeof attachGuildPermissionsListeners>[0]['client'],
      service,
    });
    emitter.emit(
      'roleUpdate',
      { id: 'role-1', guild: { id: 'guild-1' } },
      { id: 'role-1', guild: { id: 'guild-1' } },
    );
    expect(service.invalidateGuild).toHaveBeenCalledWith('guild-1');
  });

  it('guildMemberUpdate → service.invalidateMember(guildId, userId)', () => {
    const emitter = new EventEmitter();
    const service = createMockService();
    attachGuildPermissionsListeners({
      client: emitter as unknown as Parameters<typeof attachGuildPermissionsListeners>[0]['client'],
      service,
    });
    emitter.emit('guildMemberUpdate', { guild: { id: 'guild-1' }, id: 'user-1' }, { id: 'user-1' });
    expect(service.invalidateMember).toHaveBeenCalledWith('guild-1', 'user-1');
  });

  it('detach() retire tous les listeners', () => {
    const emitter = new EventEmitter();
    const service = createMockService();
    const binding = attachGuildPermissionsListeners({
      client: emitter as unknown as Parameters<typeof attachGuildPermissionsListeners>[0]['client'],
      service,
    });
    expect(emitter.listenerCount('roleDelete')).toBe(1);
    expect(emitter.listenerCount('roleUpdate')).toBe(1);
    expect(emitter.listenerCount('guildMemberUpdate')).toBe(1);
    binding.detach();
    expect(emitter.listenerCount('roleDelete')).toBe(0);
    expect(emitter.listenerCount('roleUpdate')).toBe(0);
    expect(emitter.listenerCount('guildMemberUpdate')).toBe(0);
  });

  it('cleanupDeletedRole qui throw n émerge pas (capture interne)', async () => {
    const emitter = new EventEmitter();
    const service = createMockService();
    (service.cleanupDeletedRole as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    attachGuildPermissionsListeners({
      client: emitter as unknown as Parameters<typeof attachGuildPermissionsListeners>[0]['client'],
      service,
    });
    expect(() =>
      emitter.emit('roleDelete', { id: 'role-1', guild: { id: 'guild-1' } }),
    ).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
  });
});
