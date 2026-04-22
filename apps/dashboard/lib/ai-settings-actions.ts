'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import type { AiProviderId } from './ai-settings-client.js';

/**
 * Server actions pour la page paramètres IA. Pattern identique à
 * `onboarding-actions.ts` : le Next forwarde le cookie au Fastify,
 * pas d'exposition de l'API vers le navigateur, les mutations
 * invalident la page via `revalidatePath`.
 *
 * Les actions acceptent un `FormData` plutôt qu'un objet JS parce
 * que Next.js Turbopack expand les args objets dans ses dev logs —
 * on a vu la clé OpenAI apparaître en clair côté terminal. `FormData`
 * est loggé comme objet opaque, la clé reste cachée. L'arbitrage
 * est en dev : en prod les server actions ne sont pas loggées, mais
 * la règle "ne logge pas les secrets" s'applique aussi au dev.
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

type SaveBody =
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

/**
 * Extrait le `SaveBody` d'un FormData. Toute valeur absente tombe
 * en défaut raisonnable ; les champs requis manquants (endpoint /
 * model sur ollama / openai-compat) remontent une erreur structurée
 * consommée par l'UI.
 */
const bodyFromFormData = (formData: FormData): SaveBody | { error: string } => {
  const providerId = formData.get('providerId') as AiProviderId | null;
  if (providerId === 'none' || providerId === null) {
    return { providerId: 'none' };
  }
  const endpoint = (formData.get('endpoint') ?? '').toString().trim();
  const model = (formData.get('model') ?? '').toString().trim();
  if (endpoint.length === 0) return { error: 'endpoint requis' };
  if (model.length === 0) return { error: 'model requis' };
  if (providerId === 'ollama') {
    return { providerId: 'ollama', endpoint, model };
  }
  if (providerId === 'openai-compat') {
    const rawKey = formData.get('apiKey');
    const apiKey = typeof rawKey === 'string' && rawKey.length > 0 ? rawKey : undefined;
    return {
      providerId: 'openai-compat',
      endpoint,
      model,
      ...(apiKey !== undefined ? { apiKey } : {}),
    };
  }
  return { error: `providerId inconnu : ${String(providerId)}` };
};

export async function saveAiSettings(
  guildId: string,
  formData: FormData,
): Promise<AiSettingsMutationResult> {
  const body = bodyFromFormData(formData);
  if ('error' in body) {
    return { ok: false, message: body.error };
  }
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

export async function testAiSettings(guildId: string, formData: FormData): Promise<AiTestResult> {
  const body = bodyFromFormData(formData);
  if ('error' in body) {
    return { ok: false, message: body.error };
  }
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
