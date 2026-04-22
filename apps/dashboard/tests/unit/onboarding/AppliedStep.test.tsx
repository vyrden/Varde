import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rollbackOnboarding = vi.fn();
const routerRefresh = vi.fn();

vi.mock('../../../lib/onboarding-actions', () => ({
  rollbackOnboarding: (...args: unknown[]) => rollbackOnboarding(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}));

import { AppliedStep } from '../../../components/onboarding/AppliedStep';
import type { OnboardingSessionDto } from '../../../lib/onboarding-client';

const buildSession = (expiresInMs: number): OnboardingSessionDto => {
  const appliedAt = new Date();
  const expiresAt = new Date(appliedAt.getTime() + expiresInMs);
  return {
    id: '01HAPP',
    guildId: 'g1',
    status: 'applied',
    presetSource: 'preset',
    presetId: 'p',
    draft: { locale: 'fr', roles: [], categories: [], channels: [], modules: [] },
    startedAt: appliedAt.toISOString(),
    updatedAt: appliedAt.toISOString(),
    appliedAt: appliedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
};

describe('AppliedStep', () => {
  beforeEach(() => {
    rollbackOnboarding.mockReset();
    routerRefresh.mockReset();
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

  it('affiche une progressbar avec aria-valuenow à mi-parcours', () => {
    // On monte avec 5 min restantes sur une fenêtre de 30 min : la
    // barre devrait être remplie à ~83%.
    const appliedAt = new Date(Date.now() - 25 * 60_000);
    const expiresAt = new Date(appliedAt.getTime() + 30 * 60_000);
    render(
      <AppliedStep
        session={{
          id: '01HAPP',
          guildId: 'g1',
          status: 'applied',
          presetSource: 'preset',
          presetId: 'p',
          draft: { locale: 'fr', roles: [], categories: [], channels: [], modules: [] },
          startedAt: appliedAt.toISOString(),
          updatedAt: appliedAt.toISOString(),
          appliedAt: appliedAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
        }}
      />,
    );
    const bar = screen.getByRole('progressbar');
    const value = Number(bar.getAttribute('aria-valuenow'));
    expect(value).toBeGreaterThanOrEqual(80);
    expect(value).toBeLessThanOrEqual(100);
  });

  it('expose un bouton Actualiser après expiration qui appelle router.refresh', () => {
    render(<AppliedStep session={buildSession(-1000)} />);
    const refreshButton = screen.getByRole('button', { name: /actualiser/i });
    fireEvent.click(refreshButton);
    expect(routerRefresh).toHaveBeenCalledTimes(1);
  });
});
