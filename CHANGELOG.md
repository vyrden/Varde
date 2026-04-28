# Changelog

Toutes les modifications notables du projet sont consignées ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Les versions adhèrent à [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]

Aucun changement non publié pour le moment. Les chantiers du
**jalon 7** (refonte UI/UX, simplification de l'installation,
internationalisation FR/EN, tests Playwright) atterriront ici
au fil des PR.

## [0.6.0] — 2026-04-28

### Jalon 6 — production-ready

Une instance Varde s'installe désormais sur une machine fraîche
avec un seul `docker compose up`, configuration en variables
d'environnement, doc utilisateur et doc dev publiées.

**Ajouté :**

- `docker/Dockerfile.bot` et `docker/Dockerfile.dashboard` :
  images multi-stages basées sur Node 24 LTS slim, user non-root
  (uid 10001), healthchecks via `curl /health` et `curl /`.
  L'image dashboard s'appuie sur `next build` en mode
  `output: 'standalone'`.
- `docker/docker-compose.prod.yml` : pile complète à quatre
  services (`bot`, `dashboard`, `postgres`, `redis`) plus un
  service utilitaire de migration. Healthchecks chaînés via
  `depends_on.condition: service_healthy`. Volumes persistants
  pour Postgres, Redis et les uploads. Postgres et Redis ne sont
  pas exposés sur le host.
- `packages/db/src/cli/migrate-pg.ts` : runner CLI de migration
  Postgres compilé (sans `tsx`), invocable directement depuis
  l'image bot via le service `migrate`.
- `apps/dashboard/next.config.mjs` : `output: 'standalone'` et
  `outputFileTracingRoot` pointé sur la racine du monorepo, pour
  que le standalone trace correctement les paquets workspace.
- `.dockerignore` à la racine du repo : ramène le contexte de
  build de plusieurs centaines de Mo à quelques Mo.
- `.env.example` exhaustif, audité contre les variables
  réellement consommées par le code (ajout de
  `VARDE_UPLOADS_DIR`, `VARDE_KEYSTORE_PREVIOUS_MASTER_KEY` ;
  retrait de `VARDE_ENV` non consommé).
- `docs/DEPLOYMENT.md` réécrit en parcours pas-à-pas : pré-requis
  matériels, création de l'application Discord, génération des
  secrets via `openssl rand`, premier `docker compose up`, smoke
  test, mise en place d'un reverse-proxy Caddy, sauvegardes,
  procédure de mise à jour, troubleshooting des erreurs courantes.
- `docs/USER-GUIDE.md` : guide pour les administrateurs et
  modératrices de communauté Discord. Couvre le dashboard, le
  parcours d'onboarding, les cinq modules officiels, le journal
  d'audit, le mappage permissions ↔ rôles Discord, le branchement
  optionnel d'une IA, les pièges fréquents (hiérarchie de rôles,
  intents, faux positifs automod).
- `docs/MODULE-AUTHORING.md` : guide pas-à-pas pour écrire un
  module Varde. Anatomie, manifeste, configuration (Zod +
  configUi), souscription d'événements, slash-commands typées,
  persistance, audit / i18n / logger, tests, distribution,
  conventions.
- `modules/example-counter/` : module exemple fonctionnel utilisé
  comme référence dans le guide. Compte les messages par membre,
  expose `/count`, illustre le contrat plugin sans charger trop
  de complexité (stockage en mémoire, limite assumée et expliquée
  comme tremplin vers `ctx.db`).
- Documentation publique de l'ensemble du dossier `docs/` : les
  fichiers d'architecture, conventions, ADR, scope, roadmap,
  opérations, tests et assets sont désormais accessibles depuis
  le repo public, à l'exception des sections explicitement
  internes (`docs/plans/`, `docs/modules/`, `docs/DA/`,
  `docs/ETAT-DU-PROJET.md`).

**Modifié :**

- `docs/ROADMAP.md` réécrit en version synthétique, sans les
  spécifications internes de modules, avec un tableau de
  synthèse jalon par jalon.
- `docs/OPERATIONS.md` rafraîchi : retrait des mentions « V0 /
  pas de tag », ajout des tags publiés, pointeur vers
  `SECURITY.md` pour les procédures opérateur.
- `docs/ONBOARDING.md` : section « à trancher » remplacée par les
  décisions effectivement prises au jalon 3.
