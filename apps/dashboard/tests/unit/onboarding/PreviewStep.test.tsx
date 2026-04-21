import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const previewOnboarding = vi.fn();
const applyOnboarding = vi.fn();

vi.mock('../../../lib/onboarding-actions', () => ({
  previewOnboarding: (...args: unknown[]) => previewOnboarding(...args),
  applyOnboarding: (...args: unknown[]) => applyOnboarding(...args),
}));

import { PreviewStep } from '../../../components/onboarding/PreviewStep';
import type { OnboardingSessionDto } from '../../../lib/onboarding-client';

const session: OnboardingSessionDto = {
  id: '01HAAA',
  guildId: 'g1',
  status: 'previewing',
  presetSource: 'preset',
  presetId: 'community-tech-small',
  draft: {
    locale: 'fr',
    roles: [],
    categories: [],
    channels: [],
    modules: [],
  },
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  appliedAt: null,
  expiresAt: null,
};

describe('PreviewStep', () => {
  beforeEach(() => {
    previewOnboarding.mockReset();
    applyOnboarding.mockReset();
  });

  it('fetche la preview au mount et affiche la liste des actions', async () => {
    previewOnboarding.mockResolvedValue({
      ok: true,
      data: {
        actions: [
          { type: 'core.createRole', payload: { name: 'Mod' } },
          { type: 'core.createCategory', payload: { name: 'info' } },
        ],
      },
    });

    render(<PreviewStep session={session} />);
    await waitFor(() => expect(previewOnboarding).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Créer le rôle')).toBeTruthy());
    expect(screen.getByText('Mod')).toBeTruthy();
    expect(screen.getByText('Créer la catégorie')).toBeTruthy();
  });

  it('click sur Appliquer appelle applyOnboarding', async () => {
    previewOnboarding.mockResolvedValue({ ok: true, data: { actions: [] } });
    applyOnboarding.mockResolvedValue({
      ok: true,
      data: { ok: true, appliedCount: 0, externalIds: [] },
    });
    render(<PreviewStep session={session} />);
    await waitFor(() => expect(previewOnboarding).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /appliquer/i }));
    await waitFor(() => expect(applyOnboarding).toHaveBeenCalledWith('g1', '01HAAA'));
  });

  it("affiche l'erreur si apply échoue côté executor", async () => {
    previewOnboarding.mockResolvedValue({ ok: true, data: { actions: [] } });
    applyOnboarding.mockResolvedValue({
      ok: true,
      data: { ok: false, appliedCount: 2, externalIds: [], failedAt: 2, error: 'boom' },
    });
    render(<PreviewStep session={session} />);
    await waitFor(() => expect(previewOnboarding).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /appliquer/i }));
    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('boom');
    });
  });
});
