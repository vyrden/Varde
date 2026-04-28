import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

/**
 * Mocks HTTP de l'API Discord pour les tests E2E.
 *
 * Pourquoi MSW côté Node : les appels Discord sont faits par les
 * Server Components et server actions du dashboard (côté Node),
 * pas par le navigateur. `page.route()` de Playwright n'intercepte
 * que les requêtes du navigateur — pour mocker les appels serveur,
 * il faut un intercepteur dans le process Next lui-même.
 *
 * Usage typique dans un spec :
 *
 *   import { discordServer, mockDiscordUser } from './fixtures/discord-mocks';
 *
 *   test.beforeAll(() => discordServer.listen());
 *   test.afterEach(() => discordServer.resetHandlers());
 *   test.afterAll(() => discordServer.close());
 *
 *   test('mon scénario', async ({ page }) => {
 *     mockDiscordUser({ id: '123', username: 'alice' });
 *     // ... le dashboard fetch /users/@me et reçoit la réponse mockée
 *   });
 *
 * Le serveur MSW est partagé entre tous les tests du fichier.
 * Chaque test peut surcharger les handlers à la demande via les
 * helpers `mockDiscord*`.
 */

const DISCORD_API_BASE = 'https://discord.com/api/v10';

export interface DiscordUserMock {
  readonly id: string;
  readonly username: string;
  readonly discriminator?: string;
  readonly avatar?: string | null;
  readonly globalName?: string | null;
}

export interface DiscordGuildMock {
  readonly id: string;
  readonly name: string;
  readonly icon?: string | null;
  readonly owner?: boolean;
  readonly permissions?: string;
}

export interface DiscordApplicationMock {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly bot_public?: boolean;
}

/**
 * Serveur MSW partagé. À démarrer dans `beforeAll` du fichier de
 * test, fermer dans `afterAll`. Les `resetHandlers()` entre tests
 * évitent le leak d'état d'un test sur l'autre.
 */
export const discordServer = setupServer();

/**
 * Mocks `GET /users/@me` avec le user fourni. Réponse HTTP 200.
 */
export function mockDiscordUser(user: DiscordUserMock): void {
  discordServer.use(
    http.get(`${DISCORD_API_BASE}/users/@me`, () =>
      HttpResponse.json({
        id: user.id,
        username: user.username,
        discriminator: user.discriminator ?? '0',
        avatar: user.avatar ?? null,
        global_name: user.globalName ?? null,
      }),
    ),
  );
}

/**
 * Mocks `GET /users/@me/guilds` avec la liste fournie.
 */
export function mockDiscordGuilds(guilds: readonly DiscordGuildMock[]): void {
  discordServer.use(
    http.get(`${DISCORD_API_BASE}/users/@me/guilds`, () =>
      HttpResponse.json(
        guilds.map((g) => ({
          id: g.id,
          name: g.name,
          icon: g.icon ?? null,
          owner: g.owner ?? false,
          permissions: g.permissions ?? '0',
        })),
      ),
    ),
  );
}

/**
 * Mocks `GET /applications/{id}/rpc` (utilisé par le wizard étape 3
 * et par l'admin instance pour vérifier qu'un app ID est valide).
 */
export function mockDiscordApplication(app: DiscordApplicationMock): void {
  discordServer.use(
    http.get(`${DISCORD_API_BASE}/applications/${app.id}/rpc`, () =>
      HttpResponse.json({
        id: app.id,
        name: app.name,
        description: app.description ?? '',
        bot_public: app.bot_public ?? true,
      }),
    ),
  );
}

/**
 * Mocks `POST /oauth2/token` (utilisé par l'OAuth client_credentials
 * du wizard étape 5 et l'admin instance pour valider un client secret).
 *
 * Quand `success: false`, retourne 401 avec une erreur Discord-like.
 */
export function mockDiscordTokenExchange(options: {
  readonly success: boolean;
  readonly scopes?: readonly string[];
}): void {
  discordServer.use(
    http.post(`${DISCORD_API_BASE}/oauth2/token`, () => {
      if (!options.success) {
        return HttpResponse.json({ error: 'invalid_client' }, { status: 401 });
      }
      return HttpResponse.json({
        access_token: 'mock-access-token',
        token_type: 'Bearer',
        expires_in: 604800,
        scope: (options.scopes ?? ['identify', 'guilds']).join(' '),
      });
    }),
  );
}

/**
 * Réinitialise tous les handlers — utile dans `afterEach` pour
 * éviter qu'un mock posé dans un test n'affecte le suivant.
 */
export function resetDiscordMocks(): void {
  discordServer.resetHandlers();
}
