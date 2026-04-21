import { render, screen } from '@testing-library/react';
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

  it('affiche un badge activé / désactivé selon enabled', () => {
    render(<ModuleList guildId="g1" modules={[mod('a', 'A', true), mod('b', 'B', false)]} />);
    expect(screen.getByText('Activé')).toBeDefined();
    expect(screen.getByText('Désactivé')).toBeDefined();
  });

  it('retombe sur un texte par défaut si description vide', () => {
    render(<ModuleList guildId="g1" modules={[mod('a', 'A', true, '')]} />);
    expect(screen.getByText(/Aucune description fournie/)).toBeDefined();
  });
});
