# Testing

Stratégie et pratiques de test du projet. Les tests ne sont pas un ajout en
fin de parcours : ils sont écrits en même temps que le code, et la CI refuse
le merge sans eux.

## Philosophie

- **Tester le comportement, pas l'implémentation.** Un test ne doit pas
  casser quand on refactore sans changer l'API observable.
- **Un test = un comportement.** Un `it()` qui teste trois choses est trois
  tests mal découpés.
- **Tests lisibles comme de la doc.** Les noms de tests décrivent ce qui
  est attendu en langage clair : `it('rejette une sanction avec une durée
  négative')`.
- **Fixtures et builders plutôt que littéraux.** On lit un test pour voir
  ce qu'il teste, pas pour décoder un JSON de 40 lignes.
- **Pas de test flaky toléré.** Un test qui échoue une fois sur dix est
  désactivé le temps de le corriger, documenté dans une issue, pas laissé
  en place.
- **Pas de tests de l'outillage.** On ne teste pas `discord.js`, on ne
  teste pas Zod. On teste notre utilisation.

## Pyramide des tests

Distribution visée du temps d'exécution et du nombre de tests :

- **Tests unitaires** : 70 %. Rapides, isolés, ciblés.
- **Tests d'intégration** : 25 %. Plusieurs unités qui collaborent, DB
  réelle, Redis réel si nécessaire.
- **Tests end-to-end** : 5 %. Parcours critiques du dashboard uniquement,
  exécution coûteuse.

Le ratio n'est pas un objectif en soi : c'est un indicateur. S'il dérive,
on se pose la question.

## Organisation

```
packages/<pkg>/
├── src/
│   └── service.ts
└── tests/
    ├── unit/
    │   └── service.test.ts
    ├── integration/
    │   └── service.spec.ts
    └── fixtures/
        └── guild.builder.ts

apps/dashboard/
├── src/...
└── e2e/
    ├── login.spec.ts
    ├── onboarding.spec.ts
    └── fixtures/
```

Convention de suffixe :

- `.test.ts` : tests unitaires.
- `.spec.ts` : tests d'intégration.
- `.e2e.ts` ou fichiers dans `e2e/` : tests Playwright.

## Outils

- **Vitest** : unit et intégration. Runner rapide, API proche de Jest, TS
  natif.
- **Playwright** : E2E dashboard. Cross-browser, bon DX, stable.
- **Testcontainers** : bases Postgres et Redis éphémères pour les tests
  d'intégration, via Docker.
- **MSW** : mock de requêtes HTTP sortantes côté dashboard et API quand
  nécessaire.
- **axe-core (via Playwright)** : vérifications d'accessibilité automatisées
  sur les pages critiques.

Config partagée dans `packages/config/vitest.config.ts` et
`packages/config/playwright.config.ts`.

## Tests unitaires

### Ce qu'ils testent

- Fonctions pures et modules sans dépendances lourdes.
- Logique de décision (permissions, validation, formatage).
- Composants React isolés (en testant le comportement rendu, pas la
  structure DOM interne).

### Structure

```ts
import { describe, it, expect } from 'vitest'
import { canBanMember } from '../src/permissions'
import { actorBuilder, permissionContextBuilder } from './fixtures'

describe('canBanMember', () => {
  it('autorise un admin à bannir un membre standard', () => {
    const actor = actorBuilder().asAdmin().build()
    const target = actorBuilder().asMember().build()

    const allowed = canBanMember(actor, target, permissionContextBuilder().build())

    expect(allowed).toBe(true)
  })

  it('refuse quand l\'acteur a un rôle inférieur à la cible', () => {
    const actor = actorBuilder().withHighestRolePosition(5).build()
    const target = actorBuilder().withHighestRolePosition(10).build()

    const allowed = canBanMember(actor, target, permissionContextBuilder().build())

    expect(allowed).toBe(false)
  })
})
```

Règles :

- Arrange / Act / Assert visuellement séparés (lignes vides).
- Nom de test descriptif, impératif.
- Builder plutôt qu'objet littéral pour les entités complexes.
- Un `describe` par unité (fonction, classe).

