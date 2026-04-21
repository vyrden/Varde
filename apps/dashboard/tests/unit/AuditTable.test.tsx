import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AuditTable } from '../../components/AuditTable';
import type { AuditLogItemDto } from '../../lib/api-client';

const row = (overrides: Partial<AuditLogItemDto> = {}): AuditLogItemDto => ({
  id: '01HZ00000000000000000000X1',
  guildId: '111',
  actorType: 'user',
  actorId: '42',
  action: 'core.config.updated',
  targetType: null,
  targetId: null,
  moduleId: null,
  severity: 'info',
  metadata: {},
  createdAt: '2026-04-21T10:00:00.000Z',
  ...overrides,
});

describe('AuditTable', () => {
  it('affiche un EmptyState quand la liste est vide', () => {
    render(<AuditTable items={[]} />);
    expect(screen.getByText("Aucune entrée d'audit")).toBeDefined();
  });

  it('rend une ligne par item avec action / acteur / sévérité', () => {
    render(
      <AuditTable
        items={[
          row({ id: '01A', action: 'core.config.updated', severity: 'info' }),
          row({
            id: '01B',
            action: 'moderation.warn',
            severity: 'warn',
            actorType: 'module',
            actorId: 'moderation',
          }),
          row({ id: '01C', action: 'core.boot.failed', severity: 'error', actorType: 'system' }),
        ]}
      />,
    );
    expect(screen.getByText('core.config.updated')).toBeDefined();
    expect(screen.getByText('moderation.warn')).toBeDefined();
    expect(screen.getByText('core.boot.failed')).toBeDefined();
    expect(screen.getByText('système')).toBeDefined();
    expect(screen.getByText('module moderation')).toBeDefined();
    // Trois badges sévérité
    expect(screen.getByText('info')).toBeDefined();
    expect(screen.getByText('warn')).toBeDefined();
    expect(screen.getByText('error')).toBeDefined();
  });

  it('résume la metadata quand présente', () => {
    render(
      <AuditTable
        items={[
          row({
            id: '01A',
            metadata: { scope: 'modules.hello-world', welcomeDelayMs: 500 },
          }),
        ]}
      />,
    );
    const cell = screen.getByText(/scope: modules.hello-world/);
    expect(cell.textContent).toContain('welcomeDelayMs: 500');
  });

  it('retombe sur un tiret quand la metadata est vide', () => {
    render(<AuditTable items={[row({ metadata: {} })]} />);
    expect(screen.getByText('—')).toBeDefined();
  });
});
