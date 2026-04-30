# Architecture

Ce document décrit l'architecture du projet, les choix de stack et leurs
justifications. Les décisions individuelles significatives sont documentées
dans des ADR courts sous `docs/adr/`.

## Vue d'ensemble

Trois processus Node.js déployables indépendamment :

- **bot** : connexion au gateway Discord, dispatch des événements, exécution
  des commandes, invocation des modules.
- **api** : API HTTP consommée par le dashboard. Expose la config, l'audit
  log, les actions admin. Ne parle pas à Discord directement, passe par le
  bot via un canal interne (IPC via Redis pub/sub ou file partagée).
- **dashboard** : application Next.js côté client et serveur, consomme l'API.

Stockage :

- **PostgreSQL** : source de vérité pour config, audit log, état métier des
  modules.
- **Redis** : cache, queues, rate limiting, pub/sub inter-processus.
- **SQLite** : alternative au Postgres pour déploiements mono-serveur sans
  Redis, dégradé mais fonctionnel.

## Stack et justifications

### Node.js 24 LTS

Écosystème Discord le plus mature. Active LTS jusqu'en avril 2029, ce qui
couvre largement l'horizon V1. Bun est plus rapide et plus moderne mais
discord.js n'est pas encore garanti stable en production sous Bun. À
reconsidérer dans un an.

### TypeScript strict

