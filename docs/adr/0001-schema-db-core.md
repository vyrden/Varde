# 0001. Schéma DB du core et conventions de persistance

Date: 2026-04-20
Statut: accepted

## Contexte

Le projet doit poser un schéma de base de données qui serve de fondation
pour toutes les fonctionnalités du core et permette aux modules (officiels
et tiers) de coexister sans interférer. Les contraintes posées avant
rédaction de cet ADR :

- Le core est minimal mais doit stocker : serveurs enregistrés, config,
  registre des modules, activations, permissions applicatives, audit,
  tâches planifiées, sessions d'onboarding, traces IA, keystore chiffré.
- Les modules doivent pouvoir déclarer leurs propres tables sans entrer en
  conflit avec le core ni entre eux.
- Les communications inter-modules passent par events et queries, pas par
  lecture directe de tables étrangères.
- Cible principale : PostgreSQL. Cible secondaire : SQLite pour les petits
  déploiements auto-hébergés.
- L'ORM retenu est Drizzle.
- Les identifiants Discord (user, guild, channel, role) sont des strings
  numériques pouvant dépasser 2^53 : stockage en `VARCHAR`.

## Décision

### Conventions générales

- **Primary keys applicatives** : ULID stringifié (`VARCHAR(26)`). Ordonné
  dans le temps, triable naturellement, pas d'information fuitée, pas de
  collision à l'échelle du projet.
- **IDs Discord** : `VARCHAR(20)` tels qu'ils viennent de l'API Discord,
  jamais castés en nombre.
- **Timestamps** : `TIMESTAMPTZ` systématiquement. `created_at` et
  `updated_at` par défaut sur les tables non append-only. `updated_at`
  maintenu automatiquement.
- **JSON** : `JSONB` en Postgres, `TEXT` validé par Zod côté application en
  SQLite.
- **Foreign keys** : toujours nommées explicitement, comportements
  `ON DELETE` et `ON UPDATE` explicites, pas de cascade par défaut.
- **Index** : nommés avec préfixe `idx_` et intention (`idx_audit_log_guild_created`,
  pas `audit_log_idx1`).
- **Soft delete** : non utilisé par défaut. Si un domaine en a besoin
  (ex: historique de sanctions), il gère sa propre colonne.

### Isolation des modules

- Les tables d'un module sont préfixées par son id
  (`moderation_sanctions`, `welcome_messages`).
- Le client Drizzle exposé via `ctx.db` à un module est scopé : il ne voit
  que les tables préfixées par l'id du module. Une tentative d'accès à
  une autre table lève une exception.
- L'isolation est conventionnelle au niveau SQL (Postgres ne gère pas de
  cloisonnement par rôle pour ce cas sans complexité excessive) mais
  enforced au niveau API du core.

### Tables du core

#### `guilds`

Registre des serveurs Discord où le bot est actif.

Colonnes principales : `id` (PK, ID Discord), `name`, `joined_at`,
`left_at` (nullable, set si kick), `locale`, timestamps.

Index : `idx_guilds_left_at` pour filtrer les actifs.

#### `guild_config`

Une ligne par serveur. Structure JSON hiérarchique :

```json
{
  "core": { "locale": "fr", "audit_retention_days": 90 },
  "modules": {
    "moderation": { /* config du module */ },
    "welcome": { /* config du module */ }
  }
}
```

Colonnes : `guild_id` (PK, FK vers `guilds.id` ON DELETE CASCADE),
`config` (JSONB), `version` (pour migrations de config), `updated_at`,
`updated_by`.

Centraliser toute la config en une ligne par serveur évite la
désynchronisation et rend les snapshots atomiques.

#### `modules_registry`

Catalogue global des modules connus du core. Pas par serveur : un module
est soit installé sur l'instance, soit non.

Colonnes : `id` (PK, ex: `moderation` ou `author/custom-ticketing`),
`version`, `manifest` (JSONB, snapshot du manifeste complet),
`schema_version` (pour savoir où en sont les migrations DB du module),
`loaded_at`.

Index : `idx_modules_schema_version`.

#### `guild_modules`

Activation d'un module pour un serveur donné.

