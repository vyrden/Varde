import { describe, expect, it } from 'vitest';

import {
  type PresetPermissionBinding,
  presetDefinitionSchema,
  presetPermissionBindingSchema,
} from '../../src/types.js';
import { validatePreset } from '../../src/validator.js';

describe('PresetPermissionBinding schema', () => {
  it('accepte un binding nominal', () => {
    const binding: PresetPermissionBinding = {
      permissionId: 'logs.config.manage',
      roleLocalId: 'role-mod',
    };
    const parsed = presetPermissionBindingSchema.parse(binding);
    expect(parsed).toEqual(binding);
  });

  it('refuse un permissionId vide', () => {
    expect(() =>
      presetPermissionBindingSchema.parse({ permissionId: '', roleLocalId: 'role-mod' }),
    ).toThrow();
  });

  it('refuse un roleLocalId vide', () => {
    expect(() =>
      presetPermissionBindingSchema.parse({ permissionId: 'x.y', roleLocalId: '' }),
    ).toThrow();
  });

  it('permissionId doit respecter le format `<moduleId>.<path>`', () => {
    expect(() =>
      presetPermissionBindingSchema.parse({ permissionId: 'notvalid', roleLocalId: 'role' }),
    ).toThrow(/point/i);
  });
});

describe('PresetDefinition avec permissionBindings', () => {
  const base = {
    id: 'test-preset',
    name: 'Test',
    description: 'Test preset',
    tags: [],
    locale: 'fr' as const,
    roles: [],
    categories: [],
    channels: [],
    modules: [],
  };

  it('accepte un preset sans permissionBindings (défaut vide)', () => {
    const parsed = presetDefinitionSchema.parse(base);
    expect(parsed.permissionBindings).toEqual([]);
  });

  it('accepte un preset avec permissionBindings explicite', () => {
    const parsed = presetDefinitionSchema.parse({
      ...base,
      permissionBindings: [{ permissionId: 'logs.config.manage', roleLocalId: 'role-mod' }],
    });
    expect(parsed.permissionBindings).toHaveLength(1);
  });
});

describe('validator — permissionBindings', () => {
  const base = {
    id: 'test-preset',
    name: 'Test',
    description: 'Test',
    tags: [],
    locale: 'fr' as const,
    roles: [
      {
        localId: 'role-mod',
        name: 'Mod',
        color: 0,
        permissionPreset: 'moderator-minimal' as const,
        hoist: false,
        mentionable: false,
      },
    ],
    categories: [],
    channels: [],
    modules: [],
  };

  it('accepte un binding vers un rôle existant', () => {
    const result = validatePreset({
      ...base,
      permissionBindings: [{ permissionId: 'logs.config.manage', roleLocalId: 'role-mod' }],
    });
    expect(result.ok).toBe(true);
  });

  it('refuse un binding vers un rôle inexistant', () => {
    const result = validatePreset({
      ...base,
      permissionBindings: [{ permissionId: 'logs.config.manage', roleLocalId: 'role-ghost' }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('guard');
    expect(result.issues.some((i) => i.code === 'unknown_role_ref_binding')).toBe(true);
  });

  it('refuse un doublon exact (même permissionId, même roleLocalId)', () => {
    const result = validatePreset({
      ...base,
      permissionBindings: [
        { permissionId: 'logs.config.manage', roleLocalId: 'role-mod' },
        { permissionId: 'logs.config.manage', roleLocalId: 'role-mod' },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('guard');
    expect(result.issues.some((i) => i.code === 'duplicate_binding')).toBe(true);
  });

  it('accepte le même permissionId lié à deux rôles différents', () => {
    const result = validatePreset({
      ...base,
      roles: [
        ...base.roles,
        {
          localId: 'role-admin',
          name: 'Admin',
          color: 0,
          permissionPreset: 'moderator-full' as const,
          hoist: false,
          mentionable: false,
        },
      ],
      permissionBindings: [
        { permissionId: 'logs.config.manage', roleLocalId: 'role-mod' },
        { permissionId: 'logs.config.manage', roleLocalId: 'role-admin' },
      ],
    });
    expect(result.ok).toBe(true);
  });
});
