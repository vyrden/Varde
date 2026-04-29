-- Jalon 7 PR 7.3 — table `guild_permissions`
-- (variante SQLite). Voir doc dans `../pg/0006_guild_permissions.sql`.

CREATE TABLE `guild_permissions` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`admin_role_ids` text NOT NULL DEFAULT '[]',
	`moderator_role_ids` text NOT NULL DEFAULT '[]',
	`created_at` text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`id`) ON DELETE CASCADE
);
