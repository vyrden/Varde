# Conventions

Conventions de code, commentaires, formatage, erreurs, logs, dépendances,
accessibilité, performance, sécurité du code et process git. Objectif :
minimiser le bruit en revue, maximiser la lisibilité, garder un historique
utile sur le long terme.

Les tests sont couverts dans [`TESTING.md`](./TESTING.md).
La gestion des ressources statiques est couverte dans [`ASSETS.md`](./ASSETS.md).

## Principes généraux de code

- **Clarté avant concision.** Un nom long et précis bat un nom court et
  ambigu. Une variable intermédiaire bien nommée bat une expression tassée.
- **Une fonction, une responsabilité.** Si on peut la décrire avec un "et",
  la découper.
- **Pas d'abstraction prématurée.** Règle de trois : on n'abstrait qu'au
  troisième usage, pas avant.
- **Éviter l'état mutable quand c'est possible.** Préférer les
  transformations (`.map`, `.filter`, etc.) aux boucles qui mutent.
- **Effets de bord explicites.** Les fonctions qui écrivent en DB, envoient
  des messages Discord, ou modifient l'état global sont nommées pour qu'on
  le voie (`save`, `send`, `publish`, `apply`).
- **Échec explicite, jamais silencieux.** Une erreur non gérée est une
  erreur, pas un "silent fallback".
- **Pas de branche morte.** Code commenté = code supprimé. Git garde
  l'historique.
- **Pas de magie par configuration.** Un comportement non évident doit être
  nommé dans le code, pas caché dans un fichier `.env`.

## TypeScript

### Options du compilateur

Configurées dans `tsconfig.base.json`, étendues par chaque package :

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler"
  }
}
```

### Règles

- Pas de `any`. Utiliser `unknown` et raffiner avec des type guards.
- Pas de `as` cast sauf justification brève en commentaire adjacent.
- Préférer les types union discriminés aux héritages de classes.
- Utiliser les types nominaux (branded types) pour les identifiants
  sensibles (`GuildId`, `UserId`, `ModuleId`) plutôt que `string` nu.
- Les fonctions exportées ont un type de retour explicite. Les fonctions
  internes peuvent s'appuyer sur l'inférence.
- Pas d'énumérations TypeScript (`enum`). Utiliser des unions de littéraux
  ou `const` object `as const`.
- Un fichier exporte soit une classe, soit un ensemble cohérent de fonctions
  et types. Pas de méli-mélo.
- Zod pour la validation des données externes (API, config, input
  utilisateur). Jamais de validation ad-hoc manuelle.

### Nullabilité et immuabilité

- `Readonly<T>`, `ReadonlyArray<T>`, `ReadonlyMap<T, U>` par défaut pour les
  paramètres et les retours.
- `const` par défaut, `let` quand nécessaire, pas de `var`.
- Optional chaining (`?.`) et nullish coalescing (`??`) plutôt que chaînes
  de `&&` ou `||`.

## Nommage

### Fichiers et dossiers

- Fichiers : `kebab-case.ts`.
- Dossiers : `kebab-case`.
- Tests à côté du code : `nom-du-module.test.ts` / `.spec.ts`.
- Index optionnel (`index.ts`) uniquement quand il agrège sous une seule
  surface. Jamais pour faire du ré-export aveugle.

### Identifiants

- Types, interfaces, classes : `PascalCase`.
- Fonctions, variables, méthodes : `camelCase`.
- Constantes globales : `SCREAMING_SNAKE_CASE`.
- Type paramètres génériques : `T`, `U`, ou nom explicite en `PascalCase`
  quand la signification compte (`TEntity`, `TResult`).
- Booléens : préfixe verbal (`is`, `has`, `should`, `can`).
- Collections : pluriel (`users`, `messages`).
- Méthodes asynchrones : pas de suffixe `Async`, mais un type de retour
  `Promise<T>` explicite.

### Identifiants canoniques (runtime)

- Permissions, événements, actions d'audit : `module.action.subject` en
  `lowercase.dotted.case`.
- Commandes Discord : `lowercase-kebab-case`.
- Tables DB : `snake_case`, préfixées par le module pour les tables non-core
  (`moderation_sanctions`).
- Colonnes DB : `snake_case`.
- Variables d'environnement : `SCREAMING_SNAKE_CASE` avec préfixe projet
  (ex: `VARDE_DATABASE_URL`).

## Organisation des fichiers

Arborescence type d'un module :

```
modules/<name>/
├── package.json
├── module.json              # ou src/manifest.ts
├── src/
│   ├── index.ts             # export du Module
│   ├── commands/            # un fichier par commande
│   ├── events/              # handlers d'événements
│   ├── handlers/            # logique métier
│   ├── schemas/             # schémas Zod
│   ├── db/                  # accès DB du module
│   ├── onboarding/          # contributions à l'onboarding
│   └── ui/                  # pages dashboard déclaratives
├── migrations/              # migrations Drizzle du module
└── tests/
    ├── unit/
    └── integration/
