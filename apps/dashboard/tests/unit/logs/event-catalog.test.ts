// apps/dashboard/tests/unit/logs/event-catalog.test.ts
import { describe, expect, it } from 'vitest';

import { ALL_EVENT_IDS, EVENT_GROUPS, EVENT_LABEL } from '../../../components/logs/event-catalog';

describe('EVENT_GROUPS', () => {
  it('contient exactement 4 groupes dans l ordre Membres, Messages, Salons, Rôles', () => {
    expect(EVENT_GROUPS.map((g) => g.id)).toEqual(['members', 'messages', 'channels', 'roles']);
    expect(EVENT_GROUPS.map((g) => g.label)).toEqual(['Membres', 'Messages', 'Salons', 'Rôles']);
  });

  it('chaque groupe contient 3 events (total 12)', () => {
    for (const group of EVENT_GROUPS) {
      expect(group.events).toHaveLength(3);
    }
    expect(ALL_EVENT_IDS).toHaveLength(12);
  });

  it('tous les event ids sont préfixés guild. et uniques', () => {
    const seen = new Set<string>();
    for (const id of ALL_EVENT_IDS) {
      expect(id.startsWith('guild.')).toBe(true);
      expect(seen.has(id), `duplicate ${id}`).toBe(false);
      seen.add(id);
    }
  });

  it('guild.messageCreate porte le hint bruyant', () => {
    const group = EVENT_GROUPS.find((g) => g.id === 'messages');
    const messageCreate = group?.events.find((e) => e.id === 'guild.messageCreate');
    expect(messageCreate?.hint).toBe('bruyant');
  });

  it('exclut les meta-events guild.join et guild.leave', () => {
    expect(ALL_EVENT_IDS).not.toContain('guild.join');
    expect(ALL_EVENT_IDS).not.toContain('guild.leave');
  });
});

describe('EVENT_LABEL', () => {
  it('mappe tous les event ids vers un libellé FR non-vide', () => {
    for (const id of ALL_EVENT_IDS) {
      const label = EVENT_LABEL[id];
      expect(label, `pas de label pour ${id}`).toBeTruthy();
      expect(typeof label).toBe('string');
    }
  });

  it('contient exactement 12 entrées', () => {
    expect(Object.keys(EVENT_LABEL)).toHaveLength(12);
  });
});