### Ce qu'ils ne testent pas

- L'intégration avec la DB (c'est un test d'intégration).
- L'intégration avec Discord (pas de mock de discord.js complet en unit ;
  tester la logique indépendamment).

## Tests d'intégration

### Ce qu'ils testent

- Le comportement d'un service qui touche à la DB, à Redis, ou à un autre
  module via le core.
- Les migrations et schémas Drizzle (une migration doit pouvoir s'appliquer
  sur une base vide sans erreur).
- L'enregistrement et l'invocation d'un module via le core (contract test).

### Harness de test

Le core expose une `TestHarness` qui instancie un core en mémoire (ou avec
Postgres/Redis Testcontainers selon le besoin), permet d'enregistrer un
module, de simuler des événements Discord (sans connexion réelle), et
d'observer les effets (DB, audit log, messages sortants mockés).

Exemple :

```ts
import { createTestHarness } from '@varde/core/testing'
import moderation from '@varde/moderation'

describe('moderation module integration', () => {
  const harness = createTestHarness({ with: ['postgres'] })

  beforeAll(async () => harness.setup())
  afterAll(async () => harness.teardown())
  beforeEach(async () => harness.reset())

  it('applique un mute et l\'expire après la durée configurée', async () => {
    await harness.loadModule(moderation)

    const actor = harness.buildAdmin()
    const target = harness.buildMember()

    await harness.runCommand('mute', { actor, target, duration: '5m' })

    harness.advanceTime('6m')
    await harness.waitForScheduledTasks()

    const sanctions = await harness.db.select().from(moderationSanctions)
    expect(sanctions[0]?.status).toBe('expired')
  })
})
```

### Règles

- Tests d'intégration isolés entre eux : `beforeEach` qui remet la DB à un
  état propre.
- Utiliser Testcontainers pour Postgres et Redis, pas une instance locale
  partagée (cause de flakiness).
- Pas de sommeil fixe (`sleep(1000)`). Toujours une condition d'attente ou
  un avancement de temps contrôlé.

### Contract tests (core vs modules)

Batterie de tests partagés qui vérifient qu'un module respecte le contrat
du core :

- Le manifeste est valide.
- Les permissions déclarées sont bien utilisées.
- Les migrations s'appliquent proprement.
- Les événements écoutés existent dans le catalogue.
- Les pages dashboard se rendent sans erreur avec une config minimale.

Appliqués à tous les modules officiels. Disponibles aux modules tiers.

## Tests end-to-end

### Périmètre

Limité aux parcours critiques du dashboard :

- Login Discord OAuth2 (avec un mock du serveur OAuth Discord).
- Sélection d'un serveur et arrivée sur le dashboard.
- Parcours d'onboarding complet.
- Édition d'un paramètre de module et vérification de l'effet.
- Consultation de l'audit log avec filtres.

Pas de E2E exhaustifs : chaque module officiel a deux ou trois parcours
E2E clés, pas une couverture par champ.

### Règles

- Tests stables : sélecteurs par rôle ARIA ou `data-testid`, pas par classe
  CSS ou position.
- Pages d'erreur et 404 testées.
- Timeouts explicites sur les attentes asynchrones.
- Trace Playwright activée en cas d'échec pour le debug.
- Exécution en CI avec un bot "test-guild" dédié, isolé du serveur de dev.

## Accessibilité

- axe-core injecté sur les pages Playwright critiques.
- Un échec axe-core fait échouer le test.
- Règles désactivables par cas si faux positif, avec justification dans le
  code.
- Revue manuelle d'accessibilité au moins à chaque release majeure.

## Tests de performance

Pas de tests de performance dédiés en V1 (coût / bénéfice défavorable),
mais :

