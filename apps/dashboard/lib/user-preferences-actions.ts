'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import type { GuildPreferencesDto, PinnedModuleDto } from './api-client';

/**
 * Server actions des préférences utilisateur (jalon 7 PR 7.4.5).
 *
 * Une seule action en V1 : `savePinnedModules`. Le couple
 * (theme, locale) global vit ailleurs sur `/me/preferences` (PR 7.4.9
 * câblage thème).
 *
 * `savePinnedModules` PUT la nouvelle liste à
 * `/me/guilds/:guildId/preferences/pins` puis invalide le segment
 * du layout guild — la sidebar serveur recharge l'ordre persisté au
 * prochain rendu. Le composant client peut afficher l'optimiste avant.
 */

const API_URL = process.env['VARDE_API_URL'] ?? 'http://localhost:4000';
const SESSION_COOKIE = 'varde.session';

export type SavePinnedModulesState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'success'; readonly data: GuildPreferencesDto }
  | { readonly kind: 'error'; readonly code: string; readonly message: string };

interface ApiErrorBody {
  readonly error?: unknown;
  readonly message?: unknown;
}

const parseError = async (res: Response): Promise<{ code: string; message: string }> => {
  let body: ApiErrorBody | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  const code = typeof body?.error === 'string' ? body.error : 'http_error';
  const message = typeof body?.message === 'string' ? body.message : `API a répondu ${res.status}.`;
  return { code, message };
};

const buildCookieHeader = async (): Promise<string> => {
  const store = await cookies();
  const session = store.get(SESSION_COOKIE);
  return session ? `${SESSION_COOKIE}=${session.value}` : '';
};

/**
 * Lit la liste actuelle des pins pour (sessionUser, guildId). Sert
 * de pré-fetch à `togglePinnedModule` qui doit composer la nouvelle
 * liste à partir de l'existante. Erreur silencieuse → liste vide.
 */
const fetchCurrentPins = async (guildId: string): Promise<readonly PinnedModuleDto[]> => {
  try {
    const res = await fetch(`${API_URL}/me/guilds/${encodeURIComponent(guildId)}/preferences`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        cookie: await buildCookieHeader(),
      },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { pinnedModules?: readonly PinnedModuleDto[] };
    return body.pinnedModules ?? [];
  } catch {
    return [];
  }
};

/**
 * Toggle d'un module dans les épingles de l'utilisateur courant
 * pour une guild (jalon 7 PR 7.4.7).
 *
 * - Module pas encore épinglé → ajouté en fin de liste.
 * - Module déjà épinglé → retiré, positions renumérotées.
 *
 * Le plafond `max 8` est appliqué côté serveur dans
 * `userPreferencesService.updatePinnedModules` ; on remonte le code
 * d'erreur tel quel pour que le client puisse afficher le toast
 * approprié.
 *
 * Comme `savePinnedModules`, l'action invalide le segment du layout
 * guild après écriture pour que la sidebar refresh ses pins.
 */
export async function togglePinnedModule(
  guildId: string,
  moduleId: string,
): Promise<SavePinnedModulesState> {
  if (typeof guildId !== 'string' || guildId.length === 0) {
    return { kind: 'error', code: 'invalid_form', message: 'guildId absent.' };
  }
  if (typeof moduleId !== 'string' || moduleId.length === 0) {
    return { kind: 'error', code: 'invalid_form', message: 'moduleId absent.' };
  }
  const current = await fetchCurrentPins(guildId);
  const isCurrentlyPinned = current.some((p) => p.moduleId === moduleId);
  const next: PinnedModuleDto[] = isCurrentlyPinned
    ? current
        .filter((p) => p.moduleId !== moduleId)
        .map((p, index) => ({ moduleId: p.moduleId, position: index }))
    : [...current, { moduleId, position: current.length }];
  return savePinnedModules(guildId, next);
}

/**
 * Persiste la nouvelle liste ordonnée des modules épinglés pour
 * (sessionUser, guildId). La validation côté serveur (max 8, pas de
 * doublon, positions cohérentes) est portée par
 * `userPreferencesService.updatePinnedModules` ; les codes d'erreur
 * remontent inchangés (`unknown_module_ids`, `invalid_pins`,
 * `invalid_body`).
 */
export async function savePinnedModules(
  guildId: string,
  pinnedModules: readonly PinnedModuleDto[],
): Promise<SavePinnedModulesState> {
  if (typeof guildId !== 'string' || guildId.length === 0) {
    return { kind: 'error', code: 'invalid_form', message: 'guildId absent.' };
  }
  try {
    const res = await fetch(
      `${API_URL}/me/guilds/${encodeURIComponent(guildId)}/preferences/pins`,
      {
        method: 'PUT',
        cache: 'no-store',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          cookie: await buildCookieHeader(),
        },
        body: JSON.stringify({ pinnedModules }),
      },
    );
    if (!res.ok) {
      const err = await parseError(res);
      return { kind: 'error', code: err.code, message: err.message };
    }
    const data = (await res.json()) as GuildPreferencesDto;
    // Invalidation du segment guild — la sidebar (server-rendered au
    // niveau du layout) re-fetch les pins au prochain render.
    revalidatePath(`/guilds/${guildId}`, 'layout');
    return { kind: 'success', data };
  } catch (error) {
    return {
      kind: 'error',
      code: 'network_error',
      message: error instanceof Error ? error.message : 'Erreur réseau.',
    };
  }
}