- `README.md` : section « Documentation détaillée » réorganisée
  par audience (administrateurs / développeurs / référence).

**Sécurité :**

- Faux positif CodeQL `js/missing-rate-limiting` fermé sur
  `GET /me` en réappliquant explicitement la config globale via
  `{ config: { rateLimit: {} } }` (no-op fonctionnel, le
  pre-handler global posait déjà les bornes).
- Parsers de listes Markdown du composant `DiscordMessagePreview`
  remplacés par des analyseurs caractère par caractère, en
  remplacement des regex avec quantifiers — ferme les
  signalements ReDoS des scanners statiques (faux positifs
  bornés mais visibles), garantit une borne O(n) sur la taille
  de l'entrée.

> **Reportés au jalon 7** : internationalisation FR/EN du
> dashboard et tests Playwright. Ces deux chantiers dépendent
> fortement de l'UI actuelle, qui sera refondue au jalon 7.

## [0.5.0] — 2026-04-27

### Jalon 5 — sécurité béton et polish technique

Audit complet de la surface d'attaque et durcissement, mise en
place des procédures opérateur pour les rotations de secrets,
couverture de tests poussée au-delà de 75 % sur le cœur et
l'API.

**Sécurité :**

- `pnpm audit` clean (zéro CRITICAL/HIGH), audit bloquant en CI.
- Headers de sécurité (CSP, HSTS, X-Frame-Options,
  X-Content-Type-Options, Referrer-Policy, Permissions-Policy)
  sur 100 % des réponses HTTP côté API (`@fastify/helmet`) et
  dashboard (`next.config.mjs#headers()`).
- Rate limiting global API à 300 req/min/IP (`@fastify/rate-limit`),
  plafond serré à 10 req/min/IP sur les routes IA coûteuses
  (`/onboarding/ai/*`).
- Vérification des magic bytes sur les uploads d'images
  (cartes welcome) en plus du `Content-Type`.
- Test statique qui parse les fichiers de routes et vérifie
  que toute route mutante appelle `requireGuildAdmin` —
  empêche toute future route d'oublier le contrôle d'accès.
- Audit complet du flow Auth.js v5, redaction explicite de
  l'access token Discord côté client sur `/me`.
