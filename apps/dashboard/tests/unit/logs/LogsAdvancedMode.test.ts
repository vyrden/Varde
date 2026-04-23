import { describe, expect, it } from 'vitest';

import { parseUserIdInput, parseUserIdList } from '../../../components/logs/LogsAdvancedMode';

describe('parseUserIdInput', () => {
  it('accepte une mention standard <@123456789012345678>', () => {
    expect(parseUserIdInput('<@123456789012345678>')).toBe('123456789012345678');
  });

  it("accepte une mention avec point d'exclamation <@!123456789012345678>", () => {
    expect(parseUserIdInput('<@!123456789012345678>')).toBe('123456789012345678');
  });

  it('accepte un snowflake brut de 17 chiffres', () => {
    expect(parseUserIdInput('12345678901234567')).toBe('12345678901234567');
  });

  it('accepte un snowflake brut de 19 chiffres', () => {
    expect(parseUserIdInput('1234567890123456789')).toBe('1234567890123456789');
  });

  it("ignore les espaces autour de l'entree", () => {
    expect(parseUserIdInput('  123456789012345678  ')).toBe('123456789012345678');
  });

  it('retourne null pour un texte arbitraire', () => {
    expect(parseUserIdInput('foo')).toBeNull();
  });

  it('retourne null pour un ID trop court (< 17 chiffres)', () => {
    expect(parseUserIdInput('1234567890')).toBeNull();
  });

  it('retourne null pour un ID trop long (> 19 chiffres)', () => {
    expect(parseUserIdInput('12345678901234567890')).toBeNull();
  });

  it('retourne null pour une mention malformee sans chiffres', () => {
    expect(parseUserIdInput('<@abc>')).toBeNull();
  });
});

describe('parseUserIdList', () => {
  it('parse une liste mixte mentions + snowflakes', () => {
    const result = parseUserIdList('<@123456789012345678>, 98765432109876543');
    expect(result.ok).toEqual(['123456789012345678', '98765432109876543']);
    expect(result.invalid).toEqual([]);
  });

  it('separe les entrees valides des entrees invalides', () => {
    const result = parseUserIdList('123456789012345678, foo, bar, 98765432109876543');
    expect(result.ok).toEqual(['123456789012345678', '98765432109876543']);
    expect(result.invalid).toEqual(['foo', 'bar']);
  });

  it('retourne des tableaux vides pour une chaine vide', () => {
    const result = parseUserIdList('');
    expect(result.ok).toEqual([]);
    expect(result.invalid).toEqual([]);
  });

  it('ignore les espaces autour des virgules', () => {
    const result = parseUserIdList('  123456789012345678  ,  98765432109876543  ');
    expect(result.ok).toEqual(['123456789012345678', '98765432109876543']);
  });
});
