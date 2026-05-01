-- Jalon 7 PR 7.4.0 — préférences utilisateur (global + par guild).
--
-- Deux tables introduites par la refonte expérience serveur :
--
-- `user_preferences` : préférences globales d'un utilisateur Discord
--   sur l'instance Varde. Clé = `user_id` (snowflake Discord). Une
--   seule ligne par user. `theme` ∈ {'system','light','dark'},
--   `locale` ∈ {'fr','en'} en V1 mais le CHECK reste ouvert pour
--   accepter d'autres valeurs sans migration.
--
-- `user_guild_preferences` : préférences spécifiques au couple
--   (user, guild). Clé composite. `pinned_modules` est un JSONB de
--   `{moduleId, position}` (max 8 entrées, validation côté service
--   `userPreferencesService`). `position` est un entier 0-based qui
--   définit l'ordre d'affichage dans la sidebar.
--
-- Pas de FK vers une table `users` (les users vivent sur Discord, pas
-- en DB). FK vers `guilds` avec cascade : si une guild disparaît, ses
-- préférences user-scopées partent aussi. La table globale survit.

CREATE TABLE "user_preferences" (
	"user_id" varchar(20) PRIMARY KEY NOT NULL,
	"theme" text NOT NULL DEFAULT 'system',
	"locale" text NOT NULL DEFAULT 'fr',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_theme_check"
		CHECK ("theme" IN ('system', 'light', 'dark'))
);
--> statement-breakpoint
CREATE TABLE "user_guild_preferences" (
	"user_id" varchar(20) NOT NULL,
	"guild_id" varchar(20) NOT NULL REFERENCES "guilds"("id") ON DELETE CASCADE,
	"pinned_modules" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	PRIMARY KEY ("user_id", "guild_id")
);
