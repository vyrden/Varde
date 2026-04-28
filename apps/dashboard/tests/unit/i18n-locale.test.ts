import { describe, expect, it } from 'vitest';

import { isLocale, locales } from '../../i18n/config';
import { parseAcceptLanguage } from '../../i18n/locale';

describe('i18n config', () => {
  it('expose les locales V1 attendues', () => {
    expect(locales).toEqual(['fr', 'en']);
  });

  it('isLocale accepte les locales déclarées', () => {
    expect(isLocale('fr')).toBe(true);
    expect(isLocale('en')).toBe(true);
  });

  it('isLocale refuse une locale non supportée', () => {
    expect(isLocale('de')).toBe(false);
    expect(isLocale('en-US')).toBe(false);
    expect(isLocale('')).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe('parseAcceptLanguage', () => {
  it('retourne la première locale supportée', () => {
    expect(parseAcceptLanguage('en-US,en;q=0.9,fr;q=0.8')).toBe('en');
  });

  it('descend au tag primaire (fr-CA → fr)', () => {
    expect(parseAcceptLanguage('fr-CA,fr;q=0.9')).toBe('fr');
  });

  it('saute les langues non supportées', () => {
    expect(parseAcceptLanguage('de-DE,de;q=0.9,fr;q=0.8')).toBe('fr');
  });

  it('retourne undefined si aucune langue supportée', () => {
    expect(parseAcceptLanguage('de-DE,it;q=0.9')).toBeUndefined();
  });

  it('tolère les espaces et qualités', () => {
    expect(parseAcceptLanguage('  en-GB ; q=0.7,  fr ; q=0.9')).toBe('en');
  });

  it('tolère un en-tête vide', () => {
    expect(parseAcceptLanguage('')).toBeUndefined();
  });
});