- Lighthouse CI sur le dashboard à chaque PR qui y touche.
- Scripts de benchmark ad-hoc sur les hot paths (plugin loader, résolution
  de permissions, requêtes d'audit avec filtres).
- Budgets documentés dans `docs/CONVENTIONS.md` section Performance.

## Couverture

- Pas de seuil aveugle type "80 % ou rouge". La couverture n'est pas une
  métrique de qualité par elle-même.
- Cibles indicatives :
  - `packages/core` : couverture unit élevée, tout chemin critique testé.
  - `packages/contracts` : tests de validation des schémas et des types.
  - Modules officiels : tests d'intégration couvrant les commandes,
    l'automod, les événements écoutés.
  - `packages/ui` : tests de comportement des composants (accessibility,
    interactions clavier).
  - `apps/dashboard` : parcours E2E critiques.
- Rapport de couverture publié en CI pour suivi des tendances, pas comme
  garde-fou bloquant (sauf effondrement brutal).

## Données de test

- Builders dans `tests/fixtures/` de chaque package pour construire des
  entités (`actorBuilder`, `guildBuilder`, `moduleBuilder`).
- Générateurs déterministes (seeded). Pas d'aléa non maîtrisé dans les
  tests.
- Factories qui produisent des données valides par défaut, avec surcharges
  pour les cas particuliers.

## Mocks et stubs

### Stratégie

- Pas de mock de discord.js. Utiliser le harness du core qui simule les
  événements au niveau du contrat (pas au niveau bas du gateway).
- Pas de mock de la DB. Utiliser Postgres réel via Testcontainers, ou
  SQLite en mémoire pour les tests très rapides.
- Mock uniquement les services externes non critiques et les appels
  réseau sortants (LLM, webhooks).

### Règle

Un mock est une dette technique. Il doit être justifié par un problème
réel (coût, non-déterminisme, dépendance externe). Un test qui mock la moitié
du système ne teste plus rien.

## Tests de régression

- Chaque bug corrigé vient avec un test qui échoue sans le fix, passe avec.
- Le test est nommé `it('regression: <résumé du bug>', ...)` ou référence
  l'issue (`Refs #123`).
- Les tests de régression ne sont pas supprimés lors de refactors : ils
  sont adaptés.

## Exécution

### Local

Commandes standard :

- `pnpm test` : tous les tests du package courant.
- `pnpm test:unit` : tests unitaires seulement.
- `pnpm test:integration` : tests d'intégration (peut nécessiter Docker).
- `pnpm test:e2e` : tests Playwright.
- `pnpm test:watch` : mode watch pour le développement.

Au niveau monorepo :

- `pnpm -r test` : tous les packages.
- `pnpm turbo test` : avec cache Turborepo.

### CI

Pipeline GitHub Actions par étapes :

1. Install + lint + typecheck (rapide, feedback tôt).
2. Tests unitaires (tous packages, en parallèle).
3. Tests d'intégration (services Postgres / Redis en jobs).
4. Build (toutes apps).
5. Tests E2E (dashboard avec stack complète en Docker Compose).
6. Publication du rapport de couverture.

Temps cible : feedback sous 10 minutes pour les étapes 1-4.

## Pre-commit

Hook léger qui exécute :

- `biome check --write` sur les fichiers staged.
- `pnpm typecheck` (rapide si Turborepo cache actif).
- `pnpm test` sur les packages touchés uniquement.

Configurable pour être contournable en cas d'urgence (`git commit --no-verify`),
mais la CI reste bloquante.

## Debug des tests

- Tests lents : utiliser les timers de Vitest plutôt que `setTimeout` réel.
- Tests non déterministes : activer les traces Playwright, les logs Vitest
  complets, les slow-motion sur les parcours E2E.
- Un test qui échoue en CI mais pas en local : suspect de dépendance à
  l'environnement ou à l'ordre d'exécution. Ne pas réactiver sans
  compréhension de la cause.

## Anti-patterns à éviter

- Tester l'implémentation : vérifier que telle fonction interne a été
  appelée N fois avec tel argument. Sauf cas exceptionnel, on teste l'effet
  visible, pas le chemin.
- Tests qui dépendent de l'ordre d'exécution.
- Tests qui utilisent la date courante sans la mocker (`Date.now()`).
- Tests qui manipulent l'état global (`process.env`) sans nettoyage.
- Tests commentés "à corriger plus tard". Ils sont supprimés ou corrigés.
- Assertions vagues (`expect(result).toBeDefined()` quand on peut vérifier
  la valeur).
