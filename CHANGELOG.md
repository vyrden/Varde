# Changelog

Toutes les modifications notables du projet sont consignées ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Les versions adhèrent à [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]

### Jalon 1 — core minimum viable (en cours)

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
