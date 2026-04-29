import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SecretField } from '../../components/setup/SecretField';

describe('SecretField', () => {
  const baseProps = {
    name: 'token',
    label: 'Token bot',
    showLabel: 'Afficher',
    hideLabel: 'Masquer',
  } as const;

  it('rend l input en type=password par défaut, le bouton sur « Afficher »', () => {
    render(<SecretField {...baseProps} />);
    const input = screen.getByLabelText('Token bot') as HTMLInputElement;
    expect(input.type).toBe('password');
    const toggle = screen.getByRole('button', { name: 'Afficher' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('bascule à type=text au click, label « Masquer », aria-pressed=true', () => {
    render(<SecretField {...baseProps} />);
    const input = screen.getByLabelText('Token bot') as HTMLInputElement;
    const toggle = screen.getByRole('button', { name: 'Afficher' });

    fireEvent.click(toggle);

    expect(input.type).toBe('text');
    const newToggle = screen.getByRole('button', { name: 'Masquer' });
    expect(newToggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('repasse à password au second click — le toggle est bien idempotent', () => {
    render(<SecretField {...baseProps} />);
    const input = screen.getByLabelText('Token bot') as HTMLInputElement;
    const toggle = screen.getByRole('button', { name: 'Afficher' });

    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: 'Masquer' }));

    expect(input.type).toBe('password');
    expect(screen.getByRole('button', { name: 'Afficher' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('attache placeholder, defaultValue, hint, et required quand fournis', () => {
    render(
      <SecretField
        {...baseProps}
        placeholder="Collez le token ici"
        defaultValue="initial-secret"
        hint="Ne le partagez jamais"
        required
      />,
    );
    const input = screen.getByLabelText('Token bot') as HTMLInputElement;
    expect(input.placeholder).toBe('Collez le token ici');
    expect(input.value).toBe('initial-secret');
    expect(input.required).toBe(true);
    expect(screen.getByText('Ne le partagez jamais')).toBeDefined();
  });
});
