import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const suggestOnboardingCompletion = vi.fn();
const patchOnboardingDraft = vi.fn();

vi.mock('../../../lib/onboarding-actions', () => ({
  suggestOnboardingCompletion: (...args: unknown[]) => suggestOnboardingCompletion(...args),
  patchOnboardingDraft: (...args: unknown[]) => patchOnboardingDraft(...args),
}));

import { SuggestionsPanel } from '../../../components/onboarding/SuggestionsPanel';
import type { OnboardingSessionDto } from '../../../lib/onboarding-client';

const baseSession = (overrides?: Partial<OnboardingSessionDto>): OnboardingSessionDto => ({
  id: '01HSUGGEST0000000000000000',
  guildId: 'g1',
  status: 'draft',
  presetSource: 'blank',
  presetId: null,
  draft: {
    locale: 'fr',
    roles: [
      {
        localId: 'r-existing',
        name: 'Existant',
        color: 0,
        permissionPreset: 'member-default',
        hoist: false,
        mentionable: false,
      },
    ],
    categories: [],
    channels: [],
    modules: [],
  },
  startedAt: '2026-04-22T00:00:00.000Z',
  updatedAt: '2026-04-22T00:00:00.000Z',
  appliedAt: null,
  expiresAt: null,
  ...overrides,
});

const fakeRoleSuggestion = {
  label: 'Modérateur minimal',
  rationale: 'Un rôle pour timeout sans perm dangereuse.',
  patch: {
    roles: [
      {
        localId: 'suggest-role-mod',
        name: 'Modérateur',
        color: 0x3498db,
        permissionPreset: 'moderator-minimal',
        hoist: true,
        mentionable: true,
      },
    ],
  },
};

describe('SuggestionsPanel', () => {
  beforeEach(() => {
    suggestOnboardingCompletion.mockReset();
    patchOnboardingDraft.mockReset();
  });

  it('ne rend rien hors status draft', () => {
    const { container } = render(
      <SuggestionsPanel session={baseSession({ status: 'previewing' })} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('demande des suggestions pour un rôle et les affiche', async () => {
    suggestOnboardingCompletion.mockResolvedValue({
      ok: true,
      data: {
        suggestions: [fakeRoleSuggestion],
        invocationId: '01HAAAAAAAAAAAAAAAAAAAAAAA',
        provider: { id: 'stub', model: 'stub-v1' },
      },
    });

    render(<SuggestionsPanel session={baseSession()} />);

    fireEvent.click(screen.getByRole('button', { name: /suggérer un rôle/i }));

    await waitFor(() => expect(suggestOnboardingCompletion).toHaveBeenCalledTimes(1));
    expect(suggestOnboardingCompletion).toHaveBeenCalledWith(
      'g1',
      'role',
      expect.objectContaining({ roles: expect.any(Array) }),
      '',
    );

    await waitFor(() => expect(screen.getByText('Modérateur minimal')).toBeTruthy());
    expect(screen.getByText(/timeout/i)).toBeTruthy();
  });

  it("transmet l'indication saisie par l'admin", async () => {
    suggestOnboardingCompletion.mockResolvedValue({
      ok: true,
      data: {
        suggestions: [],
        invocationId: '01HBBBBBBBBBBBBBBBBBBBBBBB',
        provider: { id: 'stub', model: 'stub-v1' },
      },
    });

    render(<SuggestionsPanel session={baseSession()} />);

    fireEvent.change(screen.getByLabelText(/indication/i), {
      target: { value: 'un rôle contributeur' },
    });
    fireEvent.click(screen.getByRole('button', { name: /suggérer un rôle/i }));

    await waitFor(() => expect(suggestOnboardingCompletion).toHaveBeenCalledTimes(1));
    expect(suggestOnboardingCompletion).toHaveBeenCalledWith(
      'g1',
      'role',
      expect.anything(),
      'un rôle contributeur',
    );
  });

  it('ajoute une suggestion en concaténant les arrays côté client', async () => {
    suggestOnboardingCompletion.mockResolvedValue({
      ok: true,
      data: {
        suggestions: [fakeRoleSuggestion],
        invocationId: '01HAAAAAAAAAAAAAAAAAAAAAAA',
        provider: { id: 'stub', model: 'stub-v1' },
      },
    });
    patchOnboardingDraft.mockResolvedValue({ ok: true, data: {} });

    render(<SuggestionsPanel session={baseSession()} />);

    fireEvent.click(screen.getByRole('button', { name: /suggérer un rôle/i }));
    await waitFor(() => screen.getByText('Modérateur minimal'));

    fireEvent.click(screen.getByRole('button', { name: /ajouter à mon draft/i }));

    await waitFor(() => expect(patchOnboardingDraft).toHaveBeenCalledTimes(1));
    const [guildArg, sessionArg, patchArg] = patchOnboardingDraft.mock.calls[0] ?? [];
    expect(guildArg).toBe('g1');
    expect(sessionArg).toBe('01HSUGGEST0000000000000000');
    const rolesPatch = (patchArg as { roles: unknown[] }).roles;
    expect(rolesPatch).toHaveLength(2);
    expect(rolesPatch[0]).toMatchObject({ localId: 'r-existing' });
    expect(rolesPatch[1]).toMatchObject({ localId: 'suggest-role-mod' });
  });

  it("affiche l'erreur API en cas d'échec", async () => {
    suggestOnboardingCompletion.mockResolvedValue({
      ok: false,
      status: 502,
      code: 'ai_provider_build_failed',
      message: 'Provider IA indisponible',
    });

    render(<SuggestionsPanel session={baseSession()} />);

    fireEvent.click(screen.getByRole('button', { name: /suggérer un rôle/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/provider ia indisponible/i);
    });
  });
});
