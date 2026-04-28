import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ValidationCheckList } from '../../components/setup/ValidationCheckList';
import type { SystemCheckResult } from '../../lib/setup-client';

const labels = {
  database: 'Connexion à la base de données',
  master_key: 'Clé de chiffrement',
  discord_connectivity: 'Connectivité Discord',
} as const;

describe('ValidationCheckList', () => {
  it('rend chaque check avec son libellé traduit', () => {
    const checks: SystemCheckResult[] = [
      { name: 'database', ok: true },
      { name: 'master_key', ok: true },
      { name: 'discord_connectivity', ok: true },
    ];
    render(ValidationCheckList({ checks, labels }));
    expect(screen.getByText('Connexion à la base de données')).toBeDefined();
    expect(screen.getByText('Clé de chiffrement')).toBeDefined();
    expect(screen.getByText('Connectivité Discord')).toBeDefined();
  });

  it('affiche le `detail` en sous-texte quand fourni', () => {
    const checks: SystemCheckResult[] = [
      { name: 'discord_connectivity', ok: false, detail: 'ENETUNREACH' },
    ];
    render(ValidationCheckList({ checks, labels }));
    expect(screen.getByText('ENETUNREACH')).toBeDefined();
  });

  it('marque le statut via aria-label OK / KO', () => {
    const checks: SystemCheckResult[] = [
      { name: 'database', ok: true },
      { name: 'master_key', ok: false, detail: 'longueur invalide' },
    ];
    render(ValidationCheckList({ checks, labels }));
    expect(screen.getAllByLabelText('OK')).toHaveLength(1);
    expect(screen.getAllByLabelText('KO')).toHaveLength(1);
  });

  it('chaque ligne porte un data-testid `check-<name>`', () => {
    const checks: SystemCheckResult[] = [
      { name: 'database', ok: true },
      { name: 'master_key', ok: true },
      { name: 'discord_connectivity', ok: true },
    ];
    render(ValidationCheckList({ checks, labels }));
    expect(screen.getByTestId('check-database')).toBeDefined();
    expect(screen.getByTestId('check-master_key')).toBeDefined();
    expect(screen.getByTestId('check-discord_connectivity')).toBeDefined();
  });
});