```

Principe : un fichier fait une chose et l'arborescence rend cette chose
lisible.

## Commentaires

### Principe

- Les commentaires expliquent le **pourquoi**, pas le **comment**. Le code
  dit le comment.
- Un commentaire qui paraphrase le code est un bruit. À supprimer.
- Un commentaire qui décrit une décision non évidente, un trade-off, un
  contournement ou un pré-requis externe est précieux.
- Un commentaire qui commence par "HACK", "XXX", "WARNING", "NOTE" attire
  l'attention. Les utiliser avec parcimonie.

### JSDoc

Obligatoire sur :

- Toute fonction / classe / type exporté depuis un package consommé par
  d'autres packages.
- Toute API publique du core, des contracts, du ui.
- Tout handler d'événement qui fait partie du contrat avec l'extérieur.

Forme :

```ts
/**
 * Vérifie si un acteur a une permission applicative sur une cible.
 *
 * @param actor - L'utilisateur Discord ou l'identifiant système.
 * @param permission - Identifiant canonique de la permission.
 * @param target - Entité concernée (optionnel pour les permissions globales).
 * @returns `true` si la permission est accordée.
 * @throws {PermissionResolutionError} Si le mapping rôle / permission est corrompu.
 */
function can(actor: Actor, permission: PermissionId, target?: Target): boolean
```

Règles :

- Une phrase résumée en première ligne.
- `@param`, `@returns`, `@throws` seulement quand ils ajoutent de
  l'information.
- Pas de type JSDoc (redondant avec TS).
- Exemples (`@example`) pour les API non triviales du core.

### Annotations spéciales

- `// TODO(nom-ou-issue): description` — suivre avec un nom ou un numéro
  d'issue.
- `// FIXME: description` — bug connu, priorité haute.
- `// HACK: description` — contournement qu'on assume.
- `// NOTE: description` — information utile au lecteur.

Les `TODO` sans propriétaire sont refusés en revue.

### Sections dans les gros fichiers

Au-delà de 200 lignes, séparer les sections par des séparateurs visuels :

```ts
// -------------------------------------------------------------------
// Validation
// -------------------------------------------------------------------
```

Et se poser la question : ce fichier ne devrait-il pas être scindé ?

## Formatage

### Biome

Outil unique pour le lint et le format. Config dans
`packages/config/biome.json` réutilisée par tous les packages.

Règles principales :

- Indentation : 2 espaces.
- Largeur de ligne : 100 caractères.
- Trailing commas : `all`.
- Semi-colons : toujours.
- Quotes : `single` pour JS/TS, `double` pour JSX attributes.
- Object / array wrapping : selon la largeur de ligne, cohérent dans un
  fichier.
- Imports triés automatiquement (externes, internes, relatifs).

### Règles de lint critiques

Activées et non désactivables sans commentaire de justification :

- `noExplicitAny`
- `noNonNullAssertion`
- `useAwait`
- `noFloatingPromises`
- `noUnusedVariables`
- `noUnusedImports`
- `useConst`
- `noConsole` (interdit `console.log` en code de prod, `console.error`
  toléré dans les scripts CLI)
- `useExhaustiveDependencies` (React)
- `useJsxKeyInIterable`

### Pre-commit

Hook git simple qui exécute `biome check --write` sur les fichiers staged.
Outils légers : `simple-git-hooks` + `lint-staged`, ou `husky` + `lint-staged`.

## Erreurs

### Hiérarchie

