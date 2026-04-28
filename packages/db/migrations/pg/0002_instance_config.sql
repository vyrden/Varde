-- Jalon 7 PR 7.1 — table singleton `instance_config`.
--
-- Stocke la configuration globale de l'instance Varde : credentials
-- Discord (token bot, OAuth client secret) chiffrés AES-256-GCM via
-- la master key du keystore, identité du bot, avancement du wizard
-- de setup. Une seule ligne autorisée par CHECK (`id = 'singleton'`).
--
-- Pré-V1 : tant que l'admin n'a pas terminé le wizard, le bot ne se
-- connecte pas au gateway Discord (cf. `apps/server/src/bin.ts` qui
-- lit `setup_completed_at` au boot).

CREATE TABLE "instance_config" (
	"id" varchar(16) PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"discord_app_id" varchar(20),
	"discord_public_key" text,
	"discord_bot_token_ciphertext" "bytea",
	"discord_bot_token_iv" "bytea",
	"discord_bot_token_auth_tag" "bytea",
	"discord_client_secret_ciphertext" "bytea",
	"discord_client_secret_iv" "bytea",
	"discord_client_secret_auth_tag" "bytea",
	"bot_name" text,
	"bot_avatar_url" text,
	"bot_description" text,
	"setup_step" integer DEFAULT 1 NOT NULL,
	"setup_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instance_config_singleton_check" CHECK ("id" = 'singleton')
);