Nécessité pour un système à plugins : le contrat entre core et modules doit
être typé, sinon on crée précisément le bordel que l'architecture cherche à
éviter. `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.

### pnpm workspaces + Turborepo

Monorepo parce que core, modules et dashboard évoluent ensemble et partagent
des types. pnpm pour la gestion disque et la rigueur des dépendances (pas de
hoisting sauvage). Turborepo pour le cache de build partagé dès que le repo
grossit.

### discord.js v14

Standard de fait. Types officiels, gateway géré, cache correct, communauté
énorme. Alternative envisagée : Sapphire Framework. Rejetée parce qu'elle
impose sa propre abstraction de commandes et de modules, ce qui entre en
conflit avec notre propre système d'extensions.

### Fastify

Backend API du dashboard. Plus léger et plus rapide que Express ou NestJS,
TypeScript-first, système de plugins natif. NestJS envisagé puis rejeté : sa
structure opinionnée et son injection de dépendances ajoutent du poids sans
bénéfice ici, puisque nous bâtissons notre propre système de modules. On ne
superpose pas deux frameworks modulaires.

### Drizzle ORM + PostgreSQL

Drizzle plutôt que Prisma pour trois raisons :

1. Proche de SQL, peu de magie, plus facile à débugger.
2. Build plus léger, pas de génération de client à chaque migration.
3. Les modules peuvent déclarer leurs propres schémas et migrations sans
   entrer en conflit avec le schéma du core.

PostgreSQL comme cible principale. SQLite accepté pour les petits déploiements
via l'abstraction Drizzle, avec documentation des limitations (pas de concurrent
writes au-delà d'un certain seuil, certaines requêtes analytiques plus lentes).

### Next.js 16 + TailwindCSS 4 + shadcn/ui

Next.js pour le dashboard. App Router, React 19, Server Components. TailwindCSS 4
en architecture CSS-first (`@import "tailwindcss"` dans la feuille d'entrée,
pas de fichier de config JS obligatoire) pour coller à l'approche design system
imposé (pas de surcharge CSS sauvage par module). shadcn/ui parce que les
composants sont *copiés* dans le repo (pas une dépendance npm), donc nous
définissons notre design system et les modules l'utilisent sans pouvoir le
contourner.

### Auth.js (Discord OAuth2)

Standard pour l'auth Next.js. Session JWT côté dashboard, validation serveur
via l'API Discord pour savoir quels serveurs l'utilisateur administre.

Les `clientId` / `clientSecret` Discord ne viennent **pas** d'`.env`. Ils
sont saisis dans le wizard, persistés chiffrés en DB (`instance_config`),
et lus à la volée par Auth.js v5 en config dynamique (`NextAuth(async () => ...)`)
via l'endpoint interne `GET /internal/oauth-credentials` (cache mémoire
60 s côté dashboard). Voir ADR 0016.

### Redis

Indispensable pour :

- Scheduler de sanctions temporaires (via BullMQ).
- Cache des réponses d'API Discord.
- Rate limiting applicatif.
- Pub/sub entre bot et api.

Déploiement sans Redis accepté en mode dégradé (in-memory), avec scheduler
moins fiable, pour les petites instances.

### Pino

Logs structurés JSON. Rapide, écosystème mature. Exporté via stdout pour que
le système d'hébergement (Docker, systemd, etc.) gère la rotation.

### Biome

Lint + format en un seul outil. Plus rapide qu'ESLint + Prettier, une seule
config. Alternative : ESLint flat config + Prettier. Biome gagne sur la
simplicité.

### Vitest + Playwright

Vitest pour unit et intégration (rapide, API proche de Jest, TS natif).
Playwright pour E2E dashboard (cross-browser, bon DX, stable).

## Organisation du monorepo

```
.
├── apps/
│   ├── bot/                    # Processus bot
│   ├── api/                    # API Fastify
│   └── dashboard/              # Next.js
├── packages/
│   ├── core/                   # Noyau fonctionnel (pas de framework web ni de lib UI)
│   ├── ui/                     # Design system partagé (tokens, composants shadcn)
│   ├── db/                     # Schémas Drizzle, migrations, client
│   ├── contracts/              # Types partagés (events, manifests, API plugin)
│   └── config/                 # Configs TS, Biome, Vitest réutilisables
├── modules/
│   ├── moderation/
│   ├── welcome/
│   ├── roles/
│   ├── logs/
│   └── onboarding-presets/
├── docker/
├── docs/
└── scripts/
```

### Rôle de chaque package

- **core** : plugin loader, système d'événements, permissions, audit, config
  validation, scheduler. Aucune dépendance à Discord ou HTTP : le core doit
  être testable en isolation.
- **contracts** : interfaces, types, schémas Zod partagés entre core, modules,
  api et dashboard. Version stricte, compatibilité descendante attendue.
- **db** : schéma Drizzle, helpers de migration, client. Consommé par core et
  modules via des accesseurs contrôlés.
- **ui** : composants UI, tokens Tailwind, thème. Consommé uniquement par le
  dashboard. Les modules qui déclarent des pages dashboard utilisent ce
  package, pas leurs propres composants.

### Rôle de chaque app

- **bot** : initialise discord.js, charge le core, charge les modules, relie
  les événements Discord aux handlers du core, expose les commandes Discord.
- **api** : initialise Fastify, monte les routes déclarées par le core et par
  les modules, vérifie les sessions via Auth.js, publie / consomme des
  messages sur Redis pour invoquer le bot.
- **dashboard** : Next.js App Router. Pages statiques pour l'accueil, pages
  dynamiques côté serveur pour la config et l'audit. Chaque module contribue
  ses pages via une convention de découverte (voir `PLUGIN-API.md`).

## Flux de données

### Commande Discord

```
Discord -> bot (discord.js) -> core.events.dispatch(commandEvent)
  -> module.commandHandler(ctx)
    -> core.services (permissions, audit, db)
  -> reply via discord.js
```

### Action depuis le dashboard

```
dashboard -> api (Fastify) -> vérif session + permissions
  -> handler métier (dans core ou module)
    -> effet direct DB + publication événement Redis
  -> bot consomme événement -> effet Discord si nécessaire
```

### Onboarding

```
dashboard charge le wizard -> api.onboarding.start
  -> core.onboarding collecte questions depuis chaque module
    -> admin répond -> api.onboarding.submit
      -> core.onboarding applique les recommandations
        -> création de rôles / salons via bot
        -> écriture config via core.config
        -> activation modules via core.modules