- `SECURITY.md` enrichi : modèle de menaces V1, procédures
  opérateur (rotation de la master key du keystore, rotation
  du secret de session, révocation du token bot, révocation
  d'une clé API IA, bench p95, validation 24 h pré-release).

**Robustesse :**

- Observabilité du gateway Discord : listeners sur `error`,
  `shardError`, `shardDisconnect`, `shardReconnecting`,
  `shardReady`, `shardResume`, `warn`.
- Résilience DB validée : graceful 5xx, pas de crash process
  sur perte de connexion.
- Rotation de la master key du keystore testée bout-en-bout
  (génération nouvelle clé, déclaration `previousMasterKey`,
  re-chiffrement transparent à la prochaine écriture).

**Hygiène :**

- Couverture de tests `core` et `api` poussée au-delà de 75 %,
  plancher anti-régression en CI (`coverageThresholds` dans la
  config Vitest partagée).
- Bundle dashboard sous plafond (~355 Ko gzipped), check CI.
- Overrides pnpm pour fermer deux vulnérabilités modérées
  transitives (`uuid >= 11.1.0`, `postcss >= 8.5.10`).

## [0.4.0] — 2026-04-27

### Jalon 4 — modules officiels V1

Les cinq capacités V1 livrées avec exactement la même API que
les modules tiers (« aucun privilège officiel »).

**Modules ajoutés :**

- `modules/logs` : audit Discord routé par type d'événement
  (~30 événements natifs : arrivées / départs, modifications
  rôles / salons, suppressions de messages, etc.). Mode simple
  (un seul salon, cases à cocher par famille) ou mode avancé
  (N routes nommées, chacune sur un sous-ensemble d'événements
  et son salon). Bufferisation des routes cassées avec bouton
  « Rejouer ».
- `modules/welcome` : accueil et départs configurables,
  destination salon ou DM, carte d'avatar 700×250 PNG générée
  via `@napi-rs/canvas` (avatar circulaire, fond couleur ou
  image custom uploadée, polices intégrées et système),
  auto-rôle avec délai configurable, filtre comptes neufs
  (kick ou quarantaine).
- `modules/reaction-roles` : auto-attribution de rôles par
  réaction emoji ou par bouton Discord, mélangeables sur le
  même message. Trois modes : `normal` (toggle), `unique` (un
  seul rôle parmi plusieurs), `vérificateur`. Picker d'emojis
  tabbé (Unicode curé, emojis du serveur, emojis d'autres
  serveurs où le bot est invité). Six templates prêts à
  l'emploi.
- `modules/moderation` : slash-commands manuelles (`/ban`,
  `/kick`, `/mute`, `/tempban`, `/tempmute`, `/unban`,
  `/unmute`, `/warn`, `/clear`, `/slowmode`, `/case`,
  `/infractions`) et automod multi-règles (12 types : blacklist,
  regex, mots-clés multilingues, anti-flood, classification IA,
  invitations, liens, majuscules, emojis, spoilers, mentions,
  zalgo) avec actions composables (`delete`, `warn`, `mute`),
  rôles bypass, salons restreints.
- `onboarding-presets` (livré en API plutôt qu'en module bot,
  voir ADR 0010) : catalogue de 5 presets éditables avec
  apply / rollback Discord.

**UX dashboard :**

- Refonte single-page sur les quatre pages module (logs,
  welcome, reaction-roles, moderation).
- Primitives partagées dans `@varde/ui` : `StickyActionBar`,
  `CollapsibleSection`, `EntityMultiPicker`,
  `DiscordMessagePreview`, `useDirtyExitGuard`.

## [Avant 0.4.0]

### Jalon 3 — moteur d'onboarding (2026-04-22)

Clos. Critère de sortie ROADMAP vérifié : avec un module témoin
`onboarding-test` qui contribue une action custom et un hint via
`ctx.onboarding.*`, un admin logué peut lancer un onboarding depuis
un preset hand-curated ou depuis une proposition IA, preview les
actions, appliquer — les rôles / catégories / salons apparaissent
sur un vrai serveur Discord via discord.js v14 — puis rollback
dans la fenêtre de 30 min avec retour à l'état initial. Pipeline
CI vert, 561 tests monorepo.

Surface livrée :

- `@varde/contracts` : contrats onboarding complets.
  - `OnboardingDraft` (rôles / catégories / salons / modules) et
    `OnboardingActionDefinition<P, R>` (schema Zod, apply, undo,
    canUndo, R8 du plan). `OnboardingActionContext` expose
    `discord.*` pour Discord, `configPatch`, `logger`, et
    `resolveLocalId(localId) → externalId` pour que les actions
    résolvent les refs intra-session.
  - `OnboardingService` exposé côté `ModuleContext.onboarding` :
    `registerAction(def)` contribue une action custom au registre
    de l'executor, `contributeHint(hint)` pose une suggestion
    hand-curée pour le builder (PR 3.13).
  - Status de session : `draft | previewing | applying | applied
    | rolled_back | expired | failed`. Invariant unicité par
    guild via partial unique index PG + check applicatif SQLite.
- `@varde/db` : tables `onboarding_sessions`, `onboarding_actions_log`,
  `ai_invocations` (ADR 0007). Colonnes `ciphertext/iv/authTag`
  BLOB pour les secrets keystore. `ai_invocations` porte le
  hash SHA-256 du prompt, jamais le prompt brut (R5).
- `@varde/presets` (nouveau) : catalogue de 5 presets hand-curés
  (tech, gaming, creative, study, generic starter) validés par
  Zod + validator sémantique (refs `categoryLocalId` / `readableBy`
  / `writableBy` doivent pointer vers des entités du même preset).
  Exposé par `PRESET_CATALOG` + exports individuels.
- `@varde/core` : moteur d'onboarding.
  - `createOnboardingExecutor` : registry d'actions + cycle
    `applyActions` (séquentiel, 50 ms entre actions pour laisser
    de la marge aux buckets Discord) + rollback auto sur échec +
    `undoSession` manuel idempotent. Maintient une map
    `localId → externalId` pendant l'apply, injectée dans les
    actions via `ctx.resolveLocalId` (PR 3.12a).
  - Quatre actions core : `createRole`, `createCategory`,
    `createChannel` (supporte `parentLocalId`, overwrites via
    `readableRoleLocalIds` / `writableRoleLocalIds`, bits ViewChannel
    / SendMessages / Connect / Speak selon type du salon),
    `patchModuleConfig`. 4 presets de permissions hardcoded
    (moderator-full / moderator-minimal / member-default /
    member-restricted), aucun bitfield exposé à l'admin (R1).
  - `createOnboardingHostService` : matérialise `ctx.onboarding`
    côté host (server, harness). Expose `getHints` et
    `getContributedActionTypes` pour introspection.
- `@varde/ai` (nouveau) : contrat `AIProvider` + service tracé +
  adapters.
  - `generatePreset` (produit un preset complet à partir d'une
    description FR/EN + hints optionnels) et `suggestCompletion`
    (role / category / channel, avec contexte du draft + hint
    libre). Sorties Zod-validées, erreurs `AIProviderError`
    typées (`timeout | unavailable | invalid_response |
    quota_exceeded | unauthorized | unknown`).
  - `createStubProvider` : rule-based, déterministe, zéro réseau.
    Match par mot-clé sur les 5 presets hand-curated + suggestions
    seeds par kind. Utilisé en tests partout et en fallback runtime
    quand aucun provider n'est configuré (CLAUDE.md §13, pas de
    default cloud).
  - `createOllamaProvider` : POST /api/chat `format: 'json'`,
    retry 1× sur JSON invalide, testConnection via /api/tags.
  - `createOpenAICompatibleProvider` : couvre OpenAI / OpenRouter /
    Groq / vLLM / LocalAI / LM Studio. Bearer auth +
    `response_format: { type: 'json_object' }`. Mapping status →
    code AIProviderError (401/403 → unauthorized, 429 →
    quota_exceeded, 404/5xx → unavailable). Timeout par requête
    via `AbortController` (20 s défaut).
  - `createAIService` : wrapper avec timeout global (30 s défaut,
    englobe les adapters), validation Zod des inputs, insertion
    `ai_invocations` succès comme échec, hash SHA-256 de l'input.
  - Prompts versionnés `v1` dans `PROMPT_VERSIONS`, stamped dans
    chaque ligne `ai_invocations` pour le rejeu.
