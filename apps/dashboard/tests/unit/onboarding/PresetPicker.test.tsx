import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PresetDefinition } from '@varde/presets';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const startOnboardingWithPreset = vi.fn();

vi.mock('../../../lib/onboarding-actions', () => ({
  startOnboardingWithPreset: (...args: unknown[]) => startOnboardingWithPreset(...args),
}));

import { PresetPicker } from '../../../components/onboarding/PresetPicker';

const samplePreset: PresetDefinition = {
  id: 'p-sample',
  name: 'Sample',
  description: 'Un preset de test.',
  tags: ['test'],
  locale: 'fr',
  roles: [
    {
      localId: 'r',
      name: 'R',
      color: 0,
      permissionPreset: 'member-default',
      hoist: false,
      mentionable: false,
    },
  ],
  categories: [{ localId: 'c', name: 'cat', position: 0 }],
  channels: [
    {
      localId: 'ch',
      categoryLocalId: 'c',
      name: 'salon',
      type: 'text',
      slowmodeSeconds: 0,
      readableBy: [],
      writableBy: [],
    },
  ],
  modules: [],
  permissionBindings: [],
};

describe('PresetPicker', () => {
  beforeEach(() => {
    startOnboardingWithPreset.mockReset();
  });

  it('affiche les presets avec leur résumé chiffré', () => {
    render(<PresetPicker guildId="g1" presets={[samplePreset]} />);
    expect(screen.getByText('Sample')).toBeTruthy();
    expect(screen.getByText('Un preset de test.')).toBeTruthy();
    // 1 rôle, 1 catégorie, 1 salon, 0 modules.
    const values = screen.getAllByText(/^[01]$/);
    expect(values.length).toBeGreaterThanOrEqual(3);
  });

  it("appelle l'action startOnboardingWithPreset au click", async () => {
    startOnboardingWithPreset.mockResolvedValue({ ok: true, data: {} });
    render(<PresetPicker guildId="g1" presets={[samplePreset]} />);

    fireEvent.click(screen.getByRole('button', { name: /Démarrer avec le preset Sample/i }));

    await waitFor(() => expect(startOnboardingWithPreset).toHaveBeenCalledTimes(1));
    expect(startOnboardingWithPreset).toHaveBeenCalledWith('g1', 'p-sample');
  });

  it("remonte l'erreur server action à l'écran", async () => {
    startOnboardingWithPreset.mockResolvedValue({
      ok: false,
      status: 409,
      code: 'onboarding_already_active',
      message: 'déjà en cours',
    });
    render(<PresetPicker guildId="g1" presets={[samplePreset]} />);

    fireEvent.click(screen.getByRole('button', { name: /Démarrer avec le preset Sample/i }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('déjà en cours'));
  });
});
