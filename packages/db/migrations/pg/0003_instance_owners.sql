-- Jalon 7 PR 7.2 — table `instance_owners`.
--
-- Liste des utilisateurs Discord autorisés à accéder à `/admin/*`
-- côté dashboard et `/api/admin/*` côté API. Le premier user qui
-- se connecte après que `instance_config.setup_completed_at` est
-- posé devient automatiquement owner via `claimFirstOwnership()`
-- (hook Auth.js). Les suivants doivent être ajoutés explicitement
-- par un owner existant.
--
-- Pas de FK vers une table `users` — l'instance n'enregistre pas
-- les utilisateurs Discord en local (ADR 0006). `discord_user_id`
-- est l'ID Discord brut tel que reçu via OAuth.

CREATE TABLE "instance_owners" (
	"discord_user_id" varchar(20) PRIMARY KEY NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by_discord_user_id" varchar(20)
);