- `@varde/api` : six routes builder + deux routes IA + params IA.
  - `POST /guilds/:id/onboarding` (source: blank | preset | ai),
    `GET /onboarding/current` (inclut `applied` pour l'écran
    rollback), `PATCH /onboarding/:sid/draft` (deepMerge côté
    serveur, les arrays sont remplacés — les consommateurs
    concatènent côté client), `POST /preview` (sérialise en
    actions), `POST /apply` (invoque executor, sur succès pose
    un job scheduler `onboarding.autoExpire:<sid>` à `expiresAt`),
    `POST /rollback` (annule le job si encore pending).
  - `POST /onboarding/ai/generate-preset` et
    `POST /onboarding/ai/suggest-completion` (auth admin,
    résolution provider via `buildAiProviderForGuild`).
  - `GET | PUT /guilds/:id/settings/ai` + `POST /settings/ai/test`
    (providerId `none | ollama | openai-compat`, apiKey stockée
    dans keystore scope `core.ai` slot `providerApiKey`, jamais
    renvoyée, `hasApiKey` remonté à l'UI).
  - `reconcileOnboardingSessions` : au boot, scan des sessions
    `applied` — `expiresAt` dépassé → `expired` immédiat, futur →
    réenregistrement du handler scheduler.
  - DiscordClient durci : dédup in-flight (promesse partagée par
    N appelants sur le même token), fallback cache stale sur 429,
    TTL cache 5 min.
- `@varde/bot` : bridge discord.js pour l'onboarding (PR 3.12d).
  - `createOnboardingDiscordBridge(client)` mappe les 6
    primitives vers `guild.roles.create` / `.channels.create` /
    `.delete` avec les bons `ChannelType` (GuildText / Voice /
    Forum / Category), `OverwriteType.Role`, `PermissionsBitField`,
    `colors: { primaryColor }` (nouvelle API discord.js v14.26).
    Suppressions idempotentes si l'entité est déjà absente.
- `@varde/dashboard` : flow builder complet.
  - `PresetPicker` (5 presets + CTA IA), `AIGenerator` (textarea +
    locale, progress bar + compteur pendant la génération,
    proposition acceptable ou regénérable), `BuilderCanvas` (draft
    en lecture + `SuggestionsPanel` IA), `PreviewStep` (liste des
    actions), `AppliedStep` (compte à rebours MM:SS, barre de
    progression remplie, heure d'expiration absolue, bouton
    Actualiser post-expiration), `FinishedStep`.
  - Page `/settings/ai` avec `AIProviderForm`. API key passée via
    `FormData` pour ne pas apparaître en clair dans les dev logs
    Next.js Turbopack (fix post-smoke).
  - Nouveau composant réutilisable `@varde/ui/Progress` (ARIA
    progressbar, pas de dépendance Radix).
- `@varde/server` : executor + host `ctx.onboarding` construits
  avant le ctx factory, scheduler scopé `core.onboarding` avec
  reconcile au boot, bridge discord.js réel injecté dès que
  `VARDE_DISCORD_TOKEN` est présent (fallback demo sinon — pour
  CI / dev hors Discord).
- `modules/onboarding-test` (nouveau) : module témoin qui
  contribue une action `onboarding-test.setup-gaming-commands`
  (crée un salon dédié, patche la config du module, undo supprime)
  et un hint `channel` via `ctx.onboarding.*`. Couvre le
  critère de sortie du jalon via 5 tests E2E `createTestHarness`.
- ADR 0007 (moteur onboarding + IA en copilote, BYO-LLM) ajouté.
- Outillage dev : `dev` script sur tous les packages internes
  (tsc --watch), `pnpm dev` à la racine via Turbo pour lancer
  tous les watchers + le `next dev` du dashboard + le `node --watch`
  du server en parallèle. Fin des rebuilds manuels par paquet.

### Jalon 2 — dashboard minimum viable (2026-04-21)

Clos. Critère de sortie ROADMAP vérifié : un admin logué via Discord
OAuth2 peut modifier un paramètre d'un module (`hello-world` →
`welcomeDelayMs`) depuis le dashboard et voir la valeur persistée
dans `guild_config`, propagée via `config.changed` in-process
(ADR 0004). Pipeline CI vert, 367 tests monorepo.

