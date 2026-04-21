import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ServerList } from '../../components/ServerList';
import type { AdminGuildDto } from '../../lib/api-client';

const guild = (id: string, name: string, iconUrl: string | null = null): AdminGuildDto => ({
  id,
  name,
  iconUrl,
});

describe('ServerList', () => {
  it('affiche un EmptyState quand aucune guild', () => {
    render(<ServerList guilds={[]} />);
    expect(screen.getByText('Aucun serveur à afficher')).toBeDefined();
  });

  it('rend une carte par guild avec un lien vers /servers/:id', () => {
    render(
      <ServerList guilds={[guild('111', 'Alpha'), guild('222', 'Beta', 'https://cdn/icon.png')]} />,
    );
    const alpha = screen.getByRole('link', { name: /Alpha/i });
    const beta = screen.getByRole('link', { name: /Beta/i });
    expect(alpha.getAttribute('href')).toBe('/servers/111');
    expect(beta.getAttribute('href')).toBe('/servers/222');
  });

  it('affiche les initiales quand iconUrl est null', () => {
    render(<ServerList guilds={[guild('111', 'Alpha')]} />);
    expect(screen.getByText('AL')).toBeDefined();
  });
});
