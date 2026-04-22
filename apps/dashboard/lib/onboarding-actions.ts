'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import type {
  GeneratedPresetDto,
  OnboardingPreviewDto,
  OnboardingSessionDto,
  SuggestCompletionResponseDto,
  SuggestionKind,
} from './onboarding-client.js';

/**
 * Server actions pour les routes `/onboarding/*` côté dashboard. Même
 * pattern que `lib/actions.ts` pour la config module : pas de CORS
 * ouvert, le Next forwarde le cookie de session au Fastify.
 *
 * Chaque action renvoie `{ ok, session? } | { ok: false, status, code?, message? }`.
 * Les server actions qui mutent l'état invalident le cache du path de
 * la page onboarding via `revalidatePath` pour que le server
 * component re-fetch la session fraîche après redirect vers la même
 * URL.
 */

const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';
const SESSION_COOKIE = 'varde.session';

const buildCookieHeader = async (): Promise<string> => {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE);
  return session ? `${SESSION_COOKIE}=${session.value}` : '';
};

export interface OnboardingMutationResult<T> {
  readonly ok: boolean;
  readonly status?: number;
  readonly code?: string;
  readonly message?: string;
  readonly data?: T;
}

type Fetcher<T> = Promise<OnboardingMutationResult<T>>;

const invalidate = (guildId: string): void => {
  revalidatePath(`/guilds/${guildId}/onboarding`);
};

const parseErrorBody = async (
  response: Response,
): Promise<Pick<OnboardingMutationResult<never>, 'code' | 'message'>> => {
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
 * Crée une session à partir d'un preset. Le dashboard ne propose que
 * `source: 'preset'` en V1 ; la création blank est supportée côté API
 * mais réservée à des usages futurs (script d'install, test manuel).
 */
export async function startOnboardingWithPreset(
  guildId: string,
  presetId: string,
): Fetcher<OnboardingSessionDto> {
  const response = await fetch(`${API_URL}/guilds/${encodeURIComponent(guildId)}/onboarding`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      cookie: await buildCookieHeader(),
    },
    body: JSON.stringify({ source: 'preset', presetId }),
  });
  if (response.status === 201) {
    const data = (await response.json()) as OnboardingSessionDto;
    invalidate(guildId);
    return { ok: true, data };
  }
  const err = await parseErrorBody(response);
  return { ok: false, status: response.status, ...err };
}

/**
 * Appelle `/onboarding/ai/generate-preset` : génère une proposition
 * IA sans créer de session. L'admin décide ensuite s'il l'utilise
 * (via `startOnboardingWithAiProposal`) ou s'il la régénère avec
 * une description différente.
 */
export async function generatePresetWithAi(
  guildId: string,
  input: { description: string; locale: 'fr' | 'en'; hints: string[] },
): Fetcher<GeneratedPresetDto> {
  const response = await fetch(
    `${API_URL}/guilds/${encodeURIComponent(guildId)}/onboarding/ai/generate-preset`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: await buildCookieHeader(),
      },
      body: JSON.stringify(input),
    },
  );
  if (response.ok) {
    const data = (await response.json()) as GeneratedPresetDto;
    return { ok: true, data };
  }
  const err = await parseErrorBody(response);
  return { ok: false, status: response.status, ...err };
}

/**
 * Crée une session onboarding à partir d'une proposition IA validée
 * par l'admin. Stocke `aiInvocationId` sur la session pour l'audit.
 */
export async function startOnboardingWithAiProposal(
  guildId: string,
  preset: Readonly<Record<string, unknown>>,
  aiInvocationId: string,
): Fetcher<OnboardingSessionDto> {
  const response = await fetch(`${API_URL}/guilds/${encodeURIComponent(guildId)}/onboarding`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      cookie: await buildCookieHeader(),
    },
    body: JSON.stringify({ source: 'ai', preset, aiInvocationId }),
  });
  if (response.status === 201) {
    const data = (await response.json()) as OnboardingSessionDto;
    invalidate(guildId);
    return { ok: true, data };
  }
  const err = await parseErrorBody(response);
  return { ok: false, status: response.status, ...err };
}

