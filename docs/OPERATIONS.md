# Opérations

Règles d'exploitation du dépôt : protection de branches, politique
de merge, tagging, release. Pour les procédures opérateur de
production (rotation de clés, révocation de tokens, sauvegardes),
voir [`SECURITY.md`](../SECURITY.md) et
[`DEPLOYMENT.md`](./DEPLOYMENT.md).

## Branches

- `main` : stable, protégée. Reçoit les merges de `dev` aux
  checkpoints de stabilité (clôture d'un jalon ou hotfix sécurité).
- `dev` : branche d'intégration des PR d'un jalon en cours.
- Branches de travail : préfixées selon le type (`feat/`, `fix/`,
  `docs/`, `chore/`, `refactor/`, `perf/`, `test/`, `build/`, `ci/`).
  Mergées sur `dev` via PR.

## Protection de `main`

Réglages attendus côté GitHub (Settings → Branches) :

- Pull request requise avant merge.
- Approvals : 0 sur projet solo, à bumper à 1 dès qu'un second
  mainteneur arrive.
- Status checks obligatoires :
  - `CI / Lint, typecheck, test, build`
  - `Secrets scan / gitleaks`
- Branche à jour avec la cible avant merge.
- Historique linéaire (squash merge obligatoire, pas de merge
  commit).
- Pas de bypass possible, même pour les admins.

## Protection de `dev`

- Status checks obligatoires.
- Pas d'exigence d'approbation (solo).
- Historique linéaire recommandé mais non bloquant.

## Politique de merge

- Branches de travail (`feat/*`, `fix/*`, etc.) → `dev` : squash
  merge avec titre au format de commit conventionnel.
- `dev` → `main` : merge ou cherry-pick aux checkpoints. Un commit
  par jalon est acceptable comme point de tag.

## Tagging et release

- Tags `vX.Y.Z` posés sur `main`, accompagnés d'une release GitHub
  qui reprend la section correspondante du `CHANGELOG.md`.
- Tags actuels : **v0.4.0** (fin du jalon 4), **v0.5.0** (fin du
  jalon 5).
- La V1.0.0 sortira à la clôture du jalon 6.

## CI

Workflows définis dans
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) et
[`.github/workflows/secrets-scan.yml`](../.github/workflows/secrets-scan.yml).

| Workflow | Étapes | Quand |
| --- | --- | --- |
| `CI` | Install, lint, typecheck, tests, build, audit `pnpm`, coverage, bundle size | PR et push vers `main` / `dev` |
| `Secrets scan` | gitleaks sur le diff | PR et push |

Cache Turborepo local via `actions/cache`, clé indexée sur
`pnpm-lock.yaml` et `github.sha`. Turbo remote cache reporté
post-V1.
