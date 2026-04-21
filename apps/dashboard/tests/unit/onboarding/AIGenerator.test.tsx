import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const generatePresetWithAi = vi.fn();
const startOnboardingWithAiProposal = vi.fn();

vi.mock('../../../lib/onboarding-actions', () => ({
  generatePresetWithAi: (...args: unknown[]) => generatePresetWithAi(...args),
  startOnboardingWithAiProposal: (...args: unknown[]) => startOnboardingWithAiProposal(...args),
}));

import { AIGenerator } from '../../../components/onboarding/AIGenerator';

const fakeProposal = {
  preset: {
    id: 'ai-gen-001',
    name: 'Commu générée',
    description: 'Une commu personnalisée produite par l IA.',
    roles: [{ localId: 'r-1' }],
    categories: [{ localId: 'c-1' }],
    channels: [{ localId: 'ch-1' }, { localId: 'ch-2' }],
    modules: [],
  },
  rationale: "L'IA a identifié une commu tech et propose 1 rôle.",
  confidence: 0.7,
  invocationId: '01HAAAAAAAAAAAAAAAAAAAAAAA',
  provider: { id: 'stub', model: 'stub-v1' },
};

describe('AIGenerator', () => {
  beforeEach(() => {
    generatePresetWithAi.mockReset();
    startOnboardingWithAiProposal.mockReset();
  });

  it('soumet la description à generatePresetWithAi', async () => {
    generatePresetWithAi.mockResolvedValue({ ok: true, data: fakeProposal });
    render(<AIGenerator guildId="g1" onBack={() => undefined} />);

    fireEvent.change(screen.getByLabelText(/description de la communauté/i), {
      target: { value: 'commu tech dev' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^générer$/i }));

    await waitFor(() => expect(generatePresetWithAi).toHaveBeenCalledTimes(1));
    expect(generatePresetWithAi).toHaveBeenCalledWith('g1', {
      description: 'commu tech dev',
      locale: 'fr',
      hints: [],
    });
  });

  it('refuse un submit avec description vide', async () => {
    render(<AIGenerator guildId="g1" onBack={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /^générer$/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/décri/i);
    });
    expect(generatePresetWithAi).not.toHaveBeenCalled();
  });

  it('affiche la proposition et le bouton Utiliser ce preset', async () => {
    generatePresetWithAi.mockResolvedValue({ ok: true, data: fakeProposal });
    render(<AIGenerator guildId="g1" onBack={() => undefined} />);

    fireEvent.change(screen.getByLabelText(/description de la communauté/i), {
      target: { value: 'commu tech' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^générer$/i }));

    await waitFor(() => expect(screen.getByText('Commu générée')).toBeTruthy());
    expect(screen.getByText(/confiance 70%/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /utiliser ce preset/i })).toBeTruthy();
  });

  it('bouton Utiliser ce preset appelle startOnboardingWithAiProposal', async () => {
    generatePresetWithAi.mockResolvedValue({ ok: true, data: fakeProposal });
    startOnboardingWithAiProposal.mockResolvedValue({ ok: true, data: {} });
    render(<AIGenerator guildId="g1" onBack={() => undefined} />);

    fireEvent.change(screen.getByLabelText(/description de la communauté/i), {
      target: { value: 'commu tech' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^générer$/i }));

    await waitFor(() => screen.getByRole('button', { name: /utiliser ce preset/i }));
    fireEvent.click(screen.getByRole('button', { name: /utiliser ce preset/i }));

    await waitFor(() =>
      expect(startOnboardingWithAiProposal).toHaveBeenCalledWith(
        'g1',
        fakeProposal.preset,
        fakeProposal.invocationId,
      ),
    );
  });

  it('bouton Régénérer ramène au formulaire de saisie', async () => {
    generatePresetWithAi.mockResolvedValue({ ok: true, data: fakeProposal });
    render(<AIGenerator guildId="g1" onBack={() => undefined} />);

    fireEvent.change(screen.getByLabelText(/description de la communauté/i), {
      target: { value: 'x' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^générer$/i }));
    await waitFor(() => screen.getByText('Commu générée'));

    fireEvent.click(screen.getByRole('button', { name: /régénérer/i }));
    await waitFor(() => screen.getByLabelText(/description de la communauté/i));
  });
});