Surface livrée :

- `@varde/ui` (nouveau) : design system Tailwind 4 CSS-first,
  primitives packagées consommables par `apps/dashboard` et à
  terme par modules tiers. Button, Input, Label, Card (+ Header /
  Title / Description / Content / Footer), Badge (variants
  default/secondary/outline/success/warning/destructive), Header,
  Sidebar, EmptyState, PageTitle, helper `cn`.
- `packages/contracts` : nouveau `ConfigUi` / `ConfigFieldSpec`
  sidecar du `ModuleDefinition` (ADR 0005). Widgets V1 : text,
  textarea, number, toggle, select. Meta-validator de
  `defineModule()` qui vérifie la cohérence path ↔ `configSchema`
  pour les Zod `object` imbriqués.
- `apps/server` (nouveau) : point d'entrée qui compose
  `@varde/core` + `@varde/api` Fastify + client discord.js en un
  seul process, partage l'EventBus in-process (ADR 0004). Shutdown
  coordinator unique.
- `@varde/api` (nouveau) : serveur Fastify avec authenticator JWT
  (`jose`, HS256, cookie `varde.session` partagé avec Auth.js,
  ADR 0006), middleware `requireGuildAdmin` (check `MANAGE_GUILD`
  via Discord `/users/@me/guilds`, cache TTL court). Routes :
  `GET /health`, `GET /me`, `GET /guilds`,
  `GET /guilds/:id/modules`, `GET|PUT /guilds/:id/modules/:moduleId/config`,
  `GET /guilds/:id/audit` (filtres `action` / `actorType` /
  `severity` / `since` / `until`, pagination cursor via ULID,
  `limit` borné [1, 100]). Tests : 52 (unitaires + intégration).
- `modules/hello-world` : expose son `configUi` sur
  `welcomeDelayMs` (widget `number`, bornes 0–60000 héritées du
  `configSchema`) pour la démonstration critique du jalon.
