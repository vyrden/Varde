import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const saveBotSettings = vi.fn();

vi.mock('../../../lib/bot-settings-actions', () => ({
  saveBotSettings: (...args: unknown[]) => saveBotSettings(...args),
}));

import { BotSettingsForm } from '../../../components/settings/BotSettingsForm';
import type { BotSettingsDto } from '../../../lib/bot-settings-types';

const initial: BotSettingsDto = {
  language: 'en',
  timezone: 'UTC',
  embedColor: '#5865F2',
  updatedAt: null,
};

describe('BotSettingsForm', () => {
  beforeEach(() => {
    saveBotSettings.mockReset();
  });

  it('pré-remplit les 3 champs depuis initial', () => {
    render(<BotSettingsForm guildId="g1" initial={initial} />);
    expect((screen.getByLabelText('Langue du bot') as HTMLSelectElement).value).toBe('en');
    expect((screen.getByLabelText('Fuseau horaire du bot') as HTMLSelectElement).value).toBe('UTC');
    expect((screen.getByLabelText('Code couleur hex') as HTMLInputElement).value).toBe('#5865F2');
  });

  it('désactive Enregistrer tant que rien ne change', () => {
    render(<BotSettingsForm guildId="g1" initial={initial} />);
    const save = screen.getByRole('button', { name: /enregistrer/i }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it('soumet la nouvelle config quand un champ change', async () => {
    saveBotSettings.mockResolvedValue({ ok: true });
    render(<BotSettingsForm guildId="g1" initial={initial} />);
    fireEvent.change(screen.getByLabelText('Langue du bot'), { target: { value: 'fr' } });
    fireEvent.change(screen.getByLabelText('Fuseau horaire du bot'), {
      target: { value: 'Europe/Paris' },
    });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(saveBotSettings).toHaveBeenCalledTimes(1));
    expect(saveBotSettings).toHaveBeenCalledWith('g1', {
      language: 'fr',
      timezone: 'Europe/Paris',
      embedColor: '#5865F2',
    });
  });

  it('refuse une couleur hex invalide', async () => {
    render(<BotSettingsForm guildId="g1" initial={initial} />);
    fireEvent.change(screen.getByLabelText('Code couleur hex'), {
      target: { value: 'not-a-color' },
    });
    const save = screen.getByRole('button', { name: /enregistrer/i }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByText(/Format attendu/)).toBeDefined();
  });
});
