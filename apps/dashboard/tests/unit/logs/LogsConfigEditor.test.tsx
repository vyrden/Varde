import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const routerReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace }),
  useSearchParams: () => new URLSearchParams(),
}));

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
    expect(screen.getByText(/que logger/i)).toBeDefined();
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
    expect(screen.getByRole('combobox', { name: /salon de logs/i })).toBeDefined();
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

  it('bouton Enregistrer activé une fois un salon sélectionné', () => {
    render(
      <LogsSimpleMode
        guildId="g1"
        config={emptyConfig}
        setConfig={() => undefined}
        channels={[{ id: 'c1', name: 'logs' }]}
      />,
    );
    const select = screen.getByRole('combobox', { name: /salon de logs/i });
    fireEvent.change(select, { target: { value: 'c1' } });
    const btn = screen.getByRole('button', { name: /enregistrer/i });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });
});
