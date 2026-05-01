import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../auth', () => ({
  signOut: vi.fn(),
}));

// Stub du sélecteur de thème (jalon 7 PR 7.4.9) — il dépend du
// `ThemeProvider` et de `useTranslations`, deux contextes que les
// tests de `UserPanel` n'instancient pas. Le panneau garde sa
// fonction principale (avatar, nom, badge, logout) ; le picker est
// testé séparément via `ThemeMenu`.
vi.mock('../../components/theme/ThemeMenu', () => ({
  ThemeMenu: () => null,
}));

import { UserPanel } from '../../components/shell/UserPanel';

describe('UserPanel', () => {
  it('affiche le nom + initiale en avatar quand pas d image', () => {
    render(<UserPanel name="Vyrden" userRole="admin" />);
    expect(screen.getByText('Vyrden')).toBeDefined();
    // Initiale V dans le fallback avatar
    expect(screen.getByText('V')).toBeDefined();
  });

  it("badge 'Administrateur' avec classe destructive pour role=admin", () => {
    render(<UserPanel name="Alice" userRole="admin" />);
    const badge = screen.getByText('Administrateur');
    expect(badge.className).toContain('text-destructive');
  });

  it("badge 'Modérateur' avec classe primary pour role=moderator", () => {
    render(<UserPanel name="Bob" userRole="moderator" />);
    const badge = screen.getByText('Modérateur');
    expect(badge.className).toContain('text-primary');
  });

  it("expose un bouton 'Se déconnecter' avec aria-label", () => {
    render(<UserPanel name="X" userRole="admin" />);
    const btn = screen.getByRole('button', { name: /Se déconnecter/i });
    expect(btn).toBeDefined();
    expect(btn.getAttribute('type')).toBe('submit');
  });

  it("rend l'image Discord quand avatarUrl est fourni", () => {
    const { container } = render(
      <UserPanel name="Charlie" avatarUrl="https://cdn.discord/foo.png" userRole="admin" />,
    );
    // Avec une image, on doit trouver un <img> et PAS le div fallback initiale.
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    // Le fallback initiale (div aria-hidden avec une lettre) n'existe pas.
    const fallbackInitial = container.querySelector(
      'div[aria-hidden="true"].rounded-full.bg-primary',
    );
    expect(fallbackInitial).toBeNull();
  });
});
