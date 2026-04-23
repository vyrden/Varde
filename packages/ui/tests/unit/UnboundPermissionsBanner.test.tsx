import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { UnboundPermissionsBanner } from '../../src/components/UnboundPermissionsBanner.js';

describe('UnboundPermissionsBanner', () => {
  afterEach(cleanup);

  it('ne rend rien si la liste est vide', () => {
    const { container } = render(
      <UnboundPermissionsBanner permissions={[]} configureHref="/bind" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('affiche un message pluriel avec le nombre et un lien CTA', () => {
    render(
      <UnboundPermissionsBanner
        permissions={[
          { id: 'logs.config.manage', description: 'Config logs' },
          { id: 'welcome.config.manage', description: 'Config welcome' },
        ]}
        configureHref="/guilds/g1/permissions"
      />,
    );
    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText(/2 permissions non liées/i)).toBeDefined();
    const link = screen.getByRole('link', { name: /configurer/i });
    expect(link).toBeDefined();
    expect((link as HTMLAnchorElement).getAttribute('href')).toBe('/guilds/g1/permissions');
  });

  it('affiche un message singulier pour 1 permission', () => {
    render(
      <UnboundPermissionsBanner
        permissions={[{ id: 'logs.config.manage', description: 'Config logs' }]}
        configureHref="/bind"
      />,
    );
    expect(screen.getByText(/1 permission non liée/i)).toBeDefined();
  });

  it("liste les permissions sous forme d'items", () => {
    render(
      <UnboundPermissionsBanner
        permissions={[
          { id: 'logs.config.manage', description: 'Config logs' },
          { id: 'welcome.config.manage', description: 'Config welcome' },
        ]}
        configureHref="/bind"
      />,
    );
    expect(screen.getByText('logs.config.manage')).toBeDefined();
    expect(screen.getByText('welcome.config.manage')).toBeDefined();
  });

  it('aria-live polite sur le role alert', () => {
    render(
      <UnboundPermissionsBanner
        permissions={[{ id: 'x.y', description: 'x' }]}
        configureHref="/bind"
      />,
    );
    const banner = screen.getByRole('alert');
    expect(banner.getAttribute('aria-live')).toBe('polite');
  });
});
