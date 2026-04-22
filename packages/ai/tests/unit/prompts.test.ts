import { describe, expect, it } from 'vitest';

import {
  buildGeneratePresetPrompt,
  buildSuggestCompletionPrompt,
  PROMPT_VERSIONS,
} from '../../src/index.js';

describe('buildGeneratePresetPrompt', () => {
  it('produit un couple system/user versionné v1', () => {
    const p = buildGeneratePresetPrompt({
      description: 'une commu tech',
      locale: 'fr',
      hints: ['dev', 'ops'],
    });
    expect(p.version).toBe(PROMPT_VERSIONS.generatePreset);
    expect(p.system).toContain('JSON');
    expect(p.user).toContain('une commu tech');
    expect(p.user).toContain('dev, ops');
  });

  it('utilise le system EN quand locale=en', () => {
    const p = buildGeneratePresetPrompt({
      description: 'a tech community',
      locale: 'en',
      hints: [],
    });
    expect(p.system).toMatch(/English/i);
    expect(p.user).toContain('a tech community');
  });

  it('omet la ligne hints quand aucun hint', () => {
    const p = buildGeneratePresetPrompt({
      description: 'anything',
      locale: 'fr',
      hints: [],
    });
    expect(p.user).not.toContain('Tags indicatifs');
  });
});

describe('buildSuggestCompletionPrompt', () => {
  it('sérialise le draft et le kind dans le user message', () => {
    const p = buildSuggestCompletionPrompt({
      kind: 'role',
      contextDraft: { locale: 'fr', roles: [] },
      hint: 'modérateur léger',
    });
    expect(p.version).toBe(PROMPT_VERSIONS.suggestCompletion);
    expect(p.user).toContain('role');
    expect(p.user).toContain('"locale":"fr"');
    expect(p.user).toContain('modérateur léger');
  });

  it('omet la ligne hint quand absente', () => {
    const p = buildSuggestCompletionPrompt({
      kind: 'channel',
      contextDraft: {},
    });
    expect(p.user).not.toContain('Indice :');
  });
});
