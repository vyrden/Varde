-- Jalon 7 PR 7.2 — table `instance_owners` (variante SQLite).
-- Miroir de la migration PG du même tag. Voir doc dans
-- `../pg/0003_instance_owners.sql`.

CREATE TABLE `instance_owners` (
	`discord_user_id` text PRIMARY KEY NOT NULL,
	`granted_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`granted_by_discord_user_id` text
);
