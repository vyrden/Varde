import { describe, expect, it } from 'vitest';

import { createUIService, isUIMessage } from '../../src/ui.js';

describe('createUIService', () => {
  it('embed() produit un UIMessage kind="embed" figé', () => {
    const ui = createUIService();
    const message = ui.embed({ title: 'Bienvenue', description: 'Salut !' });
    expect(message).toEqual({
      kind: 'embed',
      payload: { title: 'Bienvenue', description: 'Salut !' },
    });
    expect(Object.isFrozen(message)).toBe(true);
    expect(Object.isFrozen(message.payload)).toBe(true);
  });

  it('embed() accepte un payload partiel', () => {
    const ui = createUIService();
    const message = ui.embed({ title: 'Titre seul' });
    expect(message.payload).toEqual({ title: 'Titre seul' });
  });

  it('success() emballe le message', () => {
    const ui = createUIService();
    expect(ui.success('Sauvegardé')).toEqual({
      kind: 'success',
      payload: { message: 'Sauvegardé' },
    });
  });

  it('error() emballe le message', () => {
    const ui = createUIService();
    expect(ui.error('Pas autorisé')).toEqual({
      kind: 'error',
      payload: { message: 'Pas autorisé' },
    });
  });

  it("confirm() applique les labels par défaut en l'absence de valeurs", () => {
    const ui = createUIService();
    expect(ui.confirm({ message: 'Supprimer ?' })).toEqual({
      kind: 'confirm',
      payload: { message: 'Supprimer ?', confirmLabel: 'Confirmer', cancelLabel: 'Annuler' },
    });
  });

  it('confirm() accepte des labels personnalisés', () => {
    const ui = createUIService();
    const message = ui.confirm({
      message: 'Bannir Alice ?',
      confirmLabel: 'Bannir',
      cancelLabel: 'Non, garder',
    });
    expect(message.payload).toEqual({
      message: 'Bannir Alice ?',
      confirmLabel: 'Bannir',
      cancelLabel: 'Non, garder',
    });
  });
});

describe('isUIMessage', () => {
  it('accepte un UIMessage produit par la factory', () => {
    const ui = createUIService();
    expect(isUIMessage(ui.success('ok'))).toBe(true);
  });

  it('refuse un objet non-figé au bon shape', () => {
    expect(isUIMessage({ kind: 'success', payload: { message: 'ok' } })).toBe(false);
  });

  it('refuse un kind inconnu', () => {
    const fake = Object.freeze({ kind: 'inconnu', payload: {} });
    expect(isUIMessage(fake)).toBe(false);
  });

  it('refuse une valeur primitive', () => {
    expect(isUIMessage(null)).toBe(false);
    expect(isUIMessage('ok')).toBe(false);
    expect(isUIMessage(42)).toBe(false);
  });
});