Toutes les erreurs métier héritent d'une classe de base `AppError` définie
dans `packages/core/errors` :

```ts
class AppError extends Error {
  readonly code: string
  readonly httpStatus?: number
  readonly cause?: Error
  readonly metadata?: Record<string, unknown>
}
```

Sous-classes par domaine :

- `ValidationError` (entrée invalide).
- `NotFoundError` (ressource absente).
- `PermissionDeniedError` (vérification de permission en échec).
- `ConflictError` (état incompatible).
- `DependencyFailureError` (Discord API, DB, Redis indisponibles).
- `ModuleError` (problème dans un module, encapsule l'erreur sous-jacente).

### Règles

- Jamais de `throw 'string'` ou `throw { message: '...' }`. Toujours une
  classe.
- Jamais d'erreur avalée. `catch` sans re-throw doit logger explicitement.
- Les erreurs sont enrichies en remontant : `new DependencyFailureError(...,
  { cause: originalError })`.
- Les messages d'erreur s'adressent au développeur par défaut. Les messages
  utilisateur passent par `ctx.ui.error(traductionKey)`.
- Les codes d'erreur sont stables (ils apparaissent dans l'audit log et dans
  les clients API). Un changement de code = changement de version.

### Gestion côté handler

- Les handlers de commandes Discord attrapent toute erreur et répondent via
  `ctx.ui.error`. Ils loguent l'erreur complète avec stack.
- Les handlers d'API Fastify utilisent un plugin d'error handler qui
  convertit les `AppError` en réponses HTTP structurées.
- Les promesses orphelines sont interdites (`noFloatingPromises`).

## Logs

### Règles

- Pino exclusivement, via le logger scoped (`ctx.logger` pour un module,
  `logger.child(...)` pour un sous-domaine du core).
- Niveaux : `fatal`, `error`, `warn`, `info`, `debug`, `trace`.
- Niveau par défaut en prod : `info`. En dev : `debug`.
- Pas de `console.log`, `console.info`, etc. dans le code versionné.
- Format JSON en prod, pretty-print en dev via `pino-pretty`.

### Champs stables

Tous les logs liés à un serveur incluent au minimum :

- `guildId`
- `module` (si émis par un module)
- `userId` ou `actorId` (si applicable)
- `action` (si applicable)

### Interdictions

Jamais dans les logs :

- Tokens Discord, clés API, mots de passe.
- Contenu brut de messages privés ou salons privés.
- Adresses e-mail d'utilisateurs.
- Informations permettant de reconstruire un secret (même partiellement).

Un linter custom peut détecter les fuites courantes (recherche de
patterns `Bot `, `Bearer `, `sk_`). À mettre en place en CI.

## Configuration

- Un seul système, exposé par le core. Pas de fichier `.yaml` ad-hoc par
  module.
- Schémas Zod obligatoires pour toute config.
- Variables d'environnement : listées dans `.env.example`, documentées,
  validées au démarrage (fail fast si manquantes).
- Secrets jamais dans le code ni dans les fichiers versionnés.
- Pas de valeurs magiques dans le code : extraire en constantes nommées,
  ou dans la config si ajustable.

## Dépendances

### Avant d'ajouter une dépendance

Vérifier, dans l'ordre :

1. Existe-t-il déjà dans le repo ? (Éviter les doublons de libs similaires.)
2. Peut-on le faire en 30 lignes ? (Principe left-pad : pas de lib pour un
   one-liner.)
3. Taille du bundle et impact perf.
4. Maintenance : dernière release, issues ouvertes, breaking changes
   récurrents.
5. Licence compatible avec la nôtre.
6. CVE connues récentes.
7. Alternative auto-hostable en cas de service tiers.

### Gestion courante

- pnpm avec lockfile strict (`package-lock.json` équivalent : `pnpm-lock.yaml`).
- Renovate ou Dependabot configuré pour les updates de sécurité automatiques
  et les updates mineures groupées.
- Updates majeures : manuelles, documentées dans la PR (breaking changes,
  migration nécessaire, tests à refaire).
- `npm audit` / `pnpm audit` vérifiés à chaque PR via CI.
- Liste des dépendances directes gardée aussi courte que possible.

### Interdictions

