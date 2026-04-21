# Changelog

Toutes les modifications notables du projet sont consignées ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Les versions adhèrent à [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]

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
