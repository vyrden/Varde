import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const routerReplace = vi.fn();
const routerRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace, refresh: routerRefresh }),
  useSearchParams: () => new URLSearchParams(),
}));

const replayBrokenRouteMock = vi.fn();
vi.mock('../../../lib/logs-actions', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/logs-actions')>(
    '../../../lib/logs-actions',
  );
  return {
    ...actual,
    replayBrokenRoute: (...args: unknown[]) => replayBrokenRouteMock(...args),
  };
});

import { LogsConfigEditor } from '../../../components/logs/LogsConfigEditor';

const emptyConfig = {
  version: 1 as const,
  routes: [],
  exclusions: { userIds: [], roleIds: [], channelIds: [], excludeBots: true },
};

const STATUS_CARD = <div data-testid="status-card">status</div>;

afterEach(() => {
  cleanup();
  routerReplace.mockReset();
  routerRefresh.mockReset();
  replayBrokenRouteMock.mockReset();
  try {
    window.localStorage.clear();
  } catch {
    /* happy-dom */
  }
});

describe('LogsConfigEditor — shell unifié', () => {
  it('rend les sections principales (destination, événements, options) sur config vide', () => {
    render(
      <LogsConfigEditor
        guildId="g1"
        initialConfig={emptyConfig}
        brokenRoutes={[]}
        channels={[{ id: 'c1', name: 'general' }]}
        roles={[]}
        statusCard={STATUS_CARD}
      />,
    );
    // Cible les titres de Card via leur role (la grand-mère `<div>`
    // CardTitle n'a pas de role par défaut, donc on filtre par classe).
    expect(screen.getByLabelText(/^Salon de destination$/i)).toBeDefined();
    expect(screen.getByText(/^Événements à surveiller$/i)).toBeDefined();
    expect(screen.getByText(/^Options$/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Configuration avancée/i })).toBeDefined();
    expect(screen.getByTestId('status-card')).toBeDefined();
  });

  it("affiche l'onboarding hint sur config vierge (aucun salon, aucun event)", () => {
    render(
      <LogsConfigEditor
        guildId="g1"
        initialConfig={emptyConfig}
        brokenRoutes={[]}
        channels={[{ id: 'c1', name: 'general' }]}
        roles={[]}
        statusCard={STATUS_CARD}
      />,
    );
    expect(screen.getByText(/Pour commencer/)).toBeDefined();
  });

  it("masque l'onboarding hint quand un salon est sélectionné", () => {
    render(
      <LogsConfigEditor
        guildId="g1"
        initialConfig={{
          version: 1,
          routes: [
            {
              id: '00000000-0000-4000-8000-000000000001',
              label: 'Logs',
              events: ['guild.memberJoin'],
              channelId: 'c1',
              verbosity: 'detailed',
            },
          ],
          exclusions: emptyConfig.exclusions,
        }}
        brokenRoutes={[]}
        channels={[{ id: 'c1', name: 'general' }]}
        roles={[]}
        statusCard={STATUS_CARD}
      />,
    );
    expect(screen.queryByText(/Pour commencer/)).toBeNull();
  });

  it('affiche le banner routes cassées en haut quand brokenRoutes non vide', () => {
    render(
      <LogsConfigEditor
        guildId="g1"
        initialConfig={emptyConfig}
        brokenRoutes={[
          {
            routeId: 'r1',
            channelId: 'c-dead',
            droppedCount: 5,
            bufferedCount: 12,
            markedAt: '2026-04-23T14:00:00.000Z',
            reason: 'channel-not-found',
          },
        ]}
        channels={[]}
        roles={[]}
        statusCard={STATUS_CARD}
      />,
    );
    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText(/1 route cassée/i)).toBeDefined();
  });

  it('rejouer une route cassée appelle replayBrokenRoute(guildId, routeId) et rafraîchit', async () => {
    replayBrokenRouteMock.mockResolvedValueOnce({ ok: true, replayed: 12, failed: 0 });
    render(
      <LogsConfigEditor
        guildId="g1"
        initialConfig={emptyConfig}
        brokenRoutes={[
          {
            routeId: 'r1',
            channelId: 'c1',
            droppedCount: 0,
            bufferedCount: 12,
            markedAt: '2026-04-23T14:00:00.000Z',
            reason: 'channel-not-found',
          },
        ]}
        channels={[]}
        roles={[]}
        statusCard={STATUS_CARD}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Rejouer/i }));
    await waitFor(() => {
      expect(replayBrokenRouteMock).toHaveBeenCalledWith('g1', 'r1');
    });
    await waitFor(() => {
      expect(routerRefresh).toHaveBeenCalled();
    });
  });

  it("la sticky bar Save est désactivée quand aucun salon n'est sélectionné", () => {
    render(
      <LogsConfigEditor
        guildId="g1"
        initialConfig={emptyConfig}
        brokenRoutes={[]}
        channels={[{ id: 'c1', name: 'general' }]}
        roles={[]}
        statusCard={STATUS_CARD}
      />,
    );
    const save = screen.getByRole('button', { name: 'Enregistrer' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
  });

  it("le bouton Tester est désactivé quand aucun salon n'est sélectionné", () => {
    render(
      <LogsConfigEditor
        guildId="g1"
        initialConfig={emptyConfig}
        brokenRoutes={[]}
        channels={[{ id: 'c1', name: 'general' }]}
        roles={[]}
        statusCard={STATUS_CARD}
      />,
    );
    const test = screen.getByRole('button', { name: /Tester l'envoi/i });
    expect((test as HTMLButtonElement).disabled).toBe(true);
  });

  it('auto-ouvre la section avancée quand des routes additionnelles existent', () => {
    render(
      <LogsConfigEditor
        guildId="g1"
        initialConfig={{
          version: 1,
          routes: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              label: 'Modération',
              events: ['guild.messageDelete'],
              channelId: 'c1',
              verbosity: 'detailed',
            },
          ],
          exclusions: emptyConfig.exclusions,
        }}
        brokenRoutes={[]}
        channels={[{ id: 'c1', name: 'general' }]}
        roles={[]}
        statusCard={STATUS_CARD}
      />,
    );
    const advancedToggle = screen.getByRole('button', { name: /Configuration avancée/i });
    expect(advancedToggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('garde la section avancée fermée par défaut sur config simple', () => {
    render(
      <LogsConfigEditor
        guildId="g1"
        initialConfig={emptyConfig}
        brokenRoutes={[]}
        channels={[{ id: 'c1', name: 'general' }]}
        roles={[]}
        statusCard={STATUS_CARD}
      />,
    );
    const advancedToggle = screen.getByRole('button', { name: /Configuration avancée/i });
    expect(advancedToggle.getAttribute('aria-expanded')).toBe('false');
  });
});
