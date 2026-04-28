-- Jalon 7 PR 7.1 — table singleton `instance_config` (variante SQLite).
-- Miroir de la migration PG du même tag. Voir doc dans
-- `../pg/0002_instance_config.sql`.

CREATE TABLE `instance_config` (
	`id` text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	`discord_app_id` text,
	`discord_public_key` text,
	`discord_bot_token_ciphertext` blob,
	`discord_bot_token_iv` blob,
	`discord_bot_token_auth_tag` blob,
	`discord_client_secret_ciphertext` blob,
	`discord_client_secret_iv` blob,
	`discord_client_secret_auth_tag` blob,
	`bot_name` text,
	`bot_avatar_url` text,
	`bot_description` text,
	`setup_step` integer DEFAULT 1 NOT NULL,
	`setup_completed_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	CONSTRAINT `instance_config_singleton_check` CHECK (`id` = 'singleton')
);
