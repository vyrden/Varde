import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SetupStep } from '../../components/setup/SetupStep';

describe('SetupStep', () => {
  it('affiche titre, description et contenu', () => {
    render(
      <SetupStep title="Bienvenue" description="Sous-titre">
        <p>Contenu de l étape</p>
      </SetupStep>,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Bienvenue');
    expect(screen.getByText('Sous-titre')).toBeDefined();
    expect(screen.getByText('Contenu de l étape')).toBeDefined();
  });

  it('rend les actions primaire et secondaire dans le footer', () => {
    render(
      <SetupStep
        title="Étape"
        primaryAction={<button type="button">Continuer</button>}
        secondaryAction={<button type="button">Précédent</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Précédent' })).toBeDefined();
  });

  it('omet le footer quand aucune action n est fournie', () => {
    render(<SetupStep title="Étape" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('omet la description quand absente', () => {
    const { container } = render(<SetupStep title="Étape" />);
    expect(container.querySelector('h1')?.textContent).toBe('Étape');
  });
});