- `apps/dashboard` (nouveau app complet) : Next.js 16 + React 19 +
  Auth.js v5.
  - Auth.js configuré en stratégie JWT avec `encode` / `decode`
    sur-chargés via `jose`, cookie `varde.session`, scopes Discord
    `identify` + `guilds` (ADR 0006).
  - Server actions + forward cookie via `next/headers` — le
    navigateur ne parle jamais directement à l'API (pas de CORS).
  - Page `/` : liste des serveurs admin (intersection
    `user admin` ∩ `bot présent`).
  - Page `/guilds/[guildId]` : liste des modules avec badge
    enabled/disabled et lien vers la config.
  - Page `/guilds/[guildId]/modules/[moduleId]` : `ConfigForm`
    générique qui walk `configUi.fields` triés par `order`,
    supporte les paths pointés (config imbriquée), pré-valide
    côté client contre le JSON Schema via Ajv 8.18.0
    (`configSchema` retourné par l'API via `z.toJSONSchema()`),
    mappe les issues par champ en cas d'échec serveur (400
    `invalid_config`).
  - Page `/guilds/[guildId]/audit` : journal avec filtres
    (action, actorType, severity, fenêtre temporelle), URL
    reflète l'état (bookmarkable), pagination « Charger la
    suite » via cursor préservant les filtres actifs.
  - 26 tests (DashboardHeader, ServerList, ModuleList,
    ConfigForm × 8, AuditTable × 4, AuditFilters × 3).
- ADR ajoutés : 0004 (monolithe bot + API dans un seul process),
  0005 (`configUi` en sidecar de `ModuleDefinition`), 0006 (session
  partagée dashboard ↔ API via cookie JWT HS256).
- Hygiène de dépendances :
  - Override `pnpm.esbuild@<0.25.0 → >=0.25.0` pour fermer
    GHSA-67mh-4wv8-2f99 tiré transitivement par
    `@esbuild-kit/core-utils`.
  - Workflows CI (`ci.yml`, `secrets-scan.yml`) durcis avec
    `permissions: contents: read` au niveau workflow
    (CWE-275 CodeQL).

### Jalon 1 — core minimum viable (2026-04-21)

Clos. Critère de sortie ROADMAP vérifié dans les tests
d'intégration : un module charge via `@varde/core` plugin loader,
écoute un événement Discord publié sur l'EventBus, audite l'action,
vérifie une permission, planifie une tâche, répond à une commande
via `ctx.ui` — tout via les API publiques. `pnpm install && pnpm
check && pnpm test && pnpm build` verts en local et en CI.

Surface livrée :

- `@varde/contracts` : surface typée initiale.
  - Branded types Discord (`GuildId`, `UserId`, `ChannelId`, `RoleId`,
    `MessageId`) et applicatifs (`ModuleId`, `PermissionId`,
    `ActionId`) avec guards et asserts.
  - Générateur ULID monotone, helpers `isUlid`, `parseUlid`,
    `ulidTimestamp`.
  - Hiérarchie `AppError` (`ValidationError`, `NotFoundError`,
    `PermissionDeniedError`, `ConflictError`, `DependencyFailureError`,
    `ModuleError`) avec codes canoniques stables, httpStatus mappé,
    `toJSON` sans fuite.
  - Catalogue d'événements core V1 (19 événements Discord et système)
    typés et validés par Zod, avec union discriminée `CoreEvent`.
  - Meta-schema Zod du manifeste statique de module, helper
    `validateEmitPrefix`.
  - Interfaces `ModuleContext` et ses 13 sous-services (types
    uniquement, implémentations à venir).
  - Shapes des 11 records DB du core (contrat avec `@varde/db`).
- `@varde/db` : schéma du core et client Drizzle.
  - Schémas Drizzle Postgres et SQLite pour les 11 tables de l'ADR 0001
    (guilds, guild_config, modules_registry, guild_modules,
    permissions_registry, permission_bindings, audit_log,
    scheduled_tasks, onboarding_sessions, ai_invocations, keystore).
  - PK applicatives en ULID, cascades ON DELETE explicites, index
    nommés, index partiel Postgres `idx_onboarding_expires`, enums
    via CHECK pour rester portable SQLite.
  - Client factory `createDbClient({ driver, url, poolSize? })` sur
    `postgres-js` ou `better-sqlite3` (avec `PRAGMA foreign_keys=ON`
    et `journal_mode=WAL`).
  - `withTransaction` portable (PG via `db.transaction`, SQLite via
    pilotage manuel `BEGIN` / `COMMIT` / `ROLLBACK`).
  - Helpers `toCanonicalDate` / `fromCanonicalDate` vers
    `Iso8601DateTime`.
  - `applyMigrations` + runner CLI `scripts/migrate.ts` exposés via
    `pnpm db:migrate` au root.
  - Migrations initiales `0000_init.sql` générées par drizzle-kit
    (PG et SQLite), commitées comme source canonique.
  - Tests : 7 unitaires + 16 d'intégration (SQLite en mémoire et
    Postgres via Testcontainers), couvrent cascades, RESTRICT, CHECK,
    unicité, rollback.
