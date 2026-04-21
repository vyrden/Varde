import { ValidationError } from '@varde/contracts';
import { describe, expect, it } from 'vitest';

import { fromCanonicalDate, toCanonicalDate } from '../../src/helpers.js';

describe('toCanonicalDate', () => {
  it('sérialise un Date en ISO 8601 UTC avec millisecondes et Z', () => {
    const date = new Date('2026-04-20T18:30:15.123Z');
    expect(toCanonicalDate(date)).toBe('2026-04-20T18:30:15.123Z');
  });

  it('accepte un timestamp numérique en millisecondes', () => {
    const ms = Date.UTC(2026, 3, 20, 18, 30, 15, 123);
    expect(toCanonicalDate(ms)).toBe('2026-04-20T18:30:15.123Z');
  });

  it('accepte une chaîne ISO parseable', () => {
    expect(toCanonicalDate('2026-04-20T00:00:00+02:00')).toBe('2026-04-19T22:00:00.000Z');
  });

  it('rejette une valeur non parseable', () => {
    expect(() => toCanonicalDate('pas-une-date')).toThrow(ValidationError);
  });

  it('rejette un nombre NaN', () => {
    expect(() => toCanonicalDate(Number.NaN)).toThrow(ValidationError);
  });
});

describe('fromCanonicalDate', () => {
  it('reconstruit le Date attendu', () => {
    const date = fromCanonicalDate('2026-04-20T18:30:15.123Z');
    expect(date.toISOString()).toBe('2026-04-20T18:30:15.123Z');
  });

  it('rejette une chaîne non parseable', () => {
    expect(() => fromCanonicalDate('pas-une-date')).toThrow(ValidationError);
  });
});