Colonnes : `guild_id` (FK CASCADE), `module_id` (FK RESTRICT : on ne
supprime pas un module du registry s'il est activé quelque part),
`enabled`, `enabled_at`, `enabled_by`, `disabled_at`.

Primary key composite (`guild_id`, `module_id`). La config ne vit pas ici
mais dans `guild_config`.

#### `permissions_registry`

Définitions des permissions applicatives déclarées par les modules.
Global, peuplé au chargement.

Colonnes : `id` (PK, ex: `moderation.ban`), `module_id` (FK CASCADE),
`description`, `category`, `default_level`
(`admin` | `moderator` | `member` | `nobody`), `created_at`.

Index : `idx_permissions_module`.

#### `permission_bindings`

Mapping permission ↔ rôle Discord, par serveur.

Colonnes : `guild_id` (FK CASCADE), `permission_id` (FK CASCADE),
`role_id` (ID Discord), `granted_by`, `created_at`. Primary key composite.

Index secondaire `idx_bindings_role` pour le chemin "quelles permissions
ce rôle porte-t-il".

Modèle "rôle porte permissions", pas "user porte permissions" : plus
simple à synchroniser avec Discord, performant à l'échelle, compatible
avec les rôles dynamiques. Les cas spéciaux (owner, Administrator Discord
natif) sont traités par le core sans être stockés.

#### `audit_log`

Journal unifié, append-only, de toutes les actions significatives.

Colonnes : `id` (ULID), `guild_id` (FK CASCADE), `actor_type`
(`user` | `system` | `module`), `actor_id`, `action` (canonique
`module.action.subject`), `target_type`, `target_id`, `module_id`
(FK SET NULL), `severity` (`info` | `warn` | `error`), `metadata` (JSONB),
`created_at`.

Index :

- `idx_audit_guild_created` pour la chronologie par serveur.
- `idx_audit_action` pour filtrer par type d'action.
- `idx_audit_actor` pour l'historique d'un acteur.
- `idx_audit_target` pour l'historique d'une cible.

Append-only strict : aucune mutation, aucune suppression individuelle. La
seule opération d'effacement est la purge par rétention, via une tâche
planifiée, qui supprime les lignes plus anciennes que la rétention
configurée par serveur.

#### `scheduled_tasks`

Projection DB des tâches planifiées. BullMQ (Redis) reste l'exécuteur
principal, mais on en garde une vue DB pour la reprise et l'inspection.

Colonnes : `id` (ULID), `job_key` (UNIQUE, déterministe), `module_id`
(FK CASCADE), `guild_id` (FK CASCADE), `kind`
(`one_shot` | `recurring`), `payload` (JSONB), `run_at`, `status`,
`attempt_count`, `last_error`, timestamps.

La clé `job_key` est déterministe (ex: `moderation:unban:<sanction_id>`)
et UNIQUE, ce qui garantit l'idempotence des reprogrammations.

Index : `idx_tasks_run_at` sur `(status, run_at)` pour la requête
d'exécution.

#### `onboarding_sessions`

Sessions d'onboarding en cours ou terminées.

Colonnes : `id` (ULID), `guild_id` (FK CASCADE), `started_by`, `status`
(`in_progress` | `completed` | `aborted` | `rolled_back`), `mode`
(`fresh` | `existing` | `replay`), `answers` (JSONB), `plan` (JSONB,
nullable), `applied_actions` (JSONB, liste pour rollback), `started_at`,
`completed_at`, `expires_at`.

Index : `idx_onboarding_guild_status`, et un index partiel Postgres
`idx_onboarding_expires (expires_at) WHERE status = 'in_progress'` pour
le nettoyage des sessions abandonnées. Portage SQLite : index complet.

Les sessions `in_progress` plus anciennes que 7 jours sont nettoyées.

#### `ai_invocations`

Trace de chaque invocation IA. Séparée de l'audit log standard pour
faciliter analyse et reporting de coûts.

Colonnes : `id` (ULID), `guild_id` (FK CASCADE), `module_id` (FK SET NULL),
`purpose` (ex: `onboarding.generate_plan`), `provider`, `model`,
`prompt_hash` (SHA-256), `input_tokens`, `output_tokens`, `cost_estimate`
(NUMERIC), `success`, `error`, `created_at`.

Le prompt brut n'est pas stocké : seul un hash pour déduplication et
corrélation. Contenu sensible hors DB.

Index : `idx_ai_guild_created`.

#### `keystore`

Secrets tiers que les modules persistent, chiffrés au repos.

Colonnes : `guild_id` (FK CASCADE), `module_id` (FK CASCADE), `key`,
`ciphertext` (BYTEA), `iv` (BYTEA), `auth_tag` (BYTEA), timestamps.
Primary key composite (`guild_id`, `module_id`, `key`).

Chiffrement AES-256-GCM. Clé master dans `KEYSTORE_MASTER_KEY`
(variable d'environnement, rotation documentée). Accès via
`ctx.keystore` uniquement.

### Relations globales

Presque toutes les tables métier ont `guild_id` avec `ON DELETE CASCADE`.
La suppression d'un serveur de `guilds` provoque le cleanup complet des
données associées. Les deux exceptions sont `modules_registry` et
`permissions_registry`, globales au projet.

## Alternatives considérées

### Config par module dans `guild_modules`

Plutôt que de centraliser tout dans `guild_config`, on aurait pu mettre
la config spécifique du module dans sa ligne `guild_modules`.

Rejeté : impossible de faire un snapshot atomique cohérent de la config
d'un serveur, duplication des mécanismes de validation et migration,
complique l'export/import de configuration.

### Isolation DB forte (schémas Postgres par module)

Un schéma Postgres par module, avec un rôle SQL distinct par module.

Rejeté pour la V1 : complique énormément les migrations, les requêtes
inter-modules, la portabilité SQLite. L'isolation au niveau API Drizzle
couvre 99 % des cas et est auditable en revue de code.

### Audit log par module

Chaque module gère son propre journal.

Rejeté : perte de la vue unifiée, difficultés pour l'admin, impossibilité
de faire des requêtes transverses. Contraire au principe "citoyen de
première classe" de l'audit.

### Table `users` côté bot

Dupliquer localement les users Discord vus par le bot.

Rejeté : les données utilisateur sont celles de Discord, pas du projet. On
ne garde que les références (ID) et ce qu'on a ajouté (sanctions,
permissions bindings). Pas de copie locale qui se désynchronise.

### Prisma au lieu de Drizzle

ORM plus mature côté DX.

Rejeté dans l'ADR précédent (stack) : proximité SQL de Drizzle plus
adaptée à un projet avec plugins qui déclarent leurs schémas, build plus
léger, typage explicite.

## Conséquences

### Positives

- Les modules ont un bac à sable clair : préfixe de table, `ctx.db`
  scopé, migrations déclarées en local.
- L'audit unifié permet des vues et analyses transverses sans effort.
- La config centralisée en JSON permet export/import atomique et
  snapshots cohérents.
- Les ULID rendent les IDs triables et non devinables sans coût
  supplémentaire.
- Les cascades ON DELETE sur `guild_id` garantissent un cleanup trivial
  lors du retrait d'un serveur.

### Négatives / points de vigilance

- Le JSON `config` de `guild_config` peut devenir gros si beaucoup de
  modules actifs. Impact perf à surveiller, mais l'ordre de grandeur
  attendu (quelques KB par serveur) rend ça négligeable.
- Le scope du client Drizzle nécessite une implémentation custom (proxy
  ou wrapper) à prototyper en début de projet pour valider ergonomie et
  coût.
- L'index partiel sur `onboarding_sessions` est Postgres-only : divergence
  de schéma à gérer dans `packages/db` pour SQLite.
- La rétention d'audit par purge planifiée impose une tâche fiable.
  Dégradation gracieuse si Redis tombe : l'audit continue à s'écrire, la
  purge prend du retard, non critique.
- La table `ai_invocations` va grossir vite si l'IA est très utilisée :
  rétention configurable à prévoir.

### Implications pour les modules

- Tout module doit préfixer ses tables.
- Tout module doit déclarer son `schema_version` et ses migrations dans
  un dossier dédié.
- Tout module doit passer par `ctx.db`, `ctx.config`, `ctx.audit`,
  `ctx.keystore` pour les opérations de persistance. Import direct du
  client Drizzle global interdit.

## Références

- [ADR 0002 - Format des modules](./0002-format-modules.md)
- Section "Modèle de données" dans
  [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md).
- Documentation Drizzle ORM : https://orm.drizzle.team
- Spécification ULID : https://github.com/ulid/spec
