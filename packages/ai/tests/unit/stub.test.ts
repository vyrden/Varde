import { describe, expect, it } from 'vitest';

import { createStubProvider, STUB_PRESET_COUNT } from '../../src/index.js';

describe('createStubProvider — generatePreset', () => {
  const stub = createStubProvider();

  it('reconnaît un match "tech"', async () => {
    const r = await stub.generatePreset({
      description: 'Une commu dev tech, on parle de code et de devops.',
      locale: 'fr',
      hints: [],
    });
    expect(r.preset.id).toBe('community-tech-small');
    expect(r.confidence).toBeGreaterThan(0);
  });

  it('reconnaît un match "gaming"', async () => {
    const r = await stub.generatePreset({
      description: 'Small gaming server, LFG and voice rooms.',
      locale: 'en',
      hints: ['gaming'],
    });
    expect(r.preset.id).toBe('community-gaming-small');
  });

  it('reconnaît un match "créatif"', async () => {
    const r = await stub.generatePreset({
      description: 'Groupe d artistes, design et illustration.',
      locale: 'fr',
      hints: [],
    });
    expect(r.preset.id).toBe('community-creative');
  });

  it('reconnaît un match "étude"', async () => {
    const r = await stub.generatePreset({
      description: 'Groupe étude révisions.',
      locale: 'fr',
      hints: [],
    });
    expect(r.preset.id).toBe('community-study-group');
  });

  it('tombe sur le starter minimal en absence de match', async () => {
    const r = await stub.generatePreset({
      description: 'xyzzy plugh quark quux',
      locale: 'fr',
      hints: [],
    });
    expect(r.preset.id).toBe('community-generic-starter');
    expect(r.confidence).toBeLessThan(0.5);
  });

  it('est déterministe pour une entrée donnée', async () => {
    const input = {
      description: 'commu tech dev',
      locale: 'fr' as const,
      hints: ['tech'],
    };
    const r1 = await stub.generatePreset(input);
    const r2 = await stub.generatePreset(input);
    expect(r1.preset.id).toBe(r2.preset.id);
    expect(r1.confidence).toBe(r2.confidence);
  });

  it('couvre les 5 presets du catalogue via au moins une règle', () => {
    expect(STUB_PRESET_COUNT).toBeGreaterThanOrEqual(5);
  });
});

describe('createStubProvider — suggestCompletion', () => {
  const stub = createStubProvider();

  it('renvoie au moins une suggestion de rôle', async () => {
    const r = await stub.suggestCompletion({
      kind: 'role',
      contextDraft: { roles: [], categories: [], channels: [], modules: [] },
    });
    expect(r.length).toBeGreaterThan(0);
    expect(r[0]?.patch).toBeDefined();
  });

  it('renvoie au moins une suggestion de catégorie', async () => {
    const r = await stub.suggestCompletion({
      kind: 'category',
      contextDraft: {},
    });
    expect(r.length).toBeGreaterThan(0);
  });

  it('renvoie au moins une suggestion de salon', async () => {
    const r = await stub.suggestCompletion({
      kind: 'channel',
      contextDraft: {},
    });
    expect(r.length).toBeGreaterThan(0);
    expect(r[0]?.label).toMatch(/annonces|general/);
  });
});

describe('createStubProvider — testConnection', () => {
  it('répond ok=true sans réseau', async () => {
    const stub = createStubProvider();
    const info = await stub.testConnection();
    expect(info.ok).toBe(true);
    expect(info.id).toBe('stub');
    expect(info.latencyMs).toBe(0);
  });
});
