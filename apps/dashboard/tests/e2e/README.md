# Tests E2E du dashboard

Tests Playwright qui exécutent le dashboard en mode dev et vérifient
les parcours utilisateur de bout en bout.

## Lancer les tests

Avant la première exécution, télécharger le navigateur Chromium :

```sh
pnpm exec playwright install --with-deps chromium
```

Ensuite, depuis `apps/dashboard` :

```sh
pnpm test:e2e
```

La config Playwright (`playwright.config.ts`) démarre un Next dev
server sur le port 3001 — pas de conflit avec le 3000 utilisé en
dev quotidien.

## Fixtures disponibles

Les helpers vivent sous `tests/e2e/fixtures/`.

### `discord-mocks.ts` — interception HTTP de l'API Discord

Le dashboard fait ses appels Discord côté serveur (Server Components,
server actions). On intercepte ces requêtes via [MSW](https://mswjs.io/)
en mode Node, ce qui permet de tester sans toucher la vraie API
Discord (et sans avoir besoin d'un token bot).

```ts
import { discordServer, mockDiscordUser, mockDiscordGuilds } from './fixtures/discord-mocks';

test.beforeAll(() => discordServer.listen({ onUnhandledRequest: 'bypass' }));
test.afterEach(() => discordServer.resetHandlers());
test.afterAll(() => discordServer.close());

test('le user voit ses serveurs', async ({ page }) => {
  mockDiscordUser({ id: '123', username: 'alice' });
  mockDiscordGuilds([{ id: '999', name: 'Test Server', permissions: '8' }]);
  // ... le dashboard fetch les endpoints Discord et reçoit les mocks
});
```

Helpers exposés : `mockDiscordUser`, `mockDiscordGuilds`,
`mockDiscordApplication`, `mockDiscordTokenExchange`. Étendre
`discord-mocks.ts` quand un nouveau endpoint Discord est consommé
par le code.

### `auth.ts` — session Discord forgée

Le dashboard utilise Auth.js v5 avec un cookie JWT HS256 signé via
`VARDE_AUTH_SECRET`. Pour tester un parcours authentifié sans jouer
le flow OAuth Discord réel, on forge directement la session :

```ts
import { loginAs } from './fixtures/auth';

test('parcours admin', async ({ context, page }) => {
  await loginAs(context, { userId: '123', username: 'alice' });
  await page.goto('/');
  // ... le user est connecté
});
```

Le secret côté test est `e2e-secret-not-for-prod` par défaut, posé
dans `playwright.config.ts` au lancement du `webServer` Next.

### `setup-api-mock.ts` — mock HTTP de l'API du wizard

Le wizard de setup (jalon 7 PR 7.1) discute avec `apps/server` (API
Fastify) via `VARDE_API_URL`. Pour les E2E on remplace ce serveur
par un mock HTTP minimaliste qui répond aux 8 routes `/setup/*`
avec des réponses pré-cuites (cas par défaut : setup non
configurée + tout vert + persistance simulée).

Le mock est lancé en parallèle de Next.js par `playwright.config.ts`
(deuxième `webServer`) sur le port 4002, via `node` directement
(le fichier est écrit en `.mjs` pour éviter la dépendance à `tsx`).
`VARDE_API_URL=http://127.0.0.1:4002` est injecté dans l'env de
Next.js.

Les specs n'ont rien à importer du mock — il suffit d'aller sur
`/setup/welcome` (ou autre étape) et le dashboard discute déjà
avec le mock. Le comportement métier de l'API (chiffrement,
persistance, validation Discord) est testé séparément par les
54 tests d'intégration de
`apps/api/tests/integration/setup-route.test.ts`.

### `db.ts` — reset de la base entre tests

Pour les tests qui mutent l'état (config modules, audit, onboarding),
nettoyer la DB entre chaque test :

```ts
import { resetDatabase } from './fixtures/db';

test.beforeEach(async () => {
  await resetDatabase();
});
```

Pré-requis : la variable `DATABASE_URL_TEST` pointe vers une
instance Postgres dédiée aux tests, isolée de la DB de dev. Le
job CI E2E en provisionne une via les services GitHub Actions.

## Conventions

- Un test = un comportement observable (pas trois assertions sans
  rapport dans le même `test()`).
- Préférer les sélecteurs accessibles (`getByRole`, `getByLabel`)
  aux sélecteurs CSS — c'est ce que voit un lecteur d'écran et
  ça reste stable face à un refactor de la classe Tailwind.
- Pas de timing arbitraire (`page.waitForTimeout(500)`). Toujours
  un `waitForXxx` qui attend l'état attendu.
- Les tests qui touchent à l'auth démarrent par `loginAs` ou
  documentent explicitement qu'ils testent l'état non authentifié.

## Que tester en E2E

- **Parcours critiques** : login, lister serveurs, configurer un
  module, lancer un onboarding, lire l'audit.
- **Régressions de chemin** : redirects d'auth, gestion des 404,
  gestion d'erreurs API.
- **Bilingue** : un parcours en FR, un en EN, pour valider
  qu'aucune string n'a été oubliée.

Pas en E2E : la logique métier d'un module (couvert par tests
unitaires), les bugs visuels (review humaine + Lighthouse),
l'accessibilité fine (axe-core en complément).
