import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock de `../auth` : évite que vitest charge next-auth (qui importe
// `next/server` non résolvable en environnement de test). La vraie
// `signOut` est consommée à l'exécution via une server action, le
// composant ne la déclenche jamais côté render.
vi.mock('../../auth', () => ({
  signOut: vi.fn(),
  signIn: vi.fn(),
  auth: vi.fn(),
  handlers: {},
}));

import { DashboardHeader } from '../../components/DashboardHeader';

describe('DashboardHeader', () => {
  it('affiche la marque Varde et le bouton de déconnexion', () => {
    render(<DashboardHeader />);
    expect(screen.getByText('Varde')).toBeDefined();
    expect(screen.getByRole('button', { name: /Se déconnecter/i })).toBeDefined();
  });

  it('affiche le nom utilisateur quand fourni', () => {
    render(<DashboardHeader userName="Alice" />);
    expect(screen.getByText('Alice')).toBeDefined();
  });

  it('masque le nom quand null et garde le bouton de déconnexion', () => {
    render(<DashboardHeader userName={null} />);
    expect(screen.queryByText('Alice')).toBeNull();
    expect(screen.getByRole('button', { name: /Se déconnecter/i })).toBeDefined();
  });

  it('enveloppe le bouton dans un formulaire (server action signOut)', () => {
    const { container } = render(<DashboardHeader />);
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    // L'action est une server action (function), pas une URL — on vérifie
    // que le form existe et encadre bien le bouton submit.
    const button = form?.querySelector('button[type="submit"]');
    expect(button).not.toBeNull();
  });
});
