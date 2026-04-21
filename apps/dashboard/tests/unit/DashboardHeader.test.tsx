import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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

  it('utilise un formulaire qui POST sur /api/auth/signout (signout server-side)', () => {
    const { container } = render(<DashboardHeader />);
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    expect(form?.getAttribute('action')).toBe('/api/auth/signout');
    expect(form?.getAttribute('method')).toBe('post');
  });
});
