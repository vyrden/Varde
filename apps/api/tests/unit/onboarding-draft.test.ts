import type { OnboardingDraft } from '@varde/contracts';
import type { PresetDefinition } from '@varde/presets';
import { describe, expect, it } from 'vitest';

import { presetToDraft, serializeDraftToActions } from '../../src/onboarding-draft.js';

const presetWithBindings: PresetDefinition = {
  id: 'test',
  name: 'Test',
  description: 'Test',
  tags: [],
  locale: 'fr',
  roles: [
    {
      localId: 'role-mod',
      name: 'Mod',
      color: 0,
      permissionPreset: 'moderator-minimal',
      hoist: false,
      mentionable: false,
    },
  ],
  categories: [],
  channels: [],
  modules: [],
  permissionBindings: [{ permissionId: 'logs.config.manage', roleLocalId: 'role-mod' }],
};

describe('presetToDraft — permissionBindings', () => {
  it('copie permissionBindings vers le draft', () => {
    const draft = presetToDraft(presetWithBindings);
    expect(draft.permissionBindings).toEqual([
      { permissionId: 'logs.config.manage', roleLocalId: 'role-mod' },
    ]);
  });
});

describe('serializeDraftToActions — core.bindPermission', () => {
  it('émet une action core.bindPermission pour chaque binding, après les createRole', () => {
    const draft: OnboardingDraft = {
      locale: 'fr',
      roles: [
        {
          localId: 'role-mod',
          name: 'Mod',
          color: 0,
          permissionPreset: 'moderator-minimal',
          hoist: false,
          mentionable: false,
        },
      ],
      categories: [],
      channels: [],
      modules: [],
      permissionBindings: [{ permissionId: 'logs.config.manage', roleLocalId: 'role-mod' }],
    };

    const actions = serializeDraftToActions(draft);

    const createRoleIdx = actions.findIndex((a) => a.type === 'core.createRole');
    const bindPermIdx = actions.findIndex((a) => a.type === 'core.bindPermission');

    expect(createRoleIdx).toBeGreaterThanOrEqual(0);
    expect(bindPermIdx).toBeGreaterThanOrEqual(0);
    expect(bindPermIdx).toBeGreaterThan(createRoleIdx);

    expect(actions[bindPermIdx]).toMatchObject({
      type: 'core.bindPermission',
      payload: { permissionId: 'logs.config.manage', roleLocalId: 'role-mod' },
    });
  });

  it('throw si un binding référence un rôle absent du draft', () => {
    const draft: OnboardingDraft = {
      locale: 'fr',
      roles: [],
      categories: [],
      channels: [],
      modules: [],
      permissionBindings: [{ permissionId: 'logs.config.manage', roleLocalId: 'role-ghost' }],
    };
    expect(() => serializeDraftToActions(draft)).toThrow(/roleLocalId.*role-ghost/i);
  });

  it('émet bindPermission APRÈS tous les createRole (invariant)', () => {
    const draft: OnboardingDraft = {
      locale: 'fr',
      roles: [
        {
          localId: 'role-mod',
          name: 'Mod',
          color: 0,
          permissionPreset: 'moderator-minimal',
          hoist: false,
          mentionable: false,
        },
      ],
      categories: [],
      channels: [],
      modules: [],
      permissionBindings: [{ permissionId: 'logs.config.manage', roleLocalId: 'role-mod' }],
    };
    const actions = serializeDraftToActions(draft);
    const indexedActions = actions.map((a, i) => ({ a, i }));
    const lastCreateRole = indexedActions.filter(({ a }) => a.type === 'core.createRole').pop();
    const firstBindPermission = indexedActions.find(({ a }) => a.type === 'core.bindPermission');
    expect(firstBindPermission?.i).toBeGreaterThan(lastCreateRole?.i ?? -1);
  });
});
