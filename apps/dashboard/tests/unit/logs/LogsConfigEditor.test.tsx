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

import { LogsAdvancedMode } from '../../../components/logs/LogsAdvancedMode';
import { LogsConfigEditor } from '../../../components/logs/LogsConfigEditor';
import { LogsSimpleMode } from '../../../components/logs/LogsSimpleMode';

const emptyConfig = {
  version: 1 as const,
  routes: [],
  exclusions: { userIds: [], roleIds: [], channelIds: [], excludeBots: true },
};

afterEach(cleanup);

describe('LogsConfigEditor', () => {
  it('affiche le mode simple par défaut', () => {
    render(
      <LogsConfigEditor
        guildId="g1"
        initialConfig={emptyConfig}
        brokenRoutes={[]}
        channels={[{ id: 'c1', name: 'general' }]}
        roles={[]}
      />,
    );
    expect(screen.getByText(/événements à surveiller/i)).toBeDefined();
  });

  it('affiche les routes cassées avec banner quand brokenRoutes non vide', () => {
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
      />,
    );
    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText(/1 route cassée/i)).toBeDefined();
  });

  it('affiche le pluriel pour plusieurs routes cassées', () => {
    render(
      <LogsConfigEditor
        guildId="g1"
        initialConfig={emptyConfig}
        brokenRoutes={[
          {
            routeId: 'r1',
            channelId: 'c1',
            droppedCount: 1,
            bufferedCount: 0,
            markedAt: null,
            reason: 'deleted',
          },
          {
            routeId: 'r2',
            channelId: 'c2',
            droppedCount: 3,
            bufferedCount: 2,
            markedAt: null,
            reason: 'no-perms',
          },
        ]}
        channels={[]}
        roles={[]}
      />,
    );
    expect(screen.getByText(/2 routes cassées/i)).toBeDefined();
  });

  it('affiche un bouton "Rejouer" par route cassée', () => {
    render(
      <LogsConfigEditor
        guildId="g1"
        initialConfig={emptyConfig}
        brokenRoutes={[
          {
            routeId: 'r1',
            channelId: 'c-dead-1',
            droppedCount: 0,
            bufferedCount: 3,
            markedAt: null,
            reason: 'channel-not-found',
          },
          {
            routeId: 'r2',
            channelId: 'c-dead-2',
            droppedCount: 0,
            bufferedCount: 5,
            markedAt: null,
            reason: 'unknown',
          },
        ]}
        channels={[]}
        roles={[]}
      />,
    );
    const buttons = screen.getAllByRole('button', { name: /rejouer/i });
    expect(buttons).toHaveLength(2);
  });

  it('clic sur "Rejouer" appelle replayBrokenRoute avec (guildId, routeId) et rafraîchit la page', async () => {
    replayBrokenRouteMock.mockResolvedValueOnce({ ok: true, replayed: 3, failed: 0 });
    render(
      <LogsConfigEditor
        guildId="guild-42"
        initialConfig={emptyConfig}
        brokenRoutes={[
          {
            routeId: 'route-1',
            channelId: 'c-dead',
            droppedCount: 0,
            bufferedCount: 3,
            markedAt: null,
            reason: 'channel-not-found',
          },
        ]}
        channels={[]}
        roles={[]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /rejouer/i }));
    await waitFor(() => expect(replayBrokenRouteMock).toHaveBeenCalledWith('guild-42', 'route-1'));
    await waitFor(() => expect(screen.getByText(/3 events rejoués/i)).toBeDefined());
    expect(routerRefresh).toHaveBeenCalled();
  });

  it('affiche le message partiel quand replay retourne failed > 0', async () => {
    replayBrokenRouteMock.mockResolvedValueOnce({
      ok: true,
      replayed: 1,
      failed: 2,
      firstError: { reason: 'channel-not-found' },
    });
    render(
      <LogsConfigEditor
        guildId="g"
        initialConfig={emptyConfig}
        brokenRoutes={[
          {
            routeId: 'r1',
            channelId: 'c1',
            droppedCount: 0,
            bufferedCount: 3,
            markedAt: null,
            reason: 'channel-not-found',
          },
        ]}
        channels={[]}
        roles={[]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /rejouer/i }));
    await waitFor(() => expect(screen.getByText(/1 rejoué.*2 encore en échec/i)).toBeDefined());
  });

  it('affiche une erreur quand replay retourne ok:false', async () => {
    replayBrokenRouteMock.mockResolvedValueOnce({ ok: false, reason: 'service-unavailable' });
    render(
      <LogsConfigEditor
        guildId="g"
        initialConfig={emptyConfig}
        brokenRoutes={[
          {
            routeId: 'r1',
            channelId: 'c1',
            droppedCount: 0,
            bufferedCount: 3,
            markedAt: null,
            reason: 'channel-not-found',
          },
        ]}
        channels={[]}
        roles={[]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /rejouer/i }));
    await waitFor(() => expect(screen.getByText(/service indisponible/i)).toBeDefined());
  });

  it("n'affiche pas le banner quand brokenRoutes est vide", () => {
    render(
      <LogsConfigEditor
        guildId="g1"
        initialConfig={emptyConfig}
        brokenRoutes={[]}
        channels={[]}
        roles={[]}
      />,
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('navigue en mode avancé au clic sur l\'onglet "Mode avancé"', () => {
    render(
      <LogsConfigEditor
        guildId="g1"
        initialConfig={emptyConfig}
        brokenRoutes={[]}
        channels={[{ id: 'c1', name: 'general' }]}
        roles={[]}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /mode avancé/i }));
    expect(routerReplace).toHaveBeenCalledWith('?mode=advanced');
  });
});