/**
 * Demande à l'IA 1 ou 2 suggestions ciblées (`kind`) à partir du
 * draft courant. Le résultat n'est pas appliqué — le dashboard le
 * présente à l'admin, qui choisit d'en intégrer une via
 * `patchOnboardingDraft` (ADR 0007 R1 — jamais de mutation sans
 * validation humaine).
 */
export async function suggestOnboardingCompletion(
  guildId: string,
  kind: SuggestionKind,
  contextDraft: Readonly<Record<string, unknown>>,
  hint?: string,
): Fetcher<SuggestCompletionResponseDto> {
  const body: Record<string, unknown> = { kind, contextDraft };
  if (hint !== undefined && hint.trim().length > 0) body['hint'] = hint;
  const response = await fetch(
    `${API_URL}/guilds/${encodeURIComponent(guildId)}/onboarding/ai/suggest-completion`,
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
    const data = (await response.json()) as SuggestCompletionResponseDto;
    return { ok: true, data };
  }
  const err = await parseErrorBody(response);
  return { ok: false, status: response.status, ...err };
}

/**
 * PATCH partiel sur le draft d'une session en cours. Passe-plat vers
 * `PATCH /onboarding/:sessionId/draft` côté API. Utilisé par le panel
 * de suggestions pour intégrer une entrée au draft (le caller est
 * responsable de pré-concaténer les arrays, `deepMerge` côté API
 * remplace).
 */
export async function patchOnboardingDraft(
  guildId: string,
  sessionId: string,
  patch: Readonly<Record<string, unknown>>,
): Fetcher<OnboardingSessionDto> {
  const response = await fetch(
    `${API_URL}/guilds/${encodeURIComponent(guildId)}/onboarding/${encodeURIComponent(sessionId)}/draft`,
    {
      method: 'PATCH',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: await buildCookieHeader(),
      },
      body: JSON.stringify(patch),
    },
  );
  if (response.ok) {
    const data = (await response.json()) as OnboardingSessionDto;
    invalidate(guildId);
    return { ok: true, data };
  }
  const err = await parseErrorBody(response);
  return { ok: false, status: response.status, ...err };
}

export async function previewOnboarding(
  guildId: string,
  sessionId: string,
): Fetcher<OnboardingPreviewDto> {
  const response = await fetch(
    `${API_URL}/guilds/${encodeURIComponent(guildId)}/onboarding/${encodeURIComponent(sessionId)}/preview`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: { accept: 'application/json', cookie: await buildCookieHeader() },
    },
  );
  if (response.ok) {
    const data = (await response.json()) as OnboardingPreviewDto;
    invalidate(guildId);
    return { ok: true, data };
  }
  const err = await parseErrorBody(response);
  return { ok: false, status: response.status, ...err };
}

export interface ApplyActionsDto {
  readonly ok: boolean;
  readonly appliedCount: number;
  readonly externalIds: readonly (string | null)[];
  readonly failedAt?: number;
  readonly error?: string;
}

export async function applyOnboarding(
  guildId: string,
  sessionId: string,
): Fetcher<ApplyActionsDto> {
  const response = await fetch(
    `${API_URL}/guilds/${encodeURIComponent(guildId)}/onboarding/${encodeURIComponent(sessionId)}/apply`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: { accept: 'application/json', cookie: await buildCookieHeader() },
    },
  );
  if (response.ok) {
    const data = (await response.json()) as ApplyActionsDto;
    invalidate(guildId);
    return { ok: true, data };
  }
  const err = await parseErrorBody(response);
  return { ok: false, status: response.status, ...err };
}

export interface RollbackDto {
  readonly ok: boolean;
  readonly undoneCount: number;
  readonly skippedCount: number;
  readonly error?: string;
}

export async function rollbackOnboarding(guildId: string, sessionId: string): Fetcher<RollbackDto> {
  const response = await fetch(
    `${API_URL}/guilds/${encodeURIComponent(guildId)}/onboarding/${encodeURIComponent(sessionId)}/rollback`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: { accept: 'application/json', cookie: await buildCookieHeader() },
    },
  );
  if (response.ok) {
    const data = (await response.json()) as RollbackDto;
    invalidate(guildId);
    return { ok: true, data };
  }
  const err = await parseErrorBody(response);
  return { ok: false, status: response.status, ...err };
}
