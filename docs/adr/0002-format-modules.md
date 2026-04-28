# 0002. Format des modules : manifeste TS, `module.json` généré, surface du `ctx`

Date: 2026-04-20
Statut: accepted

## Contexte

Le projet est conçu comme une plateforme d'extensions. Les modules
(officiels et tiers) ont besoin d'un format de déclaration qui satisfasse
plusieurs exigences parfois contradictoires :

- Déclaratif, lisible, validable à chaud.
- Typé de bout en bout en TypeScript.
- Consommable par des outils externes (catalogue, site de découverte) sans
  exécuter le code du module.
- Contenir à la fois des métadonnées statiques (id, permissions, events) et
  du code runtime (handlers, schemas Zod, hooks de cycle de vie).
- Ne pas créer de double source de vérité qui dérive dans le temps.

Parallèlement, les modules ont besoin d'un point d'accès unique au core :
le `ctx`. Sa surface doit être figée tôt car tout module dépendra du
contrat. Ajouter un service plus tard est facile, en retirer un est une
rupture majeure.

## Décision

### Manifeste : `defineModule()` en TypeScript, source de vérité unique

Le point d'entrée d'un module est `src/index.ts` qui exporte par défaut
le retour d'un helper `defineModule()` fourni par le core :

```ts
import { defineModule } from '@varde/core'

export default defineModule({
  id: 'moderation',
  name: 'Modération',
  version: '1.0.0',
  coreVersion: '^1.0.0',
  // ... métadonnées, permissions, events, commands, handlers, schemas
})
```

`defineModule()` :

- valide l'objet via un meta-schema Zod à l'import (fail fast),
- fige l'objet (`Object.freeze`),
- retourne un type `Module` précis.

C'est la source de vérité unique pour un module. Tout ce qui concerne le
module vit ici ou est référencé depuis ici (schemas Zod, handlers,
migrations).

### `module.json` : généré, jamais écrit à la main

Un fichier `module.json` est généré automatiquement depuis
`defineModule()` par un script `pnpm build:manifest`. Il contient
uniquement les **métadonnées statiques** consommables par un outil externe
sans exécuter de code :

```json
{
  "id": "moderation",
  "name": "Modération",
  "version": "1.0.0",
  "description": "Modération manuelle et automatique.",
  "author": { "name": "Mainteneur", "url": "https://example.com" },
  "license": "MIT",
  "coreVersion": "^1.0.0",
  "dependencies": {
    "modules": [],
    "optionalModules": ["logs"]
  },
  "permissions": [
    { "id": "moderation.warn", "category": "moderation", "defaultLevel": "moderator" },
    { "id": "moderation.ban", "category": "moderation", "defaultLevel": "admin" }
  ],
  "events": {
    "listen": ["guild.memberJoin", "guild.messageCreate"],
    "emit": ["moderation.sanction.applied", "moderation.sanction.expired"]
  },
  "commands": ["ban", "kick", "mute", "warn"],
  "queries": ["moderation.sanction_count"],
  "schemaVersion": 1
}
```

Ne figurent pas dans `module.json` : handlers, Zod schemas complets,
defaults de config. Ils restent dans le TS.

Règles :

- Le fichier est commité.
- La génération tourne en build et en pre-commit.
- La CI vérifie que le `module.json` commité correspond au TS. Si divergence,
  la build échoue.
- Un outil externe (site catalogue, GitHub Actions tierces) peut cloner le
  repo d'un module et lire `module.json` sans installer de toolchain Node.

### Structure du manifeste TS

Champs obligatoires :

- `id` : identifiant unique. `kebab-case`, préfixé de l'auteur pour les
  tiers (`author/module-name`).
- `name`, `description`, `version` (semver strict), `author`, `license`.
- `coreVersion` : range semver compatible.
- `schemaVersion` : version du schéma DB du module.

Contrat avec le core :

- `permissions` : map d'id vers `{ description, category, defaultLevel }`.
- `events.listen` : liste des événements écoutés (validés contre le
  catalogue).
