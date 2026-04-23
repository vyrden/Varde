import { describe, expect, it } from 'vitest';

import {
  type PresetPermissionBinding,
  presetDefinitionSchema,
  presetPermissionBindingSchema,
} from '../../src/types.js';

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
