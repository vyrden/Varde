import { describe, expect, it } from 'vitest';

import { reorderPinnedModules } from '../../lib/reorder-pinned-modules';

const pin = (moduleId: string, position: number) => ({ moduleId, position });

describe('reorderPinnedModules', () => {
  it('retourne la liste inchangée si activeId === overId', () => {
    const before = [pin('a', 0), pin('b', 1), pin('c', 2)];
    const after = reorderPinnedModules(before, 'a', 'a');
    expect(after).toEqual(before);
  });

  it('retourne la liste inchangée si activeId est inconnu', () => {
    const before = [pin('a', 0), pin('b', 1)];
    const after = reorderPinnedModules(before, 'inconnu', 'a');
    expect(after).toEqual(before);
  });

  it('retourne la liste inchangée si overId est inconnu', () => {
    const before = [pin('a', 0), pin('b', 1)];
    const after = reorderPinnedModules(before, 'a', 'inconnu');
    expect(after).toEqual(before);
  });

  it('déplace un module vers une position plus basse (a → après c)', () => {
    const before = [pin('a', 0), pin('b', 1), pin('c', 2), pin('d', 3)];
    const after = reorderPinnedModules(before, 'a', 'c');
    expect(after).toEqual([pin('b', 0), pin('c', 1), pin('a', 2), pin('d', 3)]);
  });

  it('déplace un module vers une position plus haute (d → avant b)', () => {
    const before = [pin('a', 0), pin('b', 1), pin('c', 2), pin('d', 3)];
    const after = reorderPinnedModules(before, 'd', 'b');
    expect(after).toEqual([pin('a', 0), pin('d', 1), pin('b', 2), pin('c', 3)]);
  });

  it('renumérote les positions de 0 à N-1 après le move', () => {
    const before = [pin('a', 0), pin('b', 1), pin('c', 2)];
    const after = reorderPinnedModules(before, 'c', 'a');
    expect(after.map((p) => p.position)).toEqual([0, 1, 2]);
  });

  it('renumérote même quand les positions sources sont non-consécutives', () => {
    // Cas dégénéré : positions 0, 5, 10 (potentiellement dû à une
    // suppression antérieure pas encore renumérotée). Le résultat
    // doit toujours sortir des positions 0, 1, 2 propres.
    const before = [pin('a', 0), pin('b', 5), pin('c', 10)];
    const after = reorderPinnedModules(before, 'c', 'a');
    expect(after).toEqual([pin('c', 0), pin('a', 1), pin('b', 2)]);
  });

  it('préserve l ordre des autres modules quand on déplace un seul', () => {
    const before = [pin('a', 0), pin('b', 1), pin('c', 2), pin('d', 3), pin('e', 4)];
    const after = reorderPinnedModules(before, 'b', 'd');
    // b déplacé entre c et d (au passage : b prend la position de
    // d, d glisse d'un cran vers la gauche). Les autres restent
    // dans leur ordre relatif.
    expect(after.map((p) => p.moduleId)).toEqual(['a', 'c', 'd', 'b', 'e']);
  });

  it("est pur : ne mute pas l'entrée", () => {
    const before = [pin('a', 0), pin('b', 1)];
    const snapshot = JSON.parse(JSON.stringify(before));
    reorderPinnedModules(before, 'a', 'b');
    expect(before).toEqual(snapshot);
  });
});
