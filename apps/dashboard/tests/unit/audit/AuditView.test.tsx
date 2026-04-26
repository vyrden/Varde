import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadAuditPage = vi.fn();

vi.mock('../../../lib/audit-actions', () => ({
  loadAuditPage: (...args: unknown[]) => loadAuditPage(...args),
}));

import { AuditView } from '../../../components/audit/AuditView';
import type { AuditLogItemDto } from '../../../lib/api-client';

// ---------------------------------------------------------------------------
// IntersectionObserver mock — happy-dom n'en fournit pas par défaut.
// On garde une référence à l'instance pour pouvoir déclencher
// manuellement l'entrée dans le viewport via `triggerIntersect`.
// ---------------------------------------------------------------------------

interface ObserverHandle {
  readonly callback: IntersectionObserverCallback;
  readonly target: Element;
}

const observers: ObserverHandle[] = [];

class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: readonly number[] = [0];
  // Field récent (TS lib `dom`) — pas utilisé par AuditView mais
  // requis par le shape de l'interface en strict mode.
  readonly scrollMargin: string = '';
  constructor(private readonly cb: IntersectionObserverCallback) {}
  observe(target: Element): void {
    observers.push({ callback: this.cb, target });
  }
  unobserve(target: Element): void {
    const idx = observers.findIndex((o) => o.target === target);
    if (idx >= 0) observers.splice(idx, 1);
  }
  disconnect(): void {
    for (let i = observers.length - 1; i >= 0; i -= 1) {
      const o = observers[i];
      if (o && o.callback === this.cb) observers.splice(i, 1);
    }
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

const triggerIntersect = (): void => {
  for (const observer of observers) {
    observer.callback(
      [
        {
          isIntersecting: true,
          target: observer.target,
          time: Date.now(),
          boundingClientRect: {} as DOMRectReadOnly,
          intersectionRatio: 1,
          intersectionRect: {} as DOMRectReadOnly,
          rootBounds: null,
        },
      ],
      observer as unknown as IntersectionObserver,
    );
  }
};

beforeEach(() => {
  observers.length = 0;
  loadAuditPage.mockReset();
  globalThis.IntersectionObserver = MockIntersectionObserver;
});

afterEach(() => {
  observers.length = 0;
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const buildItem = (overrides: Partial<AuditLogItemDto> = {}): AuditLogItemDto => ({
  id: '01HZ00000000000000000000A1',
  guildId: '111',
  actorType: 'user',
  actorId: '42',
  action: 'core.config.updated',
  targetType: null,
  targetId: null,
  moduleId: null,
  severity: 'info',
  metadata: {},
  createdAt: new Date().toISOString(),
  ...overrides,
});

const initialPage = (
  items: readonly AuditLogItemDto[],
  nextCursor?: string,
): { items: readonly AuditLogItemDto[]; nextCursor?: string } => ({
  items,
  ...(nextCursor !== undefined ? { nextCursor } : {}),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuditView', () => {
  it('rend une ligne par item initial avec action mono-formatée', () => {
    render(
      <AuditView
        guildId="g1"
        initialItems={[
          buildItem({ id: '01A', action: 'core.config.updated' }),
          buildItem({ id: '01B', action: 'reaction-roles.role.assigned' }),
        ]}
        initialNextCursor={undefined}
        initialFilters={{}}
        knownActions={[]}
      />,
    );
    // Le namespace + le suffixe sont rendus dans des spans séparés ;
    // on vérifie via les morceaux distincts du split.
    expect(screen.getByText('core')).toBeDefined();
    expect(screen.getByText('.config.updated')).toBeDefined();
    expect(screen.getByText('reaction-roles')).toBeDefined();
    expect(screen.getByText('.role.assigned')).toBeDefined();
  });

  it("affiche '✓ Toutes les entrées sont chargées' quand cursor est absent", () => {
    render(
      <AuditView
        guildId="g1"
        initialItems={[buildItem({ id: '01A' })]}
        initialNextCursor={undefined}
        initialFilters={{}}
        knownActions={[]}
      />,
    );
    expect(screen.getByText(/Toutes les entrées sont chargées/i)).toBeDefined();
  });

  it('affiche un empty state cliquable Réinitialiser quand 0 items et filtres actifs', () => {
    render(
      <AuditView
        guildId="g1"
        initialItems={[]}
        initialNextCursor={undefined}
        initialFilters={{ action: 'foo' }}
        knownActions={[]}
      />,
    );
    expect(screen.getByText(/Aucune entrée trouvée/i)).toBeDefined();
    // Bouton dédié de l'empty state, distinct du ✕ de la barre de filtres
    expect(screen.getByRole('button', { name: /Réinitialiser les filtres/i })).toBeTruthy();
  });

  it('scroll infini : la sentinelle déclenche un fetch et appende les items', async () => {
    const initial = [buildItem({ id: '01A', action: 'core.config.updated' })];
    const next = [
      buildItem({ id: '01B', action: 'reaction-roles.role.assigned' }),
      buildItem({ id: '01C', action: 'welcome.greeted' }),
    ];
    loadAuditPage.mockResolvedValue(initialPage(next, undefined));

    render(
      <AuditView
        guildId="g1"
        initialItems={initial}
        initialNextCursor="cursor-page-2"
        initialFilters={{}}
        knownActions={[]}
      />,
    );

    triggerIntersect();
    await waitFor(() => expect(loadAuditPage).toHaveBeenCalledTimes(1));
    expect(loadAuditPage).toHaveBeenCalledWith('g1', { cursor: 'cursor-page-2' });

    // Les nouveaux items sont apparus et le footer signale fin de liste
    await screen.findByText('.role.assigned');
    expect(screen.getByText('.greeted')).toBeDefined();
    expect(screen.getByText(/Toutes les entrées sont chargées/i)).toBeDefined();
  });

  it('filtrage : submit reset les items et appelle loadAuditPage avec les nouveaux filtres', async () => {
    const filteredPage = [buildItem({ id: '02A', severity: 'warn', action: 'logs.route.test' })];
    loadAuditPage.mockResolvedValue(initialPage(filteredPage, undefined));

    render(
      <AuditView
        guildId="g1"
        initialItems={[buildItem({ id: '01A' })]}
        initialNextCursor={undefined}
        initialFilters={{}}
        knownActions={[]}
      />,
    );

    fireEvent.change(screen.getByLabelText('Action'), {
      target: { value: 'logs.route.test' },
    });
    fireEvent.change(screen.getByLabelText('Sévérité'), { target: { value: 'warn' } });
    fireEvent.click(screen.getByRole('button', { name: /^Filtrer$/i }));

    await waitFor(() => expect(loadAuditPage).toHaveBeenCalledTimes(1));
    expect(loadAuditPage).toHaveBeenCalledWith('g1', {
      action: 'logs.route.test',
      severity: 'warn',
    });
    await screen.findByText('.route.test');
  });

  it('réinitialisation : ✕ vide les filtres et appelle loadAuditPage sans filtre', async () => {
    loadAuditPage.mockResolvedValue(initialPage([buildItem({ id: '02A' })], undefined));

    render(
      <AuditView
        guildId="g1"
        initialItems={[buildItem({ id: '01A' })]}
        initialNextCursor={undefined}
        initialFilters={{ action: 'logs.test' }}
        knownActions={[]}
      />,
    );

    // 1 filtre actif → bouton ✕ visible
    const resetBtn = screen.getByRole('button', { name: /Réinitialiser/i });
    fireEvent.click(resetBtn);

    await waitFor(() => expect(loadAuditPage).toHaveBeenCalledTimes(1));
    expect(loadAuditPage).toHaveBeenCalledWith('g1', {});
    expect((screen.getByLabelText('Action') as HTMLInputElement).value).toBe('');
  });

  it('affiche les compteurs sidebar (entrées chargées + acteurs distincts)', () => {
    render(
      <AuditView
        guildId="g1"
        initialItems={[
          buildItem({ id: '01A', actorType: 'user', actorId: '42' }),
          buildItem({ id: '01B', actorType: 'user', actorId: '42' }),
          buildItem({ id: '01C', actorType: 'system', actorId: null }),
        ]}
        initialNextCursor={undefined}
        initialFilters={{}}
        knownActions={[]}
      />,
    );
    // 3 entrées, 2 acteurs distincts (user:42 + system).
    expect(screen.getByText('3')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
  });
});
