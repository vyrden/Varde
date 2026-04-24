import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const saveLogsConfigMock = vi.fn();
const testLogsRouteMock = vi.fn();
const createLogsChannelMock = vi.fn();
vi.mock('../../../lib/logs-actions', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/logs-actions')>(
    '../../../lib/logs-actions',
  );
  return {
    ...actual,
    saveLogsConfig: (...args: unknown[]) => saveLogsConfigMock(...args),
    testLogsRoute: (...args: unknown[]) => testLogsRouteMock(...args),
    createLogsChannel: (...args: unknown[]) => createLogsChannelMock(...args),
  };
});

import type { LogsConfigClient } from '../../../components/logs/LogsConfigEditor';
import { LogsSimpleMode } from '../../../components/logs/LogsSimpleMode';

const emptyConfig: LogsConfigClient = {
  version: 1,
  routes: [],
  exclusions: { userIds: [], roleIds: [], channelIds: [], excludeBots: true },
};

const channels = [
  { id: '1234567890123456789', name: 'general' },
  { id: '2234567890123456789', name: 'logs' },
];

afterEach(() => {
  saveLogsConfigMock.mockReset();
  testLogsRouteMock.mockReset();
  createLogsChannelMock.mockReset();
  cleanup();
});

describe('LogsSimpleMode — structure', () => {
  it('rend les 4 groupes (Membres, Messages, Salons, Rôles)', () => {
    const setConfig = vi.fn();
    render(
      <LogsSimpleMode
        guildId="g1"
        config={emptyConfig}
        setConfig={setConfig}
        channels={channels}
      />,
    );
    expect(screen.getByText('Membres')).toBeDefined();
    expect(screen.getByText('Messages')).toBeDefined();
    expect(screen.getByText('Salons')).toBeDefined();
    expect(screen.getByText('Rôles')).toBeDefined();
  });

  it('affiche les 12 events individuellement', () => {
    const setConfig = vi.fn();
    render(
      <LogsSimpleMode
        guildId="g1"
        config={emptyConfig}
        setConfig={setConfig}
        channels={channels}
      />,
    );
    for (const label of [
      'Arrivée membre',
      'Départ membre',
      'Modification membre',
      'Message supprimé',
      'Message édité',
      'Message envoyé',
      'Salon créé',
      'Salon modifié',
      'Salon supprimé',
      'Rôle créé',
      'Rôle modifié',
      'Rôle supprimé',
    ]) {
      expect(screen.getByLabelText(new RegExp(label, 'i')), label).toBeDefined();
    }
  });

  it('tous les events sont décochés par défaut sur config vierge', () => {
    const setConfig = vi.fn();
    render(
      <LogsSimpleMode
        guildId="g1"
        config={emptyConfig}
        setConfig={setConfig}
        channels={channels}
      />,
    );
    const checkboxes = screen.getAllByRole('checkbox', {
      name: /^(Arrivée|Départ|Modification|Message|Salon|Rôle)/i,
    });
    for (const cb of checkboxes) {
      expect((cb as HTMLInputElement).checked).toBe(false);
    }
  });
});

describe('LogsSimpleMode — initialisation depuis config existante', () => {
  it('pré-coche les events de la route SIMPLE_ROUTE_ID si elle existe', () => {
    const setConfig = vi.fn();
    const config: LogsConfigClient = {
      ...emptyConfig,
      routes: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          label: 'Logs',
          events: ['guild.memberJoin', 'guild.messageDelete'],
          channelId: channels[0]?.id ?? '',
          verbosity: 'detailed',
        },
      ],
    };
    render(
      <LogsSimpleMode guildId="g1" config={config} setConfig={setConfig} channels={channels} />,
    );
    expect((screen.getByLabelText(/Arrivée membre/i) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Message supprimé/i) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Message édité/i) as HTMLInputElement).checked).toBe(false);
  });

  it("ne devine PAS depuis d'autres routes avancées (sans SIMPLE_ROUTE_ID)", () => {
    const setConfig = vi.fn();
    const config: LogsConfigClient = {
      ...emptyConfig,
      routes: [
        {
          id: 'advanced-only-route-abc',
          label: 'Modération',
          events: ['guild.memberLeave'],
          channelId: channels[0]?.id ?? '',
          verbosity: 'detailed',
        },
      ],
    };
    render(
      <LogsSimpleMode guildId="g1" config={config} setConfig={setConfig} channels={channels} />,
    );
    expect((screen.getByLabelText(/Départ membre/i) as HTMLInputElement).checked).toBe(false);
  });
});

