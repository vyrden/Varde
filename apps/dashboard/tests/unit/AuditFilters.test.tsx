import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AuditFilters } from '../../components/AuditFilters';

describe('AuditFilters', () => {
  it('soumet un GET vers /guilds/:id/audit et reset le cursor implicitement', () => {
    const { container } = render(<AuditFilters guildId="g1" values={{}} knownActions={[]} />);
    const form = container.querySelector('form');
    expect(form?.getAttribute('method')).toBe('get');
    expect(form?.getAttribute('action')).toBe('/guilds/g1/audit');
    // Pas de champ `cursor` dans le form → submit reset la pagination
    expect(container.querySelector('input[name="cursor"]')).toBeNull();
  });

  it('pré-remplit les champs depuis les values', () => {
    render(
      <AuditFilters
        guildId="g1"
        values={{
          action: 'core.config.updated',
          actorType: 'user',
          severity: 'warn',
          since: '2026-01-01T00:00',
          until: '2026-12-31T23:59',
        }}
        knownActions={['core.config.updated']}
      />,
    );
    expect((screen.getByLabelText('Action') as HTMLInputElement).value).toBe('core.config.updated');
    expect((screen.getByLabelText("Type d'acteur") as HTMLSelectElement).value).toBe('user');
    expect((screen.getByLabelText('Sévérité') as HTMLSelectElement).value).toBe('warn');
  });

  it('expose les actions connues comme suggestions datalist', () => {
    const { container } = render(
      <AuditFilters
        guildId="g1"
        values={{}}
        knownActions={['core.config.updated', 'moderation.warn']}
      />,
    );
    const options = container.querySelectorAll('datalist#audit-action-suggestions option');
    const values = Array.from(options).map((o) => o.getAttribute('value'));
    expect(values).toEqual(['core.config.updated', 'moderation.warn']);
  });
});