- `events.emit` : liste des événements émis (doivent être préfixés par
  l'id du module).
- `commands` : liste de `CommandDefinition` (nom, options, handler,
  permission requise).
- `queries` : map d'id vers `{ input: ZodSchema, output: ZodSchema,
  handler }` — queries publiques exposées aux autres modules.

Dépendances :

- `dependencies.modules` : modules requis (bloquent le chargement si
  absents).
- `dependencies.optionalModules` : modules utilisés si présents (le
  module dégrade gracieusement sinon).

Configuration :

- `configSchema` : Zod schema de la config.
- `configDefaults` : valeurs par défaut.

Dashboard :

- `dashboardPages` : pages déclaratives ou custom contribuées au dashboard
  (voir [`PLUGIN-API.md`](../PLUGIN-API.md)).

Onboarding :

- `onboardingContributions` : questions et règles de recommandation
  contribuées au wizard.

Cycle de vie :

- `onLoad`, `onEnable`, `onDisable`, `onUnload` : hooks optionnels.

Fichiers externes référencés :

- Migrations DB : dossier `./migrations/` (convention).
- Traductions : dossier `./locales/` (convention).

### Validation au chargement

Quand le core charge un module, il vérifie dans l'ordre :

1. Le manifeste parse contre le meta-schema Zod.
2. `coreVersion` satisfait la version courante du core.
3. Pas de collision d'ids de permissions avec des modules déjà chargés.
4. Les événements écoutés existent dans le catalogue (core ou modules
   chargés).
5. Les événements émis sont préfixés par l'id du module.
6. Les dépendances dures sont satisfaites.
7. Les tables déclarées par le module sont préfixées par son id.
8. Les noms de queries ne collisionnent pas.
9. Le `module.json` sur disque correspond au TS (sinon warning, CI échoue).

Échec → module non chargé, entrée `modules_registry` non créée, erreur
journalisée.

### Dépendances entre modules

Un module peut déclarer des dépendances dures
(`dependencies.modules`) ou optionnelles
(`dependencies.optionalModules`). Deux points méritent d'être précisés
en V1.

#### Détection des cycles

Au chargement, le core construit le graphe de dépendances dures et
applique un tri topologique (algorithme de Kahn). Tout cycle détecté
provoque :

- un refus de charger l'ensemble des modules impliqués dans le cycle ;
- un message d'erreur qui nomme explicitement les modules du cycle et
  le chemin de dépendance fautif ;
- aucune mutation du `modules_registry` pour les modules refusés.

Les dépendances optionnelles ne sont pas prises en compte dans la
détection des cycles : elles forment des références lâches par design.

#### Visibilité des queries inter-modules

En V1, toute query déclarée dans le manifeste d'un module (`queries`)
est publique. N'importe quel autre module peut l'appeler via
`ctx.modules.query()`. Il n'y a ni granularité par binding de
permission, ni notion de query privée.

Ce choix simplifie la V1 et reflète la réalité attendue : les modules
officiels n'ont pas de données à cacher les uns aux autres, et un
module tiers qui exposerait une query sensible doit la protéger par
ses propres vérifications côté handler (`ctx.permissions.can`).

Une granularité plus fine (queries privées, queries restreintes par
rôle module, quotas) est reportée post-V1 et sera traitée dans un
futur ADR si un cas concret émerge.

### Surface du `ctx`

`ctx` est le seul point d'accès autorisé d'un module vers le core.
Structure :

```ts
interface ModuleContext {
  readonly module: { id: ModuleId; version: string }
  readonly logger: Logger
  readonly config: ConfigService
  readonly db: ScopedDatabase
  readonly events: EventBus
  readonly audit: AuditService
  readonly permissions: PermissionService
  readonly discord: DiscordService
  readonly scheduler: SchedulerService
  readonly i18n: I18nService
  readonly modules: ModulesService
  readonly keystore: KeystoreService
  readonly ai: AIService | null
  readonly ui: UIService
}
```

Services détaillés dans [`PLUGIN-API.md`](../PLUGIN-API.md).

Principes transverses :

- Tous les services sont stables au sens semver. Une rupture est un
  changement majeur du core.
- `ctx.ai` est `null` si aucun fournisseur n'est configuré sur l'instance :
  le module gère le cas explicitement.
- `ctx.modules.query()` permet aux modules de se parler via queries
  typées, jamais par accès direct DB.
- Aucun import interne du core (`@varde/core/internal`) n'est
  autorisé dans un module.

## Alternatives considérées

### `module.json` pur, TS dérivé

Le JSON serait la source de vérité, le TS en serait dérivé.

Rejeté : impossible de mettre des handlers, des Zod schemas ou du code
dans un JSON. On finirait avec deux fichiers à maintenir ou avec tout le
code hors du manifeste et un assemblage manuel. Perd tous les bénéfices
du typage TS.

### Deux fichiers à maintenir à la main

`module.json` + `index.ts` indépendants.

Rejeté : drift garanti dans le temps, aucun gain par rapport à la
génération automatique.

### Pas de `module.json` du tout

Tout dans le TS, le catalogue externe exécute le code pour extraire.

Rejeté : un catalogue externe qui exécute du code tiers est un risque de
sécurité et un coût opérationnel. Le `module.json` permet une lecture
passive safe. Les outils de découverte, d'indexation et de lint en
bénéficient immédiatement.

### Manifeste YAML

Plus lisible que JSON pour les humains.

Rejeté : écosystème Node moins robuste, parsing plus lent, typage
ambiguë sur les nombres et dates, JSON suffit pour du généré.

### Hiérarchie d'héritage pour les modules

Module abstrait avec méthodes à redéfinir.

Rejeté : moins flexible que la composition via manifeste. Les classes
imposent un cadre rigide qui cadre mal avec la nature déclarative des
modules.

### `ctx` découpé en plusieurs contextes (read vs write)

Séparer `ctxRead` et `ctxWrite` pour matérialiser les intentions.

Rejeté pour la V1 : complexité qui n'apporte pas de bénéfice clair. Les
permissions et l'audit couvrent le besoin. À reconsidérer si un usage
concret émerge.

## Conséquences

### Positives

- Une seule source de vérité par module.
- Typage complet de bout en bout, incluant les queries inter-modules.
- `module.json` consommable par des outils externes sans exécution.
- `ctx` figé tôt = contrat stable pour l'écosystème.
- Validation au chargement catch les erreurs avant qu'elles n'atteignent
  la prod.
- L'isolation (préfixe tables, `ctx.db` scopé, pas d'accès interne au
  core) est matérialisée dans le code, pas seulement dans la doc.

### Négatives / points de vigilance

- `defineModule()` doit être très bien typé (générique multi-niveaux) pour
  que les queries inter-modules soient inférées correctement. Chantier
  de typage non trivial à l'implémentation initiale.
- La génération de `module.json` est un script supplémentaire à maintenir
  dans l'outillage partagé du monorepo.
- Le meta-schema Zod qui valide les manifestes est un fichier critique :
  chaque évolution doit préserver la compatibilité descendante avec les
  modules tiers, ou être traitée comme rupture majeure du core.
- La surface du `ctx` est large. Un module n'utilise typiquement que
  2-3 services. Pas un problème de perf (les services sont des interfaces
  légères), mais un coût cognitif pour le nouveau contributeur. Mitigé par
  une bonne doc et des exemples.
- Le scoping runtime du client Drizzle (promesse du `ctx.db`) est un
  chantier technique à prototyper tôt pour valider la faisabilité
  ergonomique.

### Implications pour le jalon 0

- Figer le meta-schema Zod du manifeste.
- Implémenter `defineModule()` avec validation.
- Implémenter le script `build:manifest` qui génère `module.json`.
- Figer les interfaces des services du `ctx` (types seulement, pas
  d'implémentation complète).
- Écrire un module `hello-world` interne qui exerce toute la surface.

Si `hello-world` fait apparaître des manques de l'API, ce sont des
changements au core, pas des exceptions au contrat.

## Références

- [ADR 0001 - Schéma DB du core](./0001-schema-db-core.md)
- [`PLUGIN-API.md`](../PLUGIN-API.md) : détail des services du `ctx` et
  conventions des modules.
- [`ONBOARDING.md`](../ONBOARDING.md) : contributions au wizard.
- Spec Zod : https://zod.dev
