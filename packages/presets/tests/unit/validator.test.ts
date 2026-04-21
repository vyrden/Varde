import { describe, expect, it } from 'vitest';

import type { PresetDefinition } from '../../src/types.js';
import { PRESET_OBJECT_BUDGET } from '../../src/types.js';
import { assertValidPreset, validatePreset } from '../../src/validator.js';

const validBase: PresetDefinition = {
  id: 'test-valid',
  name: 'Valid',
  description: 'Valide pour tests.',
  tags: [],
  locale: 'fr',
  roles: [
    {
      localId: 'role-a',
      name: 'A',
      color: 0,
      permissionPreset: 'member-default',
      hoist: false,
      mentionable: false,
    },
  ],
  categories: [{ localId: 'cat-a', name: 'cat', position: 0 }],
  channels: [
    {
      localId: 'chan-a',
      categoryLocalId: 'cat-a',
      name: 'chan-a',
      type: 'text',
      slowmodeSeconds: 0,
      readableBy: [],
      writableBy: ['role-a'],
    },
  ],
  modules: [],
};

describe('validatePreset — structure Zod', () => {
  it('accepte un preset minimal valide', () => {
    const r = validatePreset(validBase);
    expect(r.ok).toBe(true);
  });

  it('rejette un id qui ne matche pas [a-z0-9-]+', () => {
    const r = validatePreset({ ...validBase, id: 'Invalid_ID' });
    expect(r.ok).toBe(false);
  });

  it('rejette une locale hors enum', () => {
    const r = validatePreset({ ...validBase, locale: 'de' });
    expect(r.ok).toBe(false);
  });
});

describe('validatePreset — contraintes cross-champs', () => {
  it('détecte un channel qui référence une catégorie inconnue', () => {
    const p = {
      ...validBase,
      channels: [
        {
          localId: 'chan-x',
          categoryLocalId: 'cat-ghost',
          name: 'x',
          type: 'text' as const,
          slowmodeSeconds: 0,
          readableBy: [],
          writableBy: [],
        },
      ],
    };
    const r = validatePreset(p);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.code === 'unknown_category_ref')).toBe(true);
    }
  });

  it('détecte un readableBy qui référence un rôle inconnu', () => {
    const p = {
      ...validBase,
      channels: [
        {
          localId: 'chan-x',
          categoryLocalId: 'cat-a',
          name: 'x',
          type: 'text' as const,
          slowmodeSeconds: 0,
          readableBy: ['role-ghost'],
          writableBy: [],
        },
      ],
    };
    const r = validatePreset(p);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.code === 'unknown_role_ref')).toBe(true);
    }
  });

  it('détecte un writableBy qui référence un rôle inconnu', () => {
    const p = {
      ...validBase,
      channels: [
        {
          localId: 'chan-x',
          categoryLocalId: 'cat-a',
          name: 'x',
          type: 'text' as const,
          slowmodeSeconds: 0,
          readableBy: [],
          writableBy: ['role-ghost'],
        },
      ],
    };
    const r = validatePreset(p);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.code === 'unknown_role_ref')).toBe(true);
    }
  });

  it('détecte un localId de rôle dupliqué', () => {
    const p = {
      ...validBase,
      roles: [
        {
          localId: 'dup',
          name: 'A',
          color: 0,
          permissionPreset: 'member-default' as const,
          hoist: false,
          mentionable: false,
        },
        {
          localId: 'dup',
          name: 'B',
          color: 0,
          permissionPreset: 'member-default' as const,
          hoist: false,
          mentionable: false,
        },
      ],
    };
    const r = validatePreset(p);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.code === 'duplicate_role_id')).toBe(true);
    }
  });

  it('refuse un preset qui dépasse le budget (R2)', () => {
    const tooMany = {
      ...validBase,
      roles: Array.from({ length: PRESET_OBJECT_BUDGET + 1 }, (_, i) => ({
        localId: `role-${i}`,
        name: `R${i}`,
        color: 0,
        permissionPreset: 'member-default' as const,
        hoist: false,
        mentionable: false,
      })),
      categories: [],
      channels: [],
      modules: [],
    };
    const r = validatePreset(tooMany);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.code === 'budget_exceeded')).toBe(true);
    }
  });

  it('exige nameFr et nameEn sur chaque objet quand locale=both', () => {
    const p = {
      ...validBase,
      locale: 'both' as const,
      // role sans nameFr/nameEn
    };
    const r = validatePreset(p);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.code === 'missing_locale_name')).toBe(true);
    }
  });

  it('exige topicFr + topicEn sur un channel qui a un topic quand locale=both', () => {
    const p = {
      ...validBase,
      locale: 'both' as const,
      roles: [
        {
          localId: 'role-a',
          name: 'A',
          nameFr: 'A',
          nameEn: 'A',
          color: 0,
          permissionPreset: 'member-default' as const,
          hoist: false,
          mentionable: false,
        },
      ],
      categories: [{ localId: 'cat-a', name: 'cat', nameFr: 'cat', nameEn: 'cat', position: 0 }],
      channels: [
        {
          localId: 'chan-a',
          categoryLocalId: 'cat-a',
          name: 'chan',
          nameFr: 'chan',
          nameEn: 'chan',
          type: 'text' as const,
          topic: 'xxx',
          // topicFr / topicEn absents
          slowmodeSeconds: 0,
          readableBy: [],
          writableBy: [],
        },
      ],
    };
    const r = validatePreset(p);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.code === 'missing_locale_topic')).toBe(true);
    }
  });
});

describe('assertValidPreset', () => {
  it('retourne le preset quand valide', () => {
    const p = assertValidPreset(validBase);
    expect(p.id).toBe('test-valid');
  });

  it('throw avec un message clair quand invalide', () => {
    expect(() => assertValidPreset({ ...validBase, id: 'Bad_ID' })).toThrow(/validatePreset/);
  });
});
