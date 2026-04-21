import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const previewOnboarding = vi.fn();

vi.mock('../../../lib/onboarding-actions', () => ({
  previewOnboarding: (...args: unknown[]) => previewOnboarding(...args),
}));

import { BuilderCanvas } from '../../../components/onboarding/BuilderCanvas';
import type { OnboardingSessionDto } from '../../../lib/onboarding-client';

const buildSession = (): OnboardingSessionDto => ({
  id: '01HZZZ',
  guildId: 'g1',
  status: 'draft',
  presetSource: 'preset',
  presetId: 'community-tech-small',
  draft: {
    locale: 'fr',
    roles: [
      {
        localId: 'r-mod',
        name: 'Modérateur',
        color: 0x3498db,
        permissionPreset: 'moderator-minimal',
        hoist: true,
        mentionable: true,
      },
    ],
    categories: [{ localId: 'cat-info', name: 'info', position: 0 }],
    channels: [
      {
        localId: 'ch-an',
        categoryLocalId: 'cat-info',
        name: 'annonces',
        type: 'text',
        slowmodeSeconds: 0,
        readableBy: [],
        writableBy: ['r-mod'],
      },
    ],
    modules: [{ moduleId: 'hello-world', enabled: true, config: {} }],
  },
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  appliedAt: null,
  expiresAt: null,
});

describe('BuilderCanvas', () => {
  beforeEach(() => {
    previewOnboarding.mockReset();
  });

  it('affiche le draft (roles / catégorie / salon / module)', () => {
    render(<BuilderCanvas session={buildSession()} />);
    expect(screen.getByText('Modérateur')).toBeTruthy();
    expect(screen.getByText(/info/i)).toBeTruthy();
    expect(screen.getByText(/#annonces/)).toBeTruthy();
    expect(screen.getByText('hello-world')).toBeTruthy();
  });

  it('click sur Prévisualiser appelle previewOnboarding', async () => {
    previewOnboarding.mockResolvedValue({ ok: true, data: { actions: [] } });
    render(<BuilderCanvas session={buildSession()} />);

    fireEvent.click(screen.getByRole('button', { name: /prévisualiser/i }));

    await waitFor(() => expect(previewOnboarding).toHaveBeenCalledTimes(1));
    expect(previewOnboarding).toHaveBeenCalledWith('g1', '01HZZZ');
  });
});