describe('LogsSimpleMode — raccourci "Tout cocher" par groupe', () => {
  it('coche les 3 events du groupe Membres quand le groupe est entièrement décoché', () => {
    const setConfig = vi.fn();
    render(
      <LogsSimpleMode
        guildId="g1"
        config={emptyConfig}
        setConfig={setConfig}
        channels={channels}
      />,
    );
    const membersSection = screen
      .getByText('Membres')
      .closest('[data-testid="event-group"]') as HTMLElement;
    fireEvent.click(within(membersSection).getByRole('button', { name: /tout cocher/i }));
    expect((screen.getByLabelText(/Arrivée membre/i) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Départ membre/i) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Modification membre/i) as HTMLInputElement).checked).toBe(true);
  });

  it('décoche les 3 events du groupe quand ils sont déjà tous cochés', () => {
    const setConfig = vi.fn();
    const config: LogsConfigClient = {
      ...emptyConfig,
      routes: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          label: 'Logs',
          events: ['guild.memberJoin', 'guild.memberLeave', 'guild.memberUpdate'],
          channelId: channels[0]?.id ?? '',
          verbosity: 'detailed',
        },
      ],
    };
    render(
      <LogsSimpleMode guildId="g1" config={config} setConfig={setConfig} channels={channels} />,
    );
    const membersSection = screen
      .getByText('Membres')
      .closest('[data-testid="event-group"]') as HTMLElement;
    fireEvent.click(within(membersSection).getByRole('button', { name: /tout cocher/i }));
    expect((screen.getByLabelText(/Arrivée membre/i) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText(/Départ membre/i) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText(/Modification membre/i) as HTMLInputElement).checked).toBe(false);
  });
});

describe('LogsSimpleMode — validation du bouton Enregistrer', () => {
  it('Enregistrer désactivé tant qu aucun salon sélectionné', () => {
    const setConfig = vi.fn();
    render(
      <LogsSimpleMode
        guildId="g1"
        config={emptyConfig}
        setConfig={setConfig}
        channels={channels}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Arrivée membre/i));
    const saveBtn = screen.getByRole('button', { name: /^enregistrer$/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it('Enregistrer désactivé tant que zéro event coché', () => {
    const setConfig = vi.fn();
    render(
      <LogsSimpleMode
        guildId="g1"
        config={emptyConfig}
        setConfig={setConfig}
        channels={channels}
      />,
    );
    fireEvent.change(screen.getByLabelText(/salon de destination/i), {
      target: { value: channels[0]?.id },
    });
    const saveBtn = screen.getByRole('button', { name: /^enregistrer$/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it('Enregistrer actif avec salon + au moins 1 event', () => {
    const setConfig = vi.fn();
    render(
      <LogsSimpleMode
        guildId="g1"
        config={emptyConfig}
        setConfig={setConfig}
        channels={channels}
      />,
    );
    fireEvent.change(screen.getByLabelText(/salon de destination/i), {
      target: { value: channels[0]?.id },
    });
    fireEvent.click(screen.getByLabelText(/Arrivée membre/i));
    const saveBtn = screen.getByRole('button', { name: /^enregistrer$/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
  });
});

describe('LogsSimpleMode — upsert non-destructif', () => {
  it('préserve les autres routes avancées lors du save simple', async () => {
    saveLogsConfigMock.mockResolvedValueOnce({ ok: true });
    const setConfig = vi.fn();
    const advancedRoute = {
      id: 'advanced-route-xyz',
      label: 'Modération',
      events: ['guild.memberLeave'],
      channelId: channels[1]?.id ?? '',
      verbosity: 'detailed' as const,
    };
    const config: LogsConfigClient = { ...emptyConfig, routes: [advancedRoute] };
    render(
      <LogsSimpleMode guildId="g1" config={config} setConfig={setConfig} channels={channels} />,
    );
    fireEvent.change(screen.getByLabelText(/salon de destination/i), {
      target: { value: channels[0]?.id },
    });
    fireEvent.click(screen.getByLabelText(/Arrivée membre/i));
    fireEvent.click(screen.getByRole('button', { name: /^enregistrer$/i }));
    await Promise.resolve();
    expect(saveLogsConfigMock).toHaveBeenCalledTimes(1);
    const [, savedConfig] = saveLogsConfigMock.mock.calls[0] as [string, LogsConfigClient];
    const simpleRoute = savedConfig.routes.find(
      (r) => r.id === '00000000-0000-4000-8000-000000000001',
    );
    const preservedAdvanced = savedConfig.routes.find((r) => r.id === 'advanced-route-xyz');
    expect(simpleRoute).toBeDefined();
    expect(simpleRoute?.events).toEqual(['guild.memberJoin']);
    expect(preservedAdvanced).toBeDefined();
    expect(preservedAdvanced?.events).toEqual(['guild.memberLeave']);
  });

  it('remplace une route SIMPLE_ROUTE_ID existante sans dupliquer', async () => {
    saveLogsConfigMock.mockResolvedValueOnce({ ok: true });
    const setConfig = vi.fn();
    const config: LogsConfigClient = {
      ...emptyConfig,
      routes: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          label: 'Logs',
          events: ['guild.memberJoin'],
          channelId: channels[0]?.id ?? '',
          verbosity: 'detailed',
        },
      ],
    };
    render(
      <LogsSimpleMode guildId="g1" config={config} setConfig={setConfig} channels={channels} />,
    );
    fireEvent.click(screen.getByLabelText(/Message supprimé/i));
    fireEvent.click(screen.getByRole('button', { name: /^enregistrer$/i }));
    await Promise.resolve();
    const [, savedConfig] = saveLogsConfigMock.mock.calls[0] as [string, LogsConfigClient];
    expect(savedConfig.routes).toHaveLength(1);
    expect([...(savedConfig.routes[0]?.events ?? [])].sort()).toEqual(
      ['guild.memberJoin', 'guild.messageDelete'].sort(),
    );
  });
});
