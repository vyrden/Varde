import type { SetupFetch } from './setup-client';

/**
 * Helper serveur pour `GET /setup/redirect-uri`. Sert à la page
 * OAuth du wizard pour afficher l'URI de redirection à coller dans
 * le portail Developer. L'API la dérive du `baseUrl` côté serveur,
 * donc on ne la calcule pas localement.
 */

export interface RedirectUriResponse {
  readonly uri: string;
}

export type RedirectUriResult =
  | { readonly ok: true; readonly uri: string }
  | { readonly ok: false; readonly message: string };

export async function fetchRedirectUri(
  apiUrl: string,
  fetchImpl: SetupFetch,
): Promise<RedirectUriResult> {
  let response: Response;
  try {
    response = await fetchImpl(`${apiUrl}/setup/redirect-uri`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
  if (!response.ok) {
    return { ok: false, message: `API a répondu ${response.status} sur /setup/redirect-uri.` };
  }
  try {
    const body = (await response.json()) as RedirectUriResponse;
    return { ok: true, uri: body.uri };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
