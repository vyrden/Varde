import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EmptyState } from '../../src/components/EmptyState.js';

describe('EmptyState', () => {
  it('rend le titre et la description', () => {
    render(<EmptyState title="Aucun serveur" description="Ajoutez le bot pour commencer." />);
    expect(screen.getByText('Aucun serveur')).toBeDefined();
    expect(screen.getByText('Ajoutez le bot pour commencer.')).toBeDefined();
  });

  it('masque la description si absente', () => {
    render(<EmptyState title="Vide" />);
    expect(screen.queryByText('Vide')).toBeDefined();
  });

  it('affiche l action quand elle est fournie', () => {
    render(<EmptyState title="Vide" action={<button type="button">Ajouter</button>} />);
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeDefined();
  });
});
