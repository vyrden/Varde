import type { OnboardingActionContext } from '@varde/contracts';
import { describe, expect, it, vi } from 'vitest';

import { bindPermissionAction } from '../../src/onboarding/actions.js';

const makeCtx = (overrides?: Partial<OnboardingActionContext>): OnboardingActionContext => ({
  guildId: 'g1' as never,
  actorId: 'u1' as never,
  logger: { info: () => {}, warn: () => {}, error: () => {} },
  discord: {
    createRole: vi.fn(),
    deleteRole: vi.fn(),
    createCategory: vi.fn(),
    deleteCategory: vi.fn(),
    createChannel: vi.fn(),
    deleteChannel: vi.fn(),
  } as never,
  configPatch: vi.fn(),
  resolveLocalId: (localId) => (localId === 'role-mod' ? 'snowflake-mod' : null),
  permissions: {
    bind: vi.fn().mockResolvedValue(undefined),
    unbind: vi.fn().mockResolvedValue(undefined),
  },
  ...overrides,
});

describe('bindPermissionAction', () => {
  it('schema refuse un payload sans permissionId', () => {
    const result = bindPermissionAction.schema.safeParse({ roleLocalId: 'r' });
    expect(result.success).toBe(false);
  });

  it('apply résout le roleLocalId et appelle permissions.bind', async () => {
    const bind = vi.fn().mockResolvedValue(undefined);
    const ctx = makeCtx({
      permissions: { bind, unbind: vi.fn() },
    });

    const result = await bindPermissionAction.apply(ctx, {
      permissionId: 'logs.config.manage',
      roleLocalId: 'role-mod',
    });

    expect(bind).toHaveBeenCalledWith('logs.config.manage', 'snowflake-mod');
    expect(result).toEqual({ roleId: 'snowflake-mod' });
  });

  it('apply lève si roleLocalId ne résout pas', async () => {
    const ctx = makeCtx({ resolveLocalId: () => null });
    await expect(
      bindPermissionAction.apply(ctx, {
        permissionId: 'logs.config.manage',
        roleLocalId: 'role-ghost',
      }),
    ).rejects.toThrow(/roleLocalId.*role-ghost.*non résolu/i);
  });

  it('undo appelle permissions.unbind avec le même (permissionId, roleId)', async () => {
    const unbind = vi.fn().mockResolvedValue(undefined);
    const ctx = makeCtx({
      permissions: { bind: vi.fn(), unbind },
    });

    await bindPermissionAction.undo(
      ctx,
      { permissionId: 'logs.config.manage', roleLocalId: 'role-mod' },
      { roleId: 'snowflake-mod' },
    );

    expect(unbind).toHaveBeenCalledWith('logs.config.manage', 'snowflake-mod');
  });

  it('canUndo est true', () => {
    expect(bindPermissionAction.canUndo).toBe(true);
  });

  it('est inclus dans CORE_ACTIONS', async () => {
    const { CORE_ACTIONS } = await import('../../src/onboarding/actions.js');
    expect(CORE_ACTIONS).toContain(bindPermissionAction);
  });
});
