import { describe, expect, it } from 'vitest';

import { PRESET_CATALOG } from '../../src/catalog/index.js';
import { validatePreset } from '../../src/validator.js';

/**
 * Contrat de base du catalogue : chaque preset hand-curated doit
 * passer `validatePreset` sans issue. Ce test est le filet
 * automatique contre les dérives (ajout d'un preset cassé, modif
 * d'un existant qui casserait une contrainte cross-champs).
 */
describe('PRESET_CATALOG', () => {
  it('ne contient pas de doublon d id', () => {
    const ids = PRESET_CATALOG.map((p) => p.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('contient au moins 5 presets V1', () => {
    expect(PRESET_CATALOG.length).toBeGreaterThanOrEqual(5);
  });

  for (const preset of PRESET_CATALOG) {
    it(`preset "${preset.id}" passe la meta-validation`, () => {
      const result = validatePreset(preset);
      if (!result.ok) {
        const summary = result.issues
          .map((iss) => `${iss.code} @ ${iss.path.join('.')} — ${iss.message}`)
          .join('\n');
        throw new Error(`preset "${preset.id}" invalide :\n${summary}`);
      }
      expect(result.ok).toBe(true);
    });
  }
});

describe('PRESET_CATALOG — bindings logs.config.manage', () => {
  it('tech et gaming portent le binding logs.config.manage → role-mod', () => {
    const tech = PRESET_CATALOG.find((p) => p.id === 'community-tech-small');
    const gaming = PRESET_CATALOG.find((p) => p.id === 'community-gaming-small');
    expect(tech?.permissionBindings).toContainEqual({
      permissionId: 'logs.config.manage',
      roleLocalId: 'role-mod',
    });
    expect(gaming?.permissionBindings).toContainEqual({
      permissionId: 'logs.config.manage',
      roleLocalId: 'role-mod',
    });
  });

  it('creative, study, starter restent avec permissionBindings vide (pas de rôle mod par dessein)', () => {
    const expectedEmptyIds = [
      'community-creative',
      'community-study-group',
      'community-generic-starter',
    ];
    for (const id of expectedEmptyIds) {
      const preset = PRESET_CATALOG.find((p) => p.id === id);
      expect(preset, `preset ${id} attendu dans le catalog`).toBeDefined();
      expect(preset?.permissionBindings).toEqual([]);
    }
  });
});
