/**
 * Types et constantes runtime des paramètres bot. Pas d'import
 * `next/headers` ici — fichier consommable depuis les Client
 * Components (form options, validation côté navigateur). Le fetch
 * SSR vit dans `bot-settings-client.ts`, le call mutation dans
 * `bot-settings-actions.ts`.
 */

export const BOT_LANGUAGES = ['en', 'fr', 'es', 'de'] as const;
export type BotLanguage = (typeof BOT_LANGUAGES)[number];

export const BOT_TIMEZONES = [
  'UTC',
  'Europe/Paris',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Lisbon',
  'Europe/Athens',
  'Europe/Moscow',
  'Africa/Casablanca',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Pacific/Honolulu',
] as const;
export type BotTimezone = (typeof BOT_TIMEZONES)[number];

export interface BotSettingsDto {
  readonly language: BotLanguage;
  readonly timezone: BotTimezone;
  readonly embedColor: string;
  readonly updatedAt: string | null;
}
