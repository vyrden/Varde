'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import type { BotLanguage, BotTimezone } from './bot-settings-client.js';

/**
 * Server action de mise à jour des paramètres bot d'une guild.
 * Pattern miroir d'`ai-settings-actions.ts` : forward du cookie de
 * session au Fastify, mutations invalidées via `revalidatePath`.
 */

// biome-ignore lint/complexity/useLiteralKeys: TS noPropertyAccessFromIndexSignature requires bracket access on process.env
const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';
const SESSION_COOKIE = 'varde.session';

const buildCookieHeader = async (): Promise<string> => {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE);
  return session ? `${SESSION_COOKIE}=${session.value}` : '';
};

export interface BotSettingsMutationResult {
  readonly ok: boolean;
  readonly status?: number;
  readonly code?: string;
  readonly message?: string;
}

export interface SaveBotSettingsInput {
  readonly language: BotLanguage;
  readonly timezone: BotTimezone;
  readonly embedColor: string;
}

const parseError = async (
  response: Response,
): Promise<Pick<BotSettingsMutationResult, 'code' | 'message'>> => {
  try {
    const body = (await response.json()) as { error?: string; message?: string };
    return {
      ...(body.error ? { code: body.error } : {}),
      ...(body.message ? { message: body.message } : {}),
    };
  } catch {
    return {};
  }
};

export async function saveBotSettings(
  guildId: string,
  input: SaveBotSettingsInput,
): Promise<BotSettingsMutationResult> {
  const response = await fetch(`${API_URL}/guilds/${encodeURIComponent(guildId)}/settings/bot`, {
    method: 'PUT',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      cookie: await buildCookieHeader(),
    },
    body: JSON.stringify(input),
  });

  if (response.status === 204) {
    revalidatePath(`/guilds/${guildId}/settings/bot`);
    return { ok: true };
  }

  const parsed = await parseError(response);
  return {
    ok: false,
    status: response.status,
    ...parsed,
  };
}