- Pas de dépendance sur un service externe propriétaire sans alternative
  auto-hébergeable documentée.
- Pas de dépendance GPL ou copyleft fort sans justification (incompatible
  avec une licence MIT / Apache côté cœur).
- Pas de dépendance sur des packages sans maintenance active depuis plus de
  18 mois (sauf si stable, exhaustivement audité, candidat à un fork
  maintenu).

## Accessibilité (dashboard)

- Cible : WCAG AA minimum sur toutes les pages.
- Composants shadcn/ui utilisés : vérifier l'accessibilité dès l'intégration
  (certains composants requièrent des ajustements).
- Tous les éléments interactifs : navigables au clavier, visibles au focus.
- Contraste texte / fond : respecté par le design system (à auditer
  régulièrement via outils comme axe-core ou Lighthouse).
- Tout champ de formulaire a un `<label>` associé.
- Toute image informative a un `alt`. Les images décoratives ont `alt=""`.
- Les icônes interactives ont un `aria-label`.
- Les états de chargement sont annoncés aux lecteurs d'écran (`aria-live`).
- Les routes dynamiques mettent à jour `document.title` de manière
  pertinente.
- Tests d'accessibilité : axe-core intégré aux tests Playwright critiques.

## Performance

### Budgets

- **Bot** : démarrage à froid < 5s sur instance dev, < 10s en prod.
- **API** : latence p95 < 150ms sur requêtes simples, < 500ms sur requêtes
  complexes.
- **Dashboard** : TTI < 3s sur connexion 4G simulée, bundle initial JS
  < 300KB gzip.
- **DB** : aucune requête hors cache > 100ms en p95 sur les parcours
  critiques.

Mesurés en CI via scripts ad-hoc sur une base de données de référence.

### Règles

- Pas d'appel N+1. Toujours charger les relations en batch ou via jointures.
- Cache Redis pour les lectures fréquentes (permissions compilées, config
  serveur).
- Pagination obligatoire sur toute liste > 50 éléments possible.
- Images et assets du dashboard : voir [`ASSETS.md`](./ASSETS.md).
- Server Components Next.js par défaut, Client Components quand nécessaire.
- Pas de `useEffect` pour synchroniser avec des props (anti-pattern React).
- Mémoization (`useMemo`, `useCallback`) seulement quand justifiée par un
  profil.

### Monitoring perf

- Lighthouse CI sur le dashboard à chaque PR qui y touche.
- Métriques de requêtes DB exposées via `/metrics` pour détection des
  régressions.

## Sécurité du code

Règles applicables à tout le code. Politique et signalement de vulnérabilités
dans [`SECURITY.md`](../SECURITY.md).

### Entrées utilisateur

- Toute entrée externe (commande Discord, requête API, webhook) est validée
  par un schéma Zod avant traitement.
- Pas de concaténation de string dans les requêtes SQL. Drizzle génère des
  requêtes paramétrées par défaut, ne pas contourner.
- Les URLs construites à partir d'entrées utilisateur sont validées et
  limitées (protocoles, hôtes autorisés).

### Secrets

- Variables d'environnement pour tous les secrets.
- `.env` et `.env.local` dans `.gitignore`.
- `dotenv-safe` ou équivalent : le démarrage échoue si une variable requise
  manque.
- Scanner de secrets en CI (gitleaks ou équivalent). PR refusée si un secret
  est détecté, même dans les tests.
- Rotation documentée pour les tokens longue durée.

### Auth et sessions

- Cookies : `HttpOnly`, `Secure` en prod, `SameSite=Lax`.
- Sessions avec rotation régulière.
- CSRF : tokens sur toutes les routes API mutantes invoquées depuis le
  navigateur.
- Rate limiting applicatif sur login, routes sensibles.

### Données sensibles

- Chiffrement au repos pour les tokens tiers stockés par les modules
  (keystore chiffré du core).
- Logs audités périodiquement pour absence de fuites.
- RGPD : voir section dédiée dans [`ARCHITECTURE.md`](./ARCHITECTURE.md).

### Dépendances (à nouveau)

- CVE scannées automatiquement.
- Mises à jour de sécurité appliquées sous 7 jours pour les sévérités haute
  et critique.

## Internationalisation (i18n)

