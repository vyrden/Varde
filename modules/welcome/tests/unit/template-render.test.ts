import { describe, expect, it } from 'vitest';

import { renderTemplate } from '../../src/template-render.js';

describe('renderTemplate', () => {
  const baseVars = {
    user: 'Alice',
    userMention: '<@123>',
    userTag: 'alice#0001',
    guild: 'Mon Serveur',
    memberCount: 42,
    accountAgeDays: 730,
  };

  it('substitue toutes les variables connues', () => {
    expect(renderTemplate('Bienvenue {user.mention} sur {guild} ({memberCount}ᵉ)', baseVars)).toBe(
      'Bienvenue <@123> sur Mon Serveur (42ᵉ)',
    );
  });

  it('formate accountAge en jours / mois / années', () => {
    expect(renderTemplate('{accountAge}', { ...baseVars, accountAgeDays: 5 })).toBe('5 jours');
    expect(renderTemplate('{accountAge}', { ...baseVars, accountAgeDays: 60 })).toBe('2 mois');
    expect(renderTemplate('{accountAge}', { ...baseVars, accountAgeDays: 800 })).toBe('2 ans');
  });

  it('laisse {var} inchangé si variable absente (fail loud)', () => {
    expect(renderTemplate('Salut {unknown}', baseVars)).toBe('Salut {unknown}');
  });

  it('omet accountAge si non fourni', () => {
    const noAge = { ...baseVars };
    delete (noAge as { accountAgeDays?: number }).accountAgeDays;
    expect(renderTemplate('{accountAge}', noAge)).toBe('{accountAge}');
  });

  it("singularise 'jour' à 1", () => {
    expect(renderTemplate('{accountAge}', { ...baseVars, accountAgeDays: 1 })).toBe('1 jour');
  });
});
