import { describe, expect, it } from 'vitest';

import { isUlid, newUlid, parseUlid, ulidTimestamp } from '../../src/ulid.js';

describe('ULID', () => {
  it('newUlid produit une chaîne de 26 caractères', () => {
    const id = newUlid();
    expect(id).toHaveLength(26);
  });

  it('newUlid produit un ULID reconnu valide par isUlid', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(isUlid(newUlid())).toBe(true);
    }
  });

  it('newUlid est monotone au sein du même processus', () => {
    const ids = Array.from({ length: 20 }, () => newUlid());
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });

  it('isUlid refuse les chaînes invalides', () => {
    expect(isUlid('')).toBe(false);
    expect(isUlid('ABC')).toBe(false);
    expect(isUlid('01AN4Z07BY79KA1307SR9X4MVI')).toBe(false);
  });

  it('isUlid accepte un ULID de référence', () => {
    expect(isUlid('01AN4Z07BY79KA1307SR9X4MV0')).toBe(true);
  });

  it('isUlid refuse les non-strings', () => {
    expect(isUlid(123)).toBe(false);
    expect(isUlid(null)).toBe(false);
    expect(isUlid(undefined)).toBe(false);
  });

  it('parseUlid renvoie null sur invalide et la valeur sur valide', () => {
    expect(parseUlid('invalid')).toBe(null);
    expect(parseUlid('01AN4Z07BY79KA1307SR9X4MV0')).toBe('01AN4Z07BY79KA1307SR9X4MV0');
  });

  it('ulidTimestamp extrait un timestamp ms cohérent avec Date.now', () => {
    const before = Date.now();
    const id = newUlid();
    const after = Date.now();
    const ts = ulidTimestamp(id);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});
