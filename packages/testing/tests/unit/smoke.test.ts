import { defineModule, type GuildId } from '@varde/contracts';
import { describe, expect, it } from 'vitest';

import { createTestHarness } from '../../src/harness.js';

const GUILD: GuildId = '111' as GuildId;

const minimalModule = defineModule({
  manifest: {
    id: 'smoke' as never,
    name: 'smoke',
    version: '1.0.0',
    coreVersion: '^1.0.0',
    description: 'smoke',
    author: { name: 'X' },
    license: 'Apache-2.0',
    schemaVersion: 0,
    permissions: [],
    events: { listen: [], emit: [] },
  },
});

describe('createTestHarness — smoke', () => {
  it('monte un core SQLite, pré-crée une guild, charge un module minimal', async () => {
    const harness = await createTestHarness({
      guilds: [{ id: GUILD, name: 'Alpha' }],
    });
    try {
      await harness.loadModule(minimalModule);
      expect(harness.loader.isLoaded('smoke' as never)).toBe(true);
    } finally {
      await harness.close();
    }
  });

  it('advanceTime fait avancer l horloge retournée par now()', async () => {
    const start = new Date('2026-05-01T12:00:00.000Z');
    const harness = await createTestHarness({ startTime: start });
    try {
      harness.advanceTime(1_500);
      expect(harness.now().toISOString()).toBe('2026-05-01T12:00:01.500Z');
    } finally {
      await harness.close();
    }
  });
});
