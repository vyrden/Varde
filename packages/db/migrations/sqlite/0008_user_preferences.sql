-- Jalon 7 PR 7.4.0 — préférences utilisateur (variante SQLite).
-- Voir doc dans `../pg/0008_user_preferences.sql`.

CREATE TABLE `user_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`theme` text NOT NULL DEFAULT 'system',
	`locale` text NOT NULL DEFAULT 'fr',
	`created_at` text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	CONSTRAINT `user_preferences_theme_check`
		CHECK (`theme` IN ('system', 'light', 'dark'))
);
--> statement-breakpoint
CREATE TABLE `user_guild_preferences` (
	`user_id` text NOT NULL,
	`guild_id` text NOT NULL,
	`pinned_modules` text NOT NULL DEFAULT '[]',
	`created_at` text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	PRIMARY KEY (`user_id`, `guild_id`),
	FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`id`) ON DELETE CASCADE
);
