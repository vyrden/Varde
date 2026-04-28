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

// Mock de `next-intl/server` pour que `getTranslations(namespace)`
// résolve les clés contre le vrai fichier `messages/fr.json` —
// comme ça les tests vérifient les vraies chaînes affichées à
// l'utilisateur, sans tirer next-intl côté client (qui demande un
// provider et un contexte de requête).
vi.mock('next-intl/server', async () => {
  const { default: messages } = (await import('../../messages/fr.json')) as {
    default: Record<string, unknown>;
  };
  return {
    getTranslations: async (namespace: string) => (key: string) => {
      const path = `${namespace}.${key}`.split('.');
      let cursor: unknown = messages;
      for (const segment of path) {
        if (typeof cursor === 'object' && cursor !== null && segment in cursor) {
          cursor = (cursor as Record<string, unknown>)[segment];
        } else {
          return key;
        }
      }
      return typeof cursor === 'string' ? cursor : key;
    },
  };
});

import { DashboardHeader } from '../../components/DashboardHeader';

describe('DashboardHeader', () => {
  it('affiche la marque Varde et le bouton de déconnexion', async () => {
    render(await DashboardHeader({}));
    expect(screen.getByText('Varde')).toBeDefined();
    expect(screen.getByRole('button', { name: /Se déconnecter/i })).toBeDefined();
  });

  it('affiche le nom utilisateur quand fourni', async () => {
    render(await DashboardHeader({ userName: 'Alice' }));
    expect(screen.getByText('Alice')).toBeDefined();
  });

  it('masque le nom quand null et garde le bouton de déconnexion', async () => {
    render(await DashboardHeader({ userName: null }));
    expect(screen.queryByText('Alice')).toBeNull();
    expect(screen.getByRole('button', { name: /Se déconnecter/i })).toBeDefined();
  });

  it('enveloppe le bouton dans un formulaire (server action signOut)', async () => {
    const { container } = render(await DashboardHeader({}));
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    // L'action est une server action (function), pas une URL — on vérifie
    // que le form existe et encadre bien le bouton submit.
    const button = form?.querySelector('button[type="submit"]');
    expect(button).not.toBeNull();
  });
});
