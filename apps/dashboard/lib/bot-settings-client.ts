import { cookies } from 'next/headers';

/**
 * Client léger vers `/guilds/:guildId/settings/bot`. Shapes DTO
 * recopiées depuis `apps/api/src/routes/bot-settings.ts` pour éviter
 * de charger Fastify côté dashboard.
 */

// biome-ignore lint/complexity/useLiteralKeys: TS noPropertyAccessFromIndexSignature requires bracket access on process.env
const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';
const SESSION_COOKIE = 'varde.session';

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

const buildCookieHeader = async (): Promise<string> => {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE);
  return session ? `${SESSION_COOKIE}=${session.value}` : '';
};

export class BotSettingsApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function fetchBotSettings(guildId: string): Promise<BotSettingsDto> {
  const response = await fetch(`${API_URL}/guilds/${encodeURIComponent(guildId)}/settings/bot`, {
    cache: 'no-store',
    headers: { accept: 'application/json', cookie: await buildCookieHeader() },
  });
  if (!response.ok) {
    throw new BotSettingsApiError(response.status, `GET settings/bot a répondu ${response.status}`);
  }
  return (await response.json()) as BotSettingsDto;
}
