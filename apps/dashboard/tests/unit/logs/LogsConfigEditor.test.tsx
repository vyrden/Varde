import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const routerReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace }),
  useSearchParams: () => new URLSearchParams(),
}));

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

  it('navigue en mode avancé au clic sur "Mode avancé"', () => {
    render(
      <LogsConfigEditor
        guildId="g1"
        initialConfig={emptyConfig}
        brokenRoutes={[]}
        channels={[{ id: 'c1', name: 'general' }]}
        roles={[]}
      />,
    );
    fireEvent.click(screen.getByText(/mode avancé/i));
    expect(routerReplace).toHaveBeenCalledWith('?mode=advanced');
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
        onSwitchAdvanced={() => undefined}
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
        onSwitchAdvanced={() => undefined}
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
        onSwitchAdvanced={() => undefined}
      />,
    );
    const select = screen.getByRole('combobox', { name: /salon de logs/i });
    fireEvent.change(select, { target: { value: 'c1' } });
    const btn = screen.getByRole('button', { name: /enregistrer/i });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('appelle onSwitchAdvanced au clic sur "Mode avancé"', () => {
    const onSwitch = vi.fn();
    render(
      <LogsSimpleMode
        guildId="g1"
        config={emptyConfig}
        setConfig={() => undefined}
        channels={[]}
        onSwitchAdvanced={onSwitch}
      />,
    );
    fireEvent.click(screen.getByText(/mode avancé/i));
    expect(onSwitch).toHaveBeenCalledTimes(1);
  });
});
