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
