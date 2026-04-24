import { describe, expect, it } from 'vitest';

import {
  isPairValid,
  type PairDraft,
  parseEmoji,
} from '../../../components/reaction-roles/ReactionRoleEditor';

// ---------------------------------------------------------------------------
// parseEmoji
// ---------------------------------------------------------------------------

describe('parseEmoji', () => {
  it('retourne null pour une chaîne vide ou espaces', () => {
    expect(parseEmoji('')).toBeNull();
    expect(parseEmoji('   ')).toBeNull();
  });

  it('parse un emoji unicode brut', () => {
    expect(parseEmoji('🎉')).toEqual({ type: 'unicode', value: '🎉' });
    expect(parseEmoji('  🇪🇺  ')).toEqual({ type: 'unicode', value: '🇪🇺' });
  });

  it('parse un emoji custom non-animé <:name:id>', () => {
    expect(parseEmoji('<:rocket:123456789012345678>')).toEqual({
      type: 'custom',
      id: '123456789012345678',
      name: 'rocket',
      animated: false,
    });
  });

  it('parse un emoji custom animé <a:name:id>', () => {
    expect(parseEmoji('<a:fire:987654321098765432>')).toEqual({
      type: 'custom',
      id: '987654321098765432',
      name: 'fire',
      animated: true,
    });
  });

  it('traite une forme custom malformée comme unicode', () => {
    // id trop court (< 17 chiffres) — ne passe pas le regex, traité comme unicode
    const result = parseEmoji('<:bad:123>');
    expect(result).toEqual({ type: 'unicode', value: '<:bad:123>' });
  });
});

// ---------------------------------------------------------------------------
// isPairValid
// ---------------------------------------------------------------------------

describe('isPairValid', () => {
  it("valide une paire 'existing' avec emoji et roleId", () => {
    const pair: PairDraft = {
      uid: 'u1',
      emoji: '🎉',
      roleMode: 'existing',
      roleId: '111111111111111111',
    };
    expect(isPairValid(pair)).toBe(true);
  });

  it("invalide une paire 'existing' sans roleId", () => {
    const pair: PairDraft = { uid: 'u1', emoji: '🎉', roleMode: 'existing', roleId: '' };
    expect(isPairValid(pair)).toBe(false);
  });

  it("valide une paire 'create' avec emoji et roleName", () => {
    const pair: PairDraft = { uid: 'u1', emoji: '🌍', roleMode: 'create', roleName: 'Europe' };
    expect(isPairValid(pair)).toBe(true);
  });

  it("invalide une paire 'create' sans roleName", () => {
    const pair: PairDraft = { uid: 'u1', emoji: '🌍', roleMode: 'create', roleName: '' };
    expect(isPairValid(pair)).toBe(false);
  });

  it('invalide une paire avec emoji vide', () => {
    const pair: PairDraft = {
      uid: 'u1',
      emoji: '',
      roleMode: 'existing',
      roleId: '111111111111111111',
    };
    expect(isPairValid(pair)).toBe(false);
  });
});
