/**
 * Messages localisés du module `hello-world`. Deux locales V1 : `fr`
 * et `en`. L'i18n minimal du core (`createI18n`) applique le fallback
 * sur `en` quand la clé manque dans la locale primaire.
 */
export const locales = {
  fr: {
    'ping.pong': 'Pong !',
    'welcome.greeting': 'Bienvenue, <@{userId}> !',
  },
  en: {
    'ping.pong': 'Pong!',
    'welcome.greeting': 'Welcome, <@{userId}>!',
  },
} as const;
