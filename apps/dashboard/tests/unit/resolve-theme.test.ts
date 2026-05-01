import { describe, expect, it } from 'vitest';

import { normalizeStoredTheme, resolveEffectiveTheme } from '../../lib/resolve-theme';

describe('normalizeStoredTheme', () => {
  it('renvoie la valeur quand elle est valide', () => {
    expect(normalizeStoredTheme('light')).toBe('light');
    expect(normalizeStoredTheme('dark')).toBe('dark');
    expect(normalizeStoredTheme('system')).toBe('system');
  });

  it('renvoie "system" quand undefined', () => {
    expect(normalizeStoredTheme(undefined)).toBe('system');
  });

  it("renvoie 'system' quand vide ou invalide", () => {
    expect(normalizeStoredTheme('')).toBe('system');
    expect(normalizeStoredTheme('rainbow')).toBe('system');
    expect(normalizeStoredTheme('LIGHT')).toBe('system');
  });
});

describe('resolveEffectiveTheme', () => {
  it("renvoie 'dark' quand stored = 'dark'", () => {
    expect(resolveEffectiveTheme('dark', 'light')).toBe('dark');
    expect(resolveEffectiveTheme('dark', 'dark')).toBe('dark');
  });

  it("renvoie 'light' quand stored = 'light'", () => {
    expect(resolveEffectiveTheme('light', 'light')).toBe('light');
    expect(resolveEffectiveTheme('light', 'dark')).toBe('light');
  });

  it("suit la préférence système quand stored = 'system'", () => {
    expect(resolveEffectiveTheme('system', 'light')).toBe('light');
    expect(resolveEffectiveTheme('system', 'dark')).toBe('dark');
  });

  it("retombe sur dark quand la préférence système n'est pas connue (SSR)", () => {
    // SSR : pas d'accès à window.matchMedia. On choisit dark par
    // défaut puisque le dashboard est dark-first (D-06 du cadrage).
    expect(resolveEffectiveTheme('system', null)).toBe('dark');
  });

  it('retombe sur dark quand stored est null/undefined (cookie absent)', () => {
    expect(resolveEffectiveTheme(null, null)).toBe('dark');
    expect(resolveEffectiveTheme(undefined, null)).toBe('dark');
  });

  it('respecte la préférence système même quand stored est null', () => {
    expect(resolveEffectiveTheme(null, 'light')).toBe('light');
    expect(resolveEffectiveTheme(undefined, 'light')).toBe('light');
  });
});