- Toutes les chaînes destinées à l'utilisateur passent par `ctx.i18n.t(key,
  params)`.
- Clés hiérarchiques : `module.category.message`.
- Fichiers de traduction par locale dans chaque module :
  `modules/<name>/src/locales/fr.json`, `en.json`.
- Langue par défaut : français. Langue de fallback : anglais.
- Les pluriels utilisent ICU MessageFormat.
- Pas de concaténation de strings traduites. Utiliser les paramètres du
  format.

## Git

### Branches

- `main` : stable, protégée, merge via PR uniquement.
- Branches de travail : `feat/<sujet>`, `fix/<sujet>`, `refactor/<sujet>`,
  `docs/<sujet>`, `chore/<sujet>`, `perf/<sujet>`, `test/<sujet>`.
- Pas de branches longues. Un sujet, une branche, un merge, une suppression.
- Protection de `main` : PR obligatoire, CI verte, historique linéaire
  (rebase / squash).

### Commits

Format conventionnel :

```
<type>(<scope>): <sujet>

<corps optionnel>

<footer optionnel>
```

Types autorisés : `feat`, `fix`, `refactor`, `docs`, `chore`, `test`,
`perf`, `style`, `build`, `ci`.

Scopes typiques : `core`, `api`, `dashboard`, `moderation`, `welcome`,
`roles`, `logs`, `onboarding`, `db`, `ui`, `docs`, `deps`, `ci`.

Exemples :

```
feat(core): ajout du scheduler de tâches persistantes
fix(moderation): la durée d'un mute n'était pas décomptée au redémarrage
refactor(dashboard): extraction des formulaires déclaratifs dans ui/
docs(plugin-api): clarification du cycle de vie des hooks
perf(db): index composite sur audit_log(guild_id, created_at)
```

Règles :

- Sujet court (≤ 72 caractères), impératif, sans point final.
- Corps explique le pourquoi, pas le comment.
- Référencer les issues (`Closes #42`, `Refs #37`) dans le footer si
  pertinent.
- Pas de commits "wip", "fix typo", "another fix" en historique final.
  Squash ou rebase avant merge.
- Pas de `Co-Authored-By` ajouté par un outil tiers — un commit cite
  uniquement les auteurs humains qui y ont contribué.

### PR

- Une PR = une raison de changer.
- Titre au format commit conventionnel.
- Description avec :
  - **Contexte** : pourquoi cette PR.
  - **Changements** : ce qui change, à haut niveau.
  - **Impact** : breaking change ou non, migration nécessaire.
  - **Vigilance** : points à regarder en revue.
  - **Captures** pour les changements UI.
- Labels : `core`, `module:*`, `dashboard`, `api`, `docs`, `security`.
- Les PR qui modifient une API publique du core ou le contrat plugin
  viennent avec un ADR.
- CI verte obligatoire avant merge.
- Squash merge par défaut pour garder `main` linéaire et propre.

### Versioning et changelog

- Semver strict pour core, contracts, chaque module.
- `CHANGELOG.md` tenu à la main, format
  [Keep a Changelog](https://keepachangelog.com).
- À chaque release : tag git `vX.Y.Z`, release GitHub reprenant le
  changelog.
- Breaking changes : documentés explicitement, avec guide de migration si
  nécessaire.

### ADR (Architecture Decision Records)

Format court : contexte, décision, alternatives considérées, conséquences.

- Un ADR par décision structurante.
- Numérotation séquentielle : `0001-titre-court.md`.
- Rangés dans `docs/adr/`.
- Statut : `proposed`, `accepted`, `superseded by NNNN`.
- Ne jamais modifier un ADR accepté : créer un nouvel ADR qui le remplace.

## Checklist revue de PR

À relire avant merge :

- Titre et description corrects.
- Principes non-négociables respectés (voir [README.md](../README.md)
  et la section « Principes » de ce document).
- Types stricts, pas de `any` ni de `as` injustifiés.
- Erreurs gérées, pas de promesse orpheline.
- Logs sans fuites de secrets.
- Audit écrit si une action d'état a lieu.
- Permissions vérifiées pour les actions sensibles.
- Tests présents et significatifs.
- Documentation à jour si l'API publique change.
- Changelog mis à jour si utilisateur-visible.