describe('LogsAdvancedMode', () => {
  const baseConfig = {
    version: 1 as const,
    routes: [],
    exclusions: { userIds: [], roleIds: [], channelIds: [], excludeBots: false },
  };

  const channels = [
    { id: 'c1', name: 'logs-mod' },
    { id: 'c2', name: 'logs-general' },
  ];

  it('affiche le bouton "+ Nouvelle route"', () => {
    render(
      <LogsAdvancedMode
        guildId="g1"
        config={baseConfig}
        setConfig={() => undefined}
        channels={channels}
        roles={[]}
      />,
    );
    expect(screen.getByRole('button', { name: /nouvelle route/i })).toBeDefined();
  });

  it('affiche le formulaire d\'ajout au clic sur "+ Nouvelle route"', () => {
    render(
      <LogsAdvancedMode
        guildId="g1"
        config={baseConfig}
        setConfig={() => undefined}
        channels={channels}
        roles={[]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /nouvelle route/i }));
    expect(screen.getByRole('form', { name: /formulaire d'ajout de route/i })).toBeDefined();
  });

  it('bouton Ajouter désactivé tant que le formulaire est invalide', () => {
    render(
      <LogsAdvancedMode
        guildId="g1"
        config={baseConfig}
        setConfig={() => undefined}
        channels={channels}
        roles={[]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /nouvelle route/i }));
    const addBtn = screen.getByRole('button', { name: /^ajouter$/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('ajoute une route après avoir rempli le formulaire', () => {
    const setConfig = vi.fn();
    render(
      <LogsAdvancedMode
        guildId="g1"
        config={baseConfig}
        setConfig={setConfig}
        channels={channels}
        roles={[]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /nouvelle route/i }));

    fireEvent.change(screen.getByLabelText(/label de la nouvelle route/i), {
      target: { value: 'Modération' },
    });
    /* Coche un événement */
    fireEvent.click(screen.getByLabelText('Arrivée membre'));
    /* Sélectionne un salon */
    fireEvent.change(screen.getByLabelText(/salon de destination de la route/i), {
      target: { value: 'c1' },
    });

    const addBtn = screen.getByRole('button', { name: /^ajouter$/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(addBtn);

    expect(setConfig).toHaveBeenCalledOnce();
    const called = setConfig.mock.calls[0]?.[0] as typeof baseConfig & { routes: unknown[] };
    expect(called.routes).toHaveLength(1);
  });

  it('affiche le bouton "Éditer" sur les routes existantes', () => {
    const configWithRoute = {
      ...baseConfig,
      routes: [
        {
          id: 'r1',
          label: 'Test route',
          events: ['guild.memberJoin'],
          channelId: 'c1',
          verbosity: 'detailed' as const,
        },
      ],
    };
    render(
      <LogsAdvancedMode
        guildId="g1"
        config={configWithRoute}
        setConfig={() => undefined}
        channels={channels}
        roles={[]}
      />,
    );
    expect(screen.getByRole('button', { name: /éditer la route test route/i })).toBeDefined();
  });

  it('passe la ligne en mode édition au clic sur "Éditer"', () => {
    const configWithRoute = {
      ...baseConfig,
      routes: [
        {
          id: 'r1',
          label: 'Test route',
          events: ['guild.memberJoin'],
          channelId: 'c1',
          verbosity: 'detailed' as const,
        },
      ],
    };
    render(
      <LogsAdvancedMode
        guildId="g1"
        config={configWithRoute}
        setConfig={() => undefined}
        channels={channels}
        roles={[]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /éditer la route test route/i }));
    expect(screen.getByRole('button', { name: /valider les modifications/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /annuler les modifications/i })).toBeDefined();
  });
});

describe('LogsSimpleMode', () => {
  it('rend le sélecteur de salon', () => {
    render(
      <LogsSimpleMode
        guildId="g1"
        config={emptyConfig}
        setConfig={() => undefined}
        channels={[{ id: 'c1', name: 'logs' }]}
      />,
    );
    expect(screen.getByRole('combobox', { name: /salon de destination/i })).toBeDefined();
    expect(screen.getByText('#logs')).toBeDefined();
  });

  it('bouton Enregistrer désactivé sans salon sélectionné', () => {
    render(
      <LogsSimpleMode
        guildId="g1"
        config={emptyConfig}
        setConfig={() => undefined}
        channels={[]}
      />,
    );
    const btn = screen.getByRole('button', { name: /enregistrer/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('bouton Enregistrer activé une fois un salon et un event sélectionnés', () => {
    render(
      <LogsSimpleMode
        guildId="g1"
        config={emptyConfig}
        setConfig={() => undefined}
        channels={[{ id: 'c1', name: 'logs' }]}
      />,
    );
    const select = screen.getByRole('combobox', { name: /salon de destination/i });
    fireEvent.change(select, { target: { value: 'c1' } });
    fireEvent.click(screen.getByLabelText(/arrivée membre/i));
    const btn = screen.getByRole('button', { name: /enregistrer/i });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });
});
