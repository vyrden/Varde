import { describe, expect, it } from 'vitest';

import { createI18n } from '../../src/i18n.js';

const messages = {
  en: {
    greeting: 'Hello, {name}!',
    bye: 'See you later',
  },
  fr: {
    greeting: 'Bonjour, {name} !',
  },
};

describe('createI18n', () => {
  it('rend la chaîne de la locale primaire', () => {
    const i18n = createI18n({ messages, locale: 'fr', fallbackLocale: 'en' });
    expect(i18n.t('greeting', { name: 'Alice' })).toBe('Bonjour, Alice !');
  });

  it('retombe sur le fallback quand la clé manque dans la locale primaire', () => {
    const i18n = createI18n({ messages, locale: 'fr', fallbackLocale: 'en' });
    expect(i18n.t('bye')).toBe('See you later');
  });

  it('retourne la clé quand rien ne correspond', () => {
    const i18n = createI18n({ messages, locale: 'fr', fallbackLocale: 'en' });
    expect(i18n.t('unknown.key')).toBe('unknown.key');
  });

  it('laisse les placeholders non renseignés tels quels', () => {
    const i18n = createI18n({ messages, locale: 'en' });
    expect(i18n.t('greeting')).toBe('Hello, {name}!');
  });

  it('interpole des nombres correctement', () => {
    const i18n = createI18n({
      messages: { en: { score: 'Score: {points}' } },
      locale: 'en',
    });
    expect(i18n.t('score', { points: 42 })).toBe('Score: 42');
  });

  it('résout la locale dynamiquement quand `locale` est un getter', () => {
    let current = 'en';
    const i18n = createI18n({
      messages,
      locale: () => current,
      fallbackLocale: 'en',
    });
    expect(i18n.t('greeting', { name: 'Alice' })).toBe('Hello, Alice!');
    current = 'fr';
    expect(i18n.t('greeting', { name: 'Alice' })).toBe('Bonjour, Alice !');
  });
});
