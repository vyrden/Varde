import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rollbackOnboarding = vi.fn();

vi.mock('../../../lib/onboarding-actions', () => ({
  rollbackOnboarding: (...args: unknown[]) => rollbackOnboarding(...args),
}));

import { AppliedStep } from '../../../components/onboarding/AppliedStep';
import type { OnboardingSessionDto } from '../../../lib/onboarding-client';

const buildSession = (expiresInMs: number): OnboardingSessionDto => ({
  id: '01HAPP',
  guildId: 'g1',
  status: 'applied',
  presetSource: 'preset',
  presetId: 'p',
  draft: { locale: 'fr', roles: [], categories: [], channels: [], modules: [] },
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  appliedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
});

describe('AppliedStep', () => {
  beforeEach(() => {
    rollbackOnboarding.mockReset();
  });

  it('affiche le compte à rebours et active le bouton Défaire', () => {
    render(<AppliedStep session={buildSession(5 * 60_000)} />);
    expect(screen.getByText(/Temps restant/)).toBeTruthy();
    const button = screen.getByRole('button', { name: /défaire/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it('grise le bouton et affiche un message quand la fenêtre est dépassée', () => {
    render(<AppliedStep session={buildSession(-1000)} />);
    expect(screen.getByText(/dépassée/i)).toBeTruthy();
    const button = screen.getByRole('button', { name: /indisponible/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('click sur Défaire appelle rollbackOnboarding', async () => {
    rollbackOnboarding.mockResolvedValue({
      ok: true,
      data: { ok: true, undoneCount: 3, skippedCount: 0 },
    });
    render(<AppliedStep session={buildSession(5 * 60_000)} />);

    fireEvent.click(screen.getByRole('button', { name: /défaire/i }));
    await waitFor(() => expect(rollbackOnboarding).toHaveBeenCalledWith('g1', '01HAPP'));
  });
});
