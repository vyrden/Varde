# 0015. Permissions extensibles via niveaux déclarés par les modules

Date: 2026-04-30
Statut: accepted

## Contexte

Avant le jalon 7 PR 7.3, l'accès au dashboard d'un serveur Discord
était filtré par un check binaire :
`requireGuildAdmin` exigeait la permission Discord `MANAGE_GUILD`.
Toute personne qui satisfaisait ce check accédait à **tout** le
dashboard du serveur — il n'y avait aucun moyen de donner un accès
limité à un modérateur (par exemple, voir uniquement la
configuration de l'automod sans pouvoir toucher aux credentials du
bot ou aux permissions applicatives).

Trois familles de solutions ont été envisagées :

1. **Statu quo** : laisser MANAGE_GUILD comme seul gate. Refusé —
   ne couvre pas le cas usage commun « confier la modération à
   quelqu'un sans lui donner les clés du serveur ».

2. **Rôles applicatifs codés en dur** : un set fixe (`admin`,
   `moderator`, `viewer`) avec règles de routage hardcodées. Refusé
   — un module tiers ne peut pas exprimer son propre besoin sans
   modifier le core.

3. **Niveaux extensibles déclarés par les modules** (option retenue) :
   un module déclare le niveau requis pour qu'un user voie son
   interface dashboard ; l'admin du serveur mappe les rôles Discord
   → niveau (`adminRoleIds`, `moderatorRoleIds`).

## Décision

On retient l'option 3.

### Contrat module

`ModuleDefinition` gagne un champ optionnel
`requiredPermission?: PermissionLevel`, où
`PermissionLevel = 'admin' | 'moderator'`. Default implicite :
`'admin'` — principe de moindre privilège côté contrat. Documenté
dans [`docs/PLUGIN-API.md`](../PLUGIN-API.md).

Modules officiels V1 :

- `moderation` → `'moderator'` (un mod a besoin d'accéder à
  l'automod sans toucher aux credentials).
- `logs`, `welcome`, `reaction-roles` → défaut `'admin'` (config
  bot-wide qui ne devrait pas être touchée par un mod).

### Stockage

Nouvelle table `guild_permissions` (PK `guild_id`, JSONB
`admin_role_ids` + `moderator_role_ids` + timestamps). Format
JSON pour pouvoir évoluer (ajout d'un futur niveau `helper`,
`reviewer`…) sans migration de schéma.

### Service

`guildPermissionsService` (`packages/core/src/guild-permissions.ts`)
expose : `getConfig`, `updateConfig`, `getUserLevel`,
`canAccessModule`, `cleanupDeletedRole`. Trois propriétés
structurantes :

- **Migration transparente** : à la première lecture sans config
  persistée, `getConfig` génère et persiste le défaut (rôles avec
  permission Discord `Administrator`). Pas d'intervention admin.
- **Owner Discord = filet de sécurité** : `getUserLevel` retourne
  toujours `'admin'` pour le propriétaire de la guild,
  indépendamment de la config. Empêche un lock-out auto-infligé.
- **Cache LRU 60 s + invalidation par events Discord**
  (`GUILD_ROLE_DELETE`, `GUILD_ROLE_UPDATE`, `GUILD_MEMBER_UPDATE`)
  câblée par `attachGuildPermissionsListeners` côté `apps/bot`.

### Middleware API

`requireGuildAccess(level)` remplace `requireGuildAdmin` pour les
nouvelles routes. Le legacy `requireGuildAdmin` reste utilisable
en transition (les routes mutantes existantes seront migrées par
vagues — cf. la note de fin).

Codes HTTP : 401 sans session, **404** (pas 403) si pas de niveau
d'accès — par symétrie avec `requireOwner` côté admin instance,
on ne révèle pas l'existence du serveur à un user non autorisé.

### Routes

- `GET /api/guilds` filtre par `getUserLevel !== null` (au lieu
  de MANAGE_GUILD).
- `GET /api/guilds/:id/modules` filtre par niveau du user et par
  `requiredPermission` du module.
- `GET /api/guilds/:id/me` retourne le niveau du user (consommé
  par le layout dashboard pour la sidebar conditionnelle).
- `GET /api/guilds/:id/permissions` (admin) retourne config + rôles
  enrichis.
- `PUT /api/guilds/:id/permissions` (admin) persiste avec audit.
- `POST /api/guilds/:id/permissions/preview` (admin) compute qui
  aurait accès, sans persister.

### UI

Page `/guilds/:id/permissions` avec composant `RoleMultiSelect`
(tri par hiérarchie, recherche, pastille couleur, memberCount).
Sidebar masque la section « Paramètres » pour les modérateurs.

## Conséquences

- **Onboarding inchangé** pour un serveur existant : le défaut
  généré reproduit l'ancien comportement (rôles avec
  `Administrator` ⇒ admin du dashboard). Aucun admin n'est verrouillé
  dehors par la migration.
- **Modules tiers** peuvent désormais déclarer leur niveau requis
  sans modifier le core. La surface d'API est étendue de manière
  rétro-compatible (champ optionnel).
- **Audit instance scoped étendu** avec trois nouveaux events
  guild-scoped : `permissions.updated`,
  `permissions.role.auto_removed`, `permissions.fallback_applied`.
  Tracés dans le journal `audit_log` existant.
- **Sécurité défensive** : `404 not_found` au lieu de `403
  forbidden` pour les refus d'accès, alignant la politique avec
  `requireOwner` (jalon 7 PR 7.2).
- **Lock-out impossible** par construction : (a) le propriétaire
  Discord garde toujours admin, (b) `cleanupDeletedRole` regénère
  le défaut quand la liste admin devient vide, (c) `updateConfig`
  refuse une liste admin vide avec `422 invalid_permissions`.
- **Migration progressive des routes** : `requireGuildAdmin` reste
  fonctionnel pour les routes mutantes non encore migrées
  (settings/permissions, audit, modules toggles, etc.). La
  migration en bulk est laissée à un follow-up dédié — la
  sécurité reste intacte (MANAGE_GUILD impose déjà un check
  Discord), mais la granularité fine du nouveau modèle ne
  s'applique pas tant que la route n'est pas migrée.

## Références

- Spec produit : `docs/Jalon 7/PR3-permissions.md`
- Service core : `packages/core/src/guild-permissions.ts`
- Middleware : `apps/api/src/middleware/require-guild-access.ts`
- Schéma DB : `packages/db/src/schema/{pg,sqlite}.ts`
  (`guildPermissions`)
- Listeners Discord : `apps/bot/src/guild-permissions-listeners.ts`
