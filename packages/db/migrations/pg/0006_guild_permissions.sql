-- Jalon 7 PR 7.3 — table `guild_permissions`.
--
-- Mappage rôle Discord → niveau de permission (admin / moderator)
-- pour le dashboard. Une ligne par guild ; les listes de role IDs
-- sont stockées en JSONB pour pouvoir évoluer (ajout de niveaux
-- futurs sans migration de schéma).
--
-- `admin_role_ids` : rôles Discord dont les porteurs ont accès
--   complet au dashboard de la guild. Liste non-vide invariant
--   (validation côté service `guildPermissionsService`).
-- `moderator_role_ids` : rôles Discord avec accès limité aux
--   modules tagués `requiredPermission: 'moderator'` (ex.
--   modération, anti-spam).
--
-- Pas de FK vers les rôles Discord (rôles externes au système),
-- juste le `guild_id` qui pointe sur `guilds` avec cascade.

CREATE TABLE "guild_permissions" (
	"guild_id" varchar(20) PRIMARY KEY NOT NULL REFERENCES "guilds"("id") ON DELETE CASCADE,
	"admin_role_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"moderator_role_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
