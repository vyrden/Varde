# Changelog

Toutes les modifications notables du projet sont consignées ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Les versions adhèrent à [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]

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
