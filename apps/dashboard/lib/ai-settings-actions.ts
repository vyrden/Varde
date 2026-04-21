'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import type { AiProviderId } from './ai-settings-client.js';

/**
 * Server actions pour la page paramètres IA. Pattern identique à
 * `onboarding-actions.ts` : le Next forwarde le cookie au Fastify,
 * pas d'exposition de l'API vers le navigateur, les mutations
 * invalident la page via `revalidatePath`.
 */

const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';
const SESSION_COOKIE = 'varde.session';

const buildCookieHeader = async (): Promise<string> => {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE);
  return session ? `${SESSION_COOKIE}=${session.value}` : '';
};

export interface AiSettingsMutationResult {
  readonly ok: boolean;
  readonly status?: number;
  readonly code?: string;
  readonly message?: string;
}

export interface AiTestResult {
  readonly ok: boolean;
  readonly status?: number;
  readonly code?: string;
  readonly message?: string;
  readonly data?: {
    readonly providerId: AiProviderId;
    readonly model: string;
    readonly ok: boolean;
    readonly latencyMs: number;
    readonly details?: string;
  };
}

export type SaveBody =
  | { providerId: 'none' }
  | { providerId: 'ollama'; endpoint: string; model: string }
  | { providerId: 'openai-compat'; endpoint: string; model: string; apiKey?: string };

const parseError = async (
  response: Response,
): Promise<Pick<AiSettingsMutationResult, 'code' | 'message'>> => {
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

export async function saveAiSettings(
  guildId: string,
  body: SaveBody,
): Promise<AiSettingsMutationResult> {
  const response = await fetch(`${API_URL}/guilds/${encodeURIComponent(guildId)}/settings/ai`, {
    method: 'PUT',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      cookie: await buildCookieHeader(),
    },
    body: JSON.stringify(body),
  });
  if (response.status === 204) {
    revalidatePath(`/guilds/${guildId}/settings/ai`);
    return { ok: true };
  }
  const err = await parseError(response);
  return { ok: false, status: response.status, ...err };
}

export async function testAiSettings(guildId: string, body: SaveBody): Promise<AiTestResult> {
  const response = await fetch(
    `${API_URL}/guilds/${encodeURIComponent(guildId)}/settings/ai/test`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: await buildCookieHeader(),
      },
      body: JSON.stringify(body),
    },
  );
  if (response.ok) {
    const data = (await response.json()) as NonNullable<AiTestResult['data']>;
    return { ok: true, data };
  }
  const err = await parseError(response);
  return { ok: false, status: response.status, ...err };
}
