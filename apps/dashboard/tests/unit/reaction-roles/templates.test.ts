import { describe, expect, it } from 'vitest';

import { TEMPLATES } from '../../../components/reaction-roles/templates';

describe('TEMPLATES', () => {
  it('contient exactement 6 templates', () => {
    expect(TEMPLATES).toHaveLength(6);
  });

  it('inclut les 6 ids attendus', () => {
    const ids = TEMPLATES.map((t) => t.id).sort();
    expect(ids).toEqual(['colors', 'continents', 'notifications', 'scratch', 'verify', 'zodiac']);
  });

  it('scratch est le seul template sans suggestions', () => {
    const scratch = TEMPLATES.find((t) => t.id === 'scratch');
    expect(scratch?.suggestions).toHaveLength(0);
  });

  it('verify a mode verifier et 1 suggestion', () => {
    const verify = TEMPLATES.find((t) => t.id === 'verify');
    expect(verify?.defaultMode).toBe('verifier');
    expect(verify?.suggestions).toHaveLength(1);
  });

  it('continents a mode unique et 5 suggestions', () => {
    const continents = TEMPLATES.find((t) => t.id === 'continents');
    expect(continents?.defaultMode).toBe('unique');
    expect(continents?.suggestions).toHaveLength(5);
  });

  it('zodiac a 12 suggestions (sous la limite Discord de 20)', () => {
    const zodiac = TEMPLATES.find((t) => t.id === 'zodiac');
    expect(zodiac?.suggestions).toHaveLength(12);
  });

  it('chaque suggestion a un emoji non-vide et un roleName non-vide', () => {
    for (const tmpl of TEMPLATES) {
      for (const sug of tmpl.suggestions) {
        expect(sug.emoji).toBeTruthy();
        expect(sug.roleName).toBeTruthy();
      }
    }
  });
});