- `@varde/core` : services socles sans dépendance asynchrone externe.
  - `createLogger` (Pino 10) produisant un `Logger` contract avec
    rédaction de chemins JSON sensibles, bindings hérités par
    `child()`, destination injectable pour les tests.
  - `createI18n` minimal : lookup locale primaire, fallback, clé
    brute en dernier recours, interpolation `{placeholder}`.
  - `createKeystoreService` (AES-256-GCM) scopé par module, avec
    rotation paresseuse de clé maître (`previousMasterKey` → lecture
    fallback + ré-encryption immédiate sous la nouvelle clé).
  - `createConfigService` : lecture/écriture atomique d'un snapshot
    JSON par guild, version monotone, fusion profonde du patch,
    callback `onChanged` typé `ConfigChangedEvent`. Rollback
    transactionnel via `withTransaction`.
  - `createAuditService` : log append-only (ULID, createdAt
    automatiques, module_id dérivé du scope), query filtré +
    `purge({ guildId, olderThan })` pour la tâche de rétention.
  - `createPermissionService` : résolution `can`/`canInGuild`
    (system → toujours, module → préfixe owned, user → bindings via
    MemberContextResolver, bypass owner/Administrator), cache
    permission ↔ rôles par guild avec `invalidate`,
    `registerPermissions` en upsert.
  - Tests : 10 unitaires (logger, i18n) + 40 d'intégration SQLite
    (keystore, config, audit, permissions).
- `@varde/core` : bus d'événements et scheduler.
  - `createEventBus` in-process, typé par l'union `CoreEvent`,
    handlers isolés (erreurs loguées sans casser le dispatch).
  - `createSchedulerService` (backend DB-polling, mode dégradé
    ADR 0003) : `in` / `at` / `cron` / `cancel`, boucle
    `start`/`stop` avec tick configurable, `runOnce` et `register`
    exposés pour le cycle de vie et les tests. Cron via
    `cron-parser`. Upsert idempotent sur `jobKey`. Re-scheduling
    automatique des recurrences après exécution. `lastError`
    persisté pour diagnostic.
  - Tests : 7 unitaires EventBus + 13 d'intégration SQLite Scheduler.
- `@varde/contracts` : runtime `defineModule()`.
  - `ModuleDefinition` (manifest statique + hooks onLoad/onEnable/
    onDisable/onUnload + queries + configSchema/configDefaults) et
    `defineModule<T>(definition): T` : valide manifest via
    `manifestStaticSchema`, vérifie le préfixe d'émission
    d'événements, `Object.freeze` le résultat.
- `@varde/core` : plugin loader, ctx factory, UIService.
  - `createUIService()` produit un UIService contract conforme
    (embed/success/error/confirm → UIMessage frozen) + guard
    `isUIMessage(value)` pour le middleware du bot (PR 1.6).
  - `createPluginLoader({ coreVersion, logger, ctxFactory })` :
    register avec check semver, loadAll en tri topologique Kahn
    (cycle et dépendance manquante refusés, optionnelle warn),
    enable/disable par guild idempotents, unloadAll ordre inverse
    avec isolation d'erreur. Erreurs des hooks encapsulées dans
    `ModuleError`.
  - `createCtxFactory({ client, loggerRoot, eventBus, config,
    permissions, keystoreMasterKey, ... })` compose tous les
    services scopés en un ModuleContext figé. Services Discord /
    Modules / AI stubbés en V1 (discord.sendMessage jette explicite,
    modules.query jette, modules.isEnabled retourne false, ai = null).
    `shutdown()` arrête les schedulers instanciés.
  - Ajout : semver 7.7.4 (check coreVersion).
  - Tests : 10 unitaires UIService + 14 unitaires loader +
    4 d'intégration ctx (composition, mémoïsation, stubs,
    bout en bout loader+ctx+events+audit+scheduler).