```

## Modèle de données

Détails complets et justifications dans
[ADR 0001](./adr/0001-schema-db-core.md). Synthèse ci-dessous.

### Principes

- **Isolation par module.** Le core possède ses tables, chaque module possède
  les siennes, préfixées par l'id du module (`moderation_sanctions`,
  `welcome_messages`). Pas de table partagée entre modules. La communication
  inter-modules passe par events et queries, jamais par lecture directe de
  tables étrangères.
- **Enforcement runtime de l'isolation.** Le client Drizzle exposé via
  `ctx.db` à un module est scopé : il ne voit que les tables préfixées par
  son id. Toute tentative d'accès à une autre table lève une exception.
- **Postgres-first, SQLite en portage.** Les schémas sont conçus pour
  Postgres. Les incompatibilités sont traitées dans une couche
  d'abstraction de `packages/db`.

### Conventions

- Primary keys applicatives : ULID `VARCHAR(26)` (ordonné dans le temps,
  triable, pas d'information fuitée).
- IDs Discord (user, guild, channel, role) : `VARCHAR(20)` tels quels.
- Timestamps : `created_at` et `updated_at` en `TIMESTAMPTZ`, `updated_at`
  maintenu automatiquement.
- JSON : `JSONB` en Postgres, `TEXT` validé par Zod en SQLite.
- Foreign keys : nommées explicitement, `ON DELETE` et `ON UPDATE`
  explicites, pas de cascade par défaut.
- Index : nommés explicitement avec intention (`idx_audit_log_guild_created`).

### Tables du core

- **`guilds`** : registre des serveurs Discord où le bot est actif. Un seul
  enregistrement par serveur, soft-disable via `left_at`.
- **`guild_config`** : une ligne par serveur contenant un `JSONB`
  hiérarchique (`core.*`, `modules.<id>.*`). Versioning via un champ
  `version` pour les migrations de config.
- **`modules_registry`** : catalogue global des modules connus du core
  (installés, pas forcément activés). Une ligne par module, indépendant des
  serveurs.
- **`guild_modules`** : activation d'un module pour un serveur donné. La
  config vit dans `guild_config`, pas ici.
- **`permissions_registry`** : définitions des permissions applicatives
  déclarées par les modules. Global, peuplé au chargement.
- **`permission_bindings`** : mapping permission ↔ rôle Discord, par serveur.
  Modèle "rôle porte permissions", pas "user porte permissions".
- **`audit_log`** : journal unifié append-only. Indexes pour chronologie par
  guild, filtre par action, recherche par acteur ou cible. Purge par
  rétention via tâche planifiée, pas de mutation individuelle.
- **`scheduled_tasks`** : projection DB des tâches planifiées (BullMQ en
  Redis reste l'exécuteur). Unicité sur `job_key` déterministe pour
  idempotence.
- **`onboarding_sessions`** : sessions en cours ou terminées avec `answers`,
  `plan`, et `applied_actions` pour rollback. Expiration automatique des
  sessions abandonnées.
- **`ai_invocations`** : trace de chaque appel IA (provider, model, hash du
  prompt, coût estimé). Le prompt brut n'est pas stocké.
- **`keystore`** : secrets tiers chiffrés (AES-256-GCM, clé master en
  variable d'environnement). Accès via `ctx.keystore` uniquement.

### Tables de modules

Préfixées par l'id du module. Exemple pour `moderation` :

- `moderation_sanctions`
- `moderation_automod_rules`
- `moderation_strikes`

Migrations déclarées dans `modules/<id>/migrations/`, appliquées par le
core sous un lock global au chargement, versionnées par `schema_version`
dans `modules_registry`.

### Relations principales

Presque toutes les tables métier ont une FK vers `guilds.id` avec
`ON DELETE CASCADE` : si un serveur est supprimé (bot kick définitif,
purge manuelle), toutes les données associées partent avec. Les
exceptions sont `modules_registry` et `permissions_registry` qui sont
globales au projet.

## Modèle de permissions

Deux niveaux :

1. **Permissions Discord** (natives). Le bot les respecte scrupuleusement. Un
   admin Discord peut tout faire. Un membre sans permission `ManageGuild` ne
   voit pas le dashboard.
2. **Permissions applicatives**. Le core définit des permissions internes
   (ex : `moderation.ban`, `logs.read`, `config.write`). Les modules déclarent
   les permissions qu'ils requièrent. L'admin peut mapper ces permissions à
   des rôles Discord via le dashboard.

Toute action d'un module passe par une vérification `can(actor, permission,
target)` avant exécution. Le résultat est tracé dans l'audit.

## Audit log

Unifié, append-only, structuré. Schéma minimal :

- `id` (ulid)
- `guild_id`
- `actor` (user Discord ou `system` ou `module:<name>`)
- `action` (identifiant canonique)
- `target` (optionnel, utilisateur ou entité)
- `module` (module émetteur)
- `severity` (info / warn / error)
- `metadata` (JSON structuré)
- `created_at`

Lecture exposée via API avec filtres. Écriture uniquement via le service
`audit` du core. Aucun module ne peut écrire directement en DB dans cette
table.

## Sécurité

- Token Discord, clés API, URLs DB : uniquement via variables d'environnement
  ou fichier `.env.local` non versionné.
- Pas de secret dans les logs.
- Les webhooks externes exposés par des modules sont signés et vérifiés.
- Rate limiting applicatif sur toutes les routes API mutantes.
- CORS strict sur l'API : seule l'origine du dashboard configurée est acceptée.
- Session dashboard : cookie HttpOnly, SameSite=Lax, rotation régulière.

## Déploiement

Cible : `docker compose up`. Le compose de référence définit cinq services :
`bot`, `api`, `dashboard`, `postgres`, `redis`. Un volume pour Postgres,
configuration via `.env`.

Version dégradée : un seul processus combinant bot + api, SQLite en local,
pas de Redis. Documentée mais pas recommandée pour les serveurs actifs.

## Observabilité

### Logs

- Logs structurés JSON via Pino, niveau configurable par
  variable d'environnement.
- Champs stables : `guildId`, `module`, `userId`, `action`, `requestId`.
- Corrélation via un `requestId` propagé des requêtes API jusqu'aux actions
  Discord effectives.
- Log rotation et agrégation délégués à l'hébergeur (Docker, systemd,
  journald, Loki, etc.), pas gérés par l'application.

### Métriques

- Endpoint `/metrics` Prometheus optionnel (désactivé par défaut).
- Métriques exposées :
  - Latence et volume des commandes Discord par module et par type.
  - Latence et taux d'erreur des routes API.
  - Taille et âge des queues BullMQ.
  - Nombre de guilds actifs, nombre de modules chargés.
  - Compteur d'erreurs par catégorie.

### Traces

- OpenTelemetry en option, pas activé par défaut.
- Spans sur les chaînes importantes : commande Discord, requête API,
  tâche planifiée.
- Exporter OTLP configurable (Jaeger, Tempo, etc.).

### Health checks

- `/health` sur chaque app : réponse 200 si dépendances critiques
  accessibles (DB, Redis), 503 sinon.
- Distinction liveness (le process tourne) et readiness (le process est
  prêt à servir). Deux endpoints si nécessaire : `/health/live` et
  `/health/ready`.

## Rate limiting

### Discord

- Le client discord.js gère les limites internes imposées par l'API
  Discord. Ne pas contourner.
- Une couche applicative supplémentaire protège contre les abus internes
  (un module mal conçu qui enverrait des messages en boucle) : limite par
  module et par guild.
- Les modules appellent exclusivement `ctx.discord.*`, jamais les objets
  discord.js directement, pour garantir le passage par ces garde-fous.

### API

- Rate limiting par IP et par utilisateur authentifié sur toutes les
  routes mutantes.
- Limites plus strictes sur les routes sensibles (login, bulk actions).
- Implémentation via Redis (fenêtre glissante) ou mémoire en mode dégradé.
- Réponse 429 avec header `Retry-After` normalisé.

### Hooks sortants

- Modules qui appellent des APIs externes : passage par un client HTTP
  du core qui applique timeouts, retries avec backoff exponentiel et jitter,
  circuit breaker.

## Idempotence

Toute opération sensible est conçue pour être idempotente ou détectable en
doublon :

- Commandes Discord : identifiant unique d'interaction, rejet des rejeux.
- Tâches planifiées : signature (job id) déterministe basée sur les
  paramètres métier. BullMQ garantit l'unicité.
- Actions d'onboarding : chaque action a un id, l'applicateur saute les
  actions déjà appliquées en cas de rejeu.
- Webhooks entrants (V2+) : déduplication par identifiant d'événement.

## Migrations DB

### Stratégie

- Migrations versionnées, irréversibles en prod sauf cas exceptionnel
  documenté.
- Nommage : `NNNN_description-courte.sql` ou `.ts` selon le moteur Drizzle.
- Chaque PR qui modifie le schéma vient avec sa migration.
- Test d'application et de rollback (quand supporté) dans la CI : sur une
  base vide, sur une base seed de référence.
- Pas de migration qui combine schéma et données critiques sans plan de
  sauvegarde.

### Application

- Au démarrage du bot et de l'API, vérification de la version du schéma.
- Migration automatique en dev. En prod, migration explicite via
  `pnpm db:migrate` pour éviter les surprises de déploiement.
- Lock acquis pendant l'application pour éviter les migrations
  concurrentes (plusieurs replicas qui démarrent en même temps).

### Contrats modules

- Chaque module déclare la version de son schéma.
- Le core applique les migrations manquantes du module au chargement, sous
  le même lock.
- Si un module est désactivé, son schéma reste en place (pas de
  destruction de données à la légère). Suppression explicite via une
  commande CLI `pnpm db:drop-module <id>`.

## Backup et reprise sur incident

### Responsabilité

L'auto-hébergement implique que la sauvegarde est à la charge de
l'administrateur de l'instance. Le projet documente les commandes et
bonnes pratiques, mais ne fournit pas de service de sauvegarde automatique
intégré en V1.

### Documentation fournie

- Procédure de backup logique Postgres (`pg_dump`).
- Procédure de restore.
- Procédure de backup pour déploiement SQLite (copie atomique du fichier
  WAL-safe).
- Export de configuration applicative via une commande CLI
  (`pnpm export-config`).
- Recommandations de fréquence et de rétention.

### Reprise sur incident

- Scripts d'inspection de la santé de la base et des files BullMQ.
- Procédure documentée pour reprendre après un crash : vérifier les tâches
  en échec, rejouer les webhooks manqués si applicable, purger les locks
  résiduels.

## Données personnelles et RGPD

### Données collectées

Le bot stocke des données personnelles au sens du RGPD :

- Identifiants Discord (user id, guild id, role id) — pseudonymes selon le
  RGPD.
- Noms affichés (parfois).
- Historique de modération (sanctions, raisons, auteurs).
- Audit log des actions.
- Contenu de messages uniquement si un module le persiste explicitement
  (ex: logs de suppressions), avec rétention configurable.

### Bases légales

L'instance hébergée par un administrateur est un responsable de
traitement. Le projet fournit les outils pour qu'il se mette en
conformité :

- Documentation des données collectées et de leur finalité.
- Durées de rétention configurables.
- Droit d'accès : export des données d'un utilisateur via commande
  admin ou CLI.
- Droit à l'effacement : commande pour purger les données d'un utilisateur
  donné, avec conservation éventuelle de références anonymisées si
  obligations légales ou intégrité de l'audit (agrégats, pas de contenu).

### Principes techniques

- Chiffrement au repos des secrets tiers (keystore chiffré côté core).
- Pas de transit non chiffré entre composants (TLS côté API et dashboard).
- Minimisation : les modules ne stockent que ce qu'ils exploitent
  réellement.
- Pas d'export ou de phone home sans consentement explicite.

## Feature flags et rollouts

- Pas de système de feature flags complexe en V1 (évite la complexité).
- Fonctions expérimentales derrière un paramètre de config par guild
  (`experimental.xxx`) clairement documenté comme instable.
- Les features retirées passent par une phase `deprecated` documentée avant
  suppression au cycle majeur suivant.

## Résilience

- Dépendances externes (Discord, fournisseur LLM) : timeouts configurables,
  retries avec backoff exponentiel et jitter.
- Dégradation gracieuse : si une dépendance non critique échoue, le bot
  continue de fonctionner sur les autres capacités et signale l'incident
  dans l'audit log plutôt que de crasher.
- Dépendances critiques (DB, Redis) : retry court au démarrage, échec
  explicite si toujours indisponible après le délai.
- Signal d'arrêt (SIGTERM) : drainage propre — refus de nouvelles
  connexions, fin des requêtes en cours, déconnexion du gateway Discord,
  fermeture des pools DB.

## Compromis et points de vigilance

- **Redis comme single point of failure** pour les tâches planifiées. En cas
  de panne Redis, les sanctions temporaires n'expirent plus automatiquement.
  À documenter clairement côté exploitation.
- **Modules chargés dans le même processus que le core**. Pas d'isolation
  mémoire forte : un module buggé peut faire crasher le bot. Alternative
  (processus séparés via worker_threads ou IPC) reportée post-V1.
- **Next.js sur le dashboard** ajoute une surface de dépendances importante.
  Acceptable pour la qualité du résultat, à surveiller.
- **Discord.js version majeure** : planifier les montées de version, ne pas
  fourrer un lock trop strict. Une rupture de contrat côté Discord API est
  toujours possible.
