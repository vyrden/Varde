import { cookies } from 'next/headers';

import type { BotSettingsDto } from './bot-settings-types.js';

/**
 * Client SSR vers `/guilds/:guildId/settings/bot`. Réservé aux
 * Server Components (utilise `next/headers` → cookies). Pour les
 * Client Components, importer les types/constantes depuis
 * `./bot-settings-types`.
 */

const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';
const SESSION_COOKIE = 'varde.session';

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
