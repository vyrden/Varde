import { describe, expect, it } from 'vitest';

import { formatDuration, parseDuration } from '../../src/duration.js';

describe('parseDuration', () => {
  it('parse les unités simples 30s, 15m, 2h, 7d', () => {
    expect(parseDuration('30s')).toBe(30_000);
    expect(parseDuration('15m')).toBe(15 * 60_000);
    expect(parseDuration('2h')).toBe(2 * 3_600_000);
    expect(parseDuration('7d')).toBe(7 * 86_400_000);
  });

  it('combine plusieurs unités : 1d2h30m', () => {
    expect(parseDuration('1d2h30m')).toBe(86_400_000 + 2 * 3_600_000 + 30 * 60_000);
  });

  it('tolère les espaces', () => {
    expect(parseDuration(' 1h 30m ')).toBe(3_600_000 + 30 * 60_000);
  });

  it('insensible à la casse', () => {
    expect(parseDuration('1H30M')).toBe(3_600_000 + 30 * 60_000);
  });

  it('retourne null pour une chaîne vide ou non parseable', () => {
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('5x')).toBeNull();
    expect(parseDuration('1h xyz')).toBeNull();
  });

  it('retourne null si aucune unité reconnue', () => {
    expect(parseDuration('30')).toBeNull();
  });
});

describe('formatDuration', () => {
  it('formate 30s en "30s"', () => {
    expect(formatDuration(30_000)).toBe('30s');
  });

  it('formate 1h30m en "1h30m"', () => {
    expect(formatDuration(3_600_000 + 30 * 60_000)).toBe('1h30m');
  });

  it('formate 2d3h en "2d3h"', () => {
    expect(formatDuration(2 * 86_400_000 + 3 * 3_600_000)).toBe('2d3h');
  });

  it('inverse parseDuration : roundtrip', () => {
    const inputs = ['30s', '15m', '2h', '7d', '1d2h30m', '90s'];
    for (const input of inputs) {
      const ms = parseDuration(input);
      expect(ms).not.toBeNull();
      const back = formatDuration(ms ?? 0);
      expect(parseDuration(back)).toBe(ms);
    }
  });

  it('retourne "0s" pour 0 ou valeur invalide', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(-1)).toBe('0s');
    expect(formatDuration(Number.NaN)).toBe('0s');
  });
});
