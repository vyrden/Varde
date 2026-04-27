import { describe, expect, it } from 'vitest';

import {
  isEmojiAvailable,
  isRoleAvailable,
} from '../../../components/reaction-roles/editor/editor-helpers';
import type { EmojiCatalog, RoleOption } from '../../../components/reaction-roles/types';

const EMPTY_CATALOG: EmojiCatalog = { current: [], external: [] };

const CATALOG_WITH_CURRENT: EmojiCatalog = {
  current: [{ id: '111111111111111111', name: 'pepe', animated: false }],
  external: [],
};

const CATALOG_WITH_EXTERNAL: EmojiCatalog = {
  current: [],
  external: [
    { id: '222222222222222222', name: 'wave', animated: false, guildName: 'Autre serveur' },
  ],
};

const ROLES: readonly RoleOption[] = [
  { id: '333', name: 'Europe' },
  { id: '444', name: 'Asie' },
];

describe('isEmojiAvailable', () => {
  it('retourne true pour les emojis Unicode (toujours dispos)', () => {
    expect(isEmojiAvailable('🇪🇺', EMPTY_CATALOG)).toBe(true);
    expect(isEmojiAvailable('😀', EMPTY_CATALOG)).toBe(true);
  });

  it('retourne true pour une chaîne vide ou espaces (rien à invalider)', () => {
    expect(isEmojiAvailable('', EMPTY_CATALOG)).toBe(true);
    expect(isEmojiAvailable('   ', EMPTY_CATALOG)).toBe(true);
  });

  it('retourne true si l emoji custom est dans le pool current', () => {
    expect(isEmojiAvailable('<:pepe:111111111111111111>', CATALOG_WITH_CURRENT)).toBe(true);
  });

  it('retourne true si l emoji custom est dans le pool external', () => {
    expect(isEmojiAvailable('<:wave:222222222222222222>', CATALOG_WITH_EXTERNAL)).toBe(true);
  });

  it('retourne false si l emoji custom n est dans aucun pool (orphelin)', () => {
    expect(isEmojiAvailable('<:ghost:999999999999999999>', CATALOG_WITH_CURRENT)).toBe(false);
    expect(isEmojiAvailable('<:ghost:999999999999999999>', EMPTY_CATALOG)).toBe(false);
  });

  it('reconnaît la forme animée <a:name:id>', () => {
    const animatedCatalog: EmojiCatalog = {
      current: [{ id: '555555555555555555', name: 'dance', animated: true }],
      external: [],
    };
    expect(isEmojiAvailable('<a:dance:555555555555555555>', animatedCatalog)).toBe(true);
    expect(isEmojiAvailable('<a:dance:000000000000000001>', animatedCatalog)).toBe(false);
  });
});

describe('isRoleAvailable', () => {
  it('retourne true pour un roleId vide (mode create ou non assigné)', () => {
    expect(isRoleAvailable('', ROLES)).toBe(true);
  });

  it('retourne true si le roleId est dans la liste', () => {
    expect(isRoleAvailable('333', ROLES)).toBe(true);
    expect(isRoleAvailable('444', ROLES)).toBe(true);
  });

  it('retourne false si le roleId n est pas dans la liste (rôle supprimé Discord)', () => {
    expect(isRoleAvailable('999', ROLES)).toBe(false);
  });

  it('retourne false avec une liste de rôles vide', () => {
    expect(isRoleAvailable('333', [])).toBe(false);
  });
});
