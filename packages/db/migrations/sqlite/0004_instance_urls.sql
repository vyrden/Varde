-- Jalon 7 PR 7.2 — colonnes `base_url` + `additional_urls`
-- (variante SQLite). Voir doc dans `../pg/0004_instance_urls.sql`.

ALTER TABLE `instance_config` ADD `base_url` text;
--> statement-breakpoint
ALTER TABLE `instance_config` ADD `additional_urls` text NOT NULL DEFAULT '[]';