- `@varde/contracts` : ajout de `ModuleCommand`, `ModuleCommandHandler`,
  `ModuleCommandMap`, `CommandInteractionInput`. Options
  d'interaction restreintes aux types Discord stables V1. Champ
  optionnel `commands` ajouté à `ModuleDefinition`.
- `@varde/bot` : dispatch Discord, registre de slash commands,
  DiscordService concret, shutdown coordinator.
  - `mapDiscordEvent(input)` traduit les 14 événements Discord V1
    en `CoreEvent` via un payload extrait (pas de dépendance
    directe à discord.js).
  - `createCommandRegistry()` + `routeCommandInteraction(input,
    options)` : résolution par nom (conflit entre modules rejeté),
    check `defaultPermission` via `CommandPermissionsPort`,
    validation du retour par `isUIMessage`.
  - `createDiscordService({ sender, rateLimit?, ... })` : implémentation
    du contrat via port `ChannelSender` + rate limit sliding window
    par instance. Erreurs en aval encapsulées en
    `DependencyFailureError`.
  - `createDispatcher({ eventBus, commandRegistry, ui, permissions? })` :
    cœur testable exposant `dispatchEvent` / `dispatchCommand` ;
    indépendant de discord.js.
  - `attachDiscordClient(client, dispatcher, logger)` : wiring concret
    d'un Client discord.js vers le dispatcher pour les 14 événements
    et `interactionCreate`, avec `detach()` pour retirer proprement
    les listeners au shutdown.
  - `createShutdownCoordinator({ logger })` + `bindSignals(coordinator)` :
    étapes LIFO idempotentes, continuation sur exception.
  - Ajout : discord.js 14.26.3.
  - Tests : 37 unitaires (14 mapper, 10 commands, 6 DiscordService,
    4 dispatcher, 3 shutdown). `attachDiscordClient` non testé en
    CI — nécessite Client discord.js réel, couverture manuelle
    prévue au PR 1.7 / jalon 1 closure.
- `@varde/contracts` : signature `ModuleCommandHandler = (input, ctx)`.
  Le handler reçoit désormais le `ctx` scopé au module pour utiliser
  `ctx.ui`, `ctx.i18n`, `ctx.audit`, etc. directement. `CommandRegistry`
  indexe un `ModuleRef` (id + version) ; `routeCommandInteraction`
  prend un `ctxFactory` et construit le ctx à chaque interaction.
- `@varde/testing` (nouveau paquet) : `createTestHarness({ guilds?,
  startTime?, locales?, ... })` monte un core + bot en mémoire
  (SQLite `:memory:`) pour les tests d'intégration de modules.
  Expose `loadModule`, `enable`/`disable`, `emitDiscord`/`emitCore`,
  `runCommand`, `advanceTime`/`runScheduled`, `setMemberContext`,
  `getCtx`/`getScheduler`, `close`. Le faux temps est partagé par
  tous les schedulers via `schedulerNow` sur `createCtxFactory`.
- `@varde/module-hello-world` (nouveau module témoin) : manifeste
  statique, `/ping` (permission `hello-world.ping`), abonnement à
  `guild.memberJoin` qui écrit un audit + planifie une tâche
  welcome + écrit un second audit à l'exécution. Locales fr/en,
  cleanup des souscriptions EventBus via `onUnload`. Critère de
  sortie du jalon 1 satisfait dans les tests (7 e2e + 9 unitaires).

### Jalon 0 — fondations (2026-04-20)

Posé :

- Monorepo pnpm 10 + Turborepo.
- TypeScript 6 strict partagé via `@varde/config` (variantes `node` et
  `browser`).
- Biome 2 et Vitest 4 partagés via le même package.
- Squelettes compilables des apps (`bot`, `api`, `dashboard`) et des
  packages (`core`, `contracts`, `db`, `ui`).
- Docker compose de développement : Postgres 17, Redis 7 avec
  healthchecks.
- CI GitHub Actions : `lint`, `typecheck`, `test`, `build` sur
  Node 24 ; scan de secrets via gitleaks ; templates PR et issues.
- Hooks git : format conventionnel + garde-fou d'invisibilité.
- ADR 0003 sur le mode dégradé sans Redis.
- Licence Apache 2.0.

Aucune fonctionnalité métier livrée. Critère de sortie ROADMAP
vérifié : `pnpm install && pnpm check && pnpm test && pnpm build`
verts sur Node 24 + pnpm 10, workflows CI verts sur `dev`.
