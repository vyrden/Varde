import { describe, expect, it } from 'vitest';

import { countFieldChanges } from '../../lib/count-field-changes';

describe('countFieldChanges', () => {
  it('renvoie 0 quand state et initial sont identiques', () => {
    const state = { a: 'foo', b: true, c: 'bar' };
    expect(countFieldChanges(state, state)).toBe(0);
  });

  it('renvoie 0 quand toutes les paires sont identiques (objets distincts)', () => {
    const initial = { a: 'foo', b: true };
    const current = { a: 'foo', b: true };
    expect(countFieldChanges(initial, current)).toBe(0);
  });

  it('compte chaque champ différent (strings)', () => {
    const initial = { a: 'foo', b: 'bar', c: 'baz' };
    const current = { a: 'FOO', b: 'bar', c: 'BAZ' };
    expect(countFieldChanges(initial, current)).toBe(2);
  });

  it('compte les champs où le booléen change', () => {
    const initial = { enabled: true, debug: false };
    const current = { enabled: false, debug: false };
    expect(countFieldChanges(initial, current)).toBe(1);
  });

  it('compte un champ ajouté côté current (path apparu)', () => {
    const initial = { a: 'foo' };
    const current = { a: 'foo', b: 'new' };
    expect(countFieldChanges(initial, current)).toBe(1);
  });

  it('compte un champ retiré côté current (path disparu)', () => {
    const initial = { a: 'foo', b: 'bar' };
    const current = { a: 'foo' };
    expect(countFieldChanges(initial, current)).toBe(1);
  });

  it('combine ajouts, retraits et modifications', () => {
    const initial = { a: 'foo', b: 'bar', c: true };
    const current = { a: 'FOO', b: 'bar', d: 'new' };
    // a modifié, c retiré, d ajouté → 3 changements
    expect(countFieldChanges(initial, current)).toBe(3);
  });

  it('considère "" et undefined comme équivalents (champ non saisi)', () => {
    // Cas typique : un champ optionnel string laissé vide est `''`
    // côté form state ; côté initial il peut être absent. On ne
    // compte pas ça comme un changement — sinon le compteur clignote
    // dès qu'on touche un champ optionnel.
    const initial = { a: 'foo' };
    const current = { a: 'foo', b: '' };
    expect(countFieldChanges(initial, current)).toBe(0);
  });

  it('considère "" → undefined (suppression du vide) comme no-op', () => {
    const initial = { a: 'foo', b: '' };
    const current = { a: 'foo' };
    expect(countFieldChanges(initial, current)).toBe(0);
  });

  it('traite false comme une vraie valeur (pas un vide)', () => {
    // false n'est PAS équivalent à undefined : un toggle explicitement
    // mis à false est une vraie valeur.
    const initial = { enabled: true };
    const current = { enabled: false };
    expect(countFieldChanges(initial, current)).toBe(1);
  });

  it('renvoie 0 sur deux objets vides', () => {
    expect(countFieldChanges({}, {})).toBe(0);
  });
});
