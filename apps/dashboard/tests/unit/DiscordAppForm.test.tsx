import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DiscordAppForm, type DiscordAppFormCopy } from '../../components/setup/DiscordAppForm';

// Mock le module setup-actions pour intercepter `submitDiscordApp`.
// Sans ça, l'auto-validation tenterait un fetch réseau au runtime.
vi.mock('../../lib/setup-actions', () => ({
  submitDiscordApp: vi.fn(),
}));

import { submitDiscordApp } from '../../lib/setup-actions';

const copy: DiscordAppFormCopy = {
  appIdLabel: 'Identifiant d application',
  appIdPlaceholder: 'ex. 1212345678901234567',
  appIdFormatError: 'Doit faire 17 à 20 chiffres.',
  publicKeyLabel: 'Clé publique',
  publicKeyPlaceholder: '64 caractères hex',
  publicKeyFormatError: 'Doit faire 64 caractères hexadécimaux.',
  continueLabel: 'Continuer',
  previous: 'Précédent',
  successPrefix: 'Application Discord détectée :',
  validating: 'Validation en cours…',
  errors: {
    discord_app_not_found: 'App introuvable.',
    network_error: 'Erreur réseau.',
  },
};

const VALID_APP_ID = '987654321098765432';
const VALID_PUBLIC_KEY = 'a'.repeat(64);

describe('DiscordAppForm — auto-validation (PR 7.7)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(submitDiscordApp).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('bouton Continuer désactivé tant que rien n est saisi', () => {
    render(<DiscordAppForm copy={copy} />);
    expect(screen.getByTestId('discord-app-continue-disabled')).toBeDefined();
    expect(screen.queryByTestId('discord-app-continue')).toBeNull();
  });

  it('format check inline rouge sur App ID trop court', () => {
    render(<DiscordAppForm copy={copy} />);
    const input = screen.getByTestId('discord-app-id-input');
    fireEvent.change(input, { target: { value: '12345' } });
    expect(screen.getByTestId('discord-app-id-format-error').textContent).toBe(
      'Doit faire 17 à 20 chiffres.',
    );
  });

  it('format check vert quand App ID OK + Public Key OK, mais pas d appel API tant que pas debounce', () => {
    vi.mocked(submitDiscordApp).mockResolvedValue({
      kind: 'success',
      data: { appName: 'Mon Bot' },
    });
    render(<DiscordAppForm copy={copy} />);
    fireEvent.change(screen.getByTestId('discord-app-id-input'), {
      target: { value: VALID_APP_ID },
    });
    fireEvent.change(screen.getByTestId('discord-public-key-input'), {
      target: { value: VALID_PUBLIC_KEY },
    });
    // Avant le debounce 500 ms : pas d'appel API.
    expect(submitDiscordApp).not.toHaveBeenCalled();
    // Pas d'erreur format affichée.
    expect(screen.queryByTestId('discord-app-id-format-error')).toBeNull();
    expect(screen.queryByTestId('discord-public-key-format-error')).toBeNull();
  });

  it('après debounce 500 ms et succès Discord, affiche le nom + active Continuer', async () => {
    vi.mocked(submitDiscordApp).mockResolvedValue({
      kind: 'success',
      data: { appName: 'Mon Bot Cool' },
    });
    render(<DiscordAppForm copy={copy} />);
    fireEvent.change(screen.getByTestId('discord-app-id-input'), {
      target: { value: VALID_APP_ID },
    });
    fireEvent.change(screen.getByTestId('discord-public-key-input'), {
      target: { value: VALID_PUBLIC_KEY },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await vi.runAllTimersAsync();
    });
    // L'action serveur a été appelée une fois (avec un FormData
    // contenant les deux champs).
    expect(submitDiscordApp).toHaveBeenCalledTimes(1);
    const firstCall = vi.mocked(submitDiscordApp).mock.calls[0];
    if (!firstCall) throw new Error('submitDiscordApp call introuvable');
    const formData = firstCall[1];
    expect((formData as FormData).get('appId')).toBe(VALID_APP_ID);
    expect((formData as FormData).get('publicKey')).toBe(VALID_PUBLIC_KEY);
    expect(screen.getByTestId('discord-app-success').textContent).toContain('Mon Bot Cool');
    expect(screen.getByTestId('discord-app-continue')).toBeDefined();
  });

  it('erreur Discord (app_not_found) : bandeau rouge + Continuer reste désactivé', async () => {
    vi.mocked(submitDiscordApp).mockResolvedValue({
      kind: 'error',
      code: 'discord_app_not_found',
      message: 'raw msg',
    });
    render(<DiscordAppForm copy={copy} />);
    fireEvent.change(screen.getByTestId('discord-app-id-input'), {
      target: { value: VALID_APP_ID },
    });
    fireEvent.change(screen.getByTestId('discord-public-key-input'), {
      target: { value: VALID_PUBLIC_KEY },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await vi.runAllTimersAsync();
    });
    // Le mapping copy.errors[code] est utilisé, pas le message brut.
    expect(screen.getByTestId('discord-app-error').textContent).toBe('App introuvable.');
    expect(screen.queryByTestId('discord-app-continue')).toBeNull();
    expect(screen.getByTestId('discord-app-continue-disabled')).toBeDefined();
  });

  it('valeurs initiales valides : démarrage en mode `valid` sans tirer Discord', () => {
    vi.mocked(submitDiscordApp).mockResolvedValue({
      kind: 'success',
      data: { appName: 'Persisted' },
    });
    render(
      <DiscordAppForm
        copy={copy}
        initialAppId={VALID_APP_ID}
        initialPublicKey={VALID_PUBLIC_KEY}
      />,
    );
    // Continuer immédiatement disponible (back-navigation après valid).
    expect(screen.getByTestId('discord-app-continue')).toBeDefined();
    // Aucune validation Discord déclenchée — l'admin a déjà
    // validé, on ne re-tape pas l'API au mount.
    expect(submitDiscordApp).not.toHaveBeenCalled();
  });
});
