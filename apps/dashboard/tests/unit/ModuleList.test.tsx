import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ModuleList } from '../../components/ModuleList';
import type { ModuleListItemDto } from '../../lib/api-client';

const mod = (
  id: string,
  name: string,
  enabled: boolean,
  description = 'desc',
): ModuleListItemDto => ({
  id,
  name,
  version: '1.0.0',
  description,
  enabled,
  permissions: [],
  category: null,
  icon: null,
  shortDescription: null,
  isPinned: false,
  lastConfiguredAt: null,
});

describe('ModuleList', () => {
  it('affiche un EmptyState quand aucun module', () => {
    render(<ModuleList guildId="g1" modules={[]} />);
    expect(screen.getByText('Aucun module chargé')).toBeDefined();
  });

  it('rend un lien par module vers la page de config', () => {
    render(
      <ModuleList
        guildId="g1"
        modules={[mod('hello-world', 'Hello World', true), mod('welcome', 'Welcome', false)]}
      />,
    );
    const helloLink = screen.getByRole('link', { name: /Hello World/i });
    const welcomeLink = screen.getByRole('link', { name: /Welcome/i });
    expect(helloLink.getAttribute('href')).toBe('/guilds/g1/modules/hello-world');
    expect(welcomeLink.getAttribute('href')).toBe('/guilds/g1/modules/welcome');
  });

  it("expose un toggle d'activation par module via aria-label dynamique", () => {
    render(<ModuleList guildId="g1" modules={[mod('a', 'A', true), mod('b', 'B', false)]} />);
    // Toggle Discord-style : <button role="switch"> avec aria-label
    // « Désactiver A » (déjà actif) et « Activer B » (désactivé).
    expect(screen.getByRole('switch', { name: /Désactiver A/i })).toBeDefined();
    expect(screen.getByRole('switch', { name: /Activer B/i })).toBeDefined();
  });

  it('rend un badge "Système" pour hello-world (sans toggle)', () => {
    render(<ModuleList guildId="g1" modules={[mod('hello-world', 'Hello World', true)]} />);
    expect(screen.getByText('Système')).toBeDefined();
    // Pas de toggle pour le module système
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('retombe sur un texte par défaut si description vide', () => {
    render(<ModuleList guildId="g1" modules={[mod('a', 'A', true, '')]} />);
    expect(screen.getByText(/Aucune description fournie/)).toBeDefined();
  });

  it('filtre par texte (nom, id, description) via la barre de recherche', () => {
    render(
      <ModuleList
        guildId="g1"
        modules={[
          mod('welcome', 'Welcome', true, 'Accueil des nouveaux membres'),
          mod('logs', 'Logs', true, 'Journal des évènements'),
          mod('reaction-roles', 'Roles via réactions', false, 'Self-assign de rôles'),
        ]}
      />,
    );
    const search = screen.getByLabelText('Rechercher un module');
    fireEvent.change(search, { target: { value: 'accueil' } });
    expect(screen.queryByRole('link', { name: /^Logs/i })).toBeNull();
    expect(screen.getByRole('link', { name: /Welcome/i })).toBeDefined();
  });

  it('segment Inactifs filtre les modules désactivés', () => {
    render(
      <ModuleList
        guildId="g1"
        modules={[mod('a', 'A', true), mod('b', 'B', false), mod('c', 'C', false)]}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /^Inactifs/i }));
    expect(screen.queryByRole('link', { name: /^A/i })).toBeNull();
    expect(screen.getByRole('link', { name: /^B/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /^C/i })).toBeDefined();
  });

  it('affiche un empty state quand le filtre ne matche rien', () => {
    render(<ModuleList guildId="g1" modules={[mod('a', 'A', true)]} />);
    fireEvent.change(screen.getByLabelText('Rechercher un module'), {
      target: { value: 'inexistant' },
    });
    expect(screen.getByRole('heading', { name: /Aucun module ne correspond/i })).toBeDefined();
  });
});
