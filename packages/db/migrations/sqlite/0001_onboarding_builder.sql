-- Jalon 3 PR 3.1 — onboarding builder model (ADR 0007).
-- Mirroir SQLite de `migrations/pg/0001_onboarding_builder.sql`.
-- Le partial unique index PG est émulé par service-level check
-- côté applicatif (SQLite 3.8+ supporte partial index mais on reste
-- portable sur des distros anciennes via check applicatif).

DROP TABLE IF EXISTS `onboarding_sessions`;
--> statement-breakpoint
CREATE TABLE `onboarding_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`started_by` text NOT NULL,
	`status` text NOT NULL,
	`preset_source` text NOT NULL,
	`preset_id` text,
	`ai_invocation_id` text,
	`draft` text DEFAULT '{}' NOT NULL,
	`started_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`applied_at` text,
	`expires_at` text,
	FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "onboarding_status_check" CHECK (status IN ('draft', 'previewing', 'applying', 'applied', 'rolled_back', 'expired', 'failed')),
	CONSTRAINT "onboarding_preset_source_check" CHECK (preset_source IN ('blank', 'preset', 'ai'))
);
--> statement-breakpoint
CREATE INDEX `idx_onboarding_guild_status` ON `onboarding_sessions` (`guild_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_onboarding_expires` ON `onboarding_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `onboarding_actions_log` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`action_type` text NOT NULL,
	`action_payload` text NOT NULL,
	`status` text NOT NULL,
	`external_id` text,
	`result` text,
	`error` text,
	`applied_at` text,
	`undone_at` text,
	FOREIGN KEY (`session_id`) REFERENCES `onboarding_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "onboarding_action_status_check" CHECK (status IN ('pending', 'applied', 'undone', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_onboarding_actions_session_sequence` ON `onboarding_actions_log` (`session_id`,`sequence`);--> statement-breakpoint
ALTER TABLE `ai_invocations` ADD COLUMN `actor_id` text;--> statement-breakpoint
ALTER TABLE `ai_invocations` ADD COLUMN `prompt_version` text DEFAULT 'v1' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_ai_actor_purpose_created` ON `ai_invocations` (`actor_id`,`purpose`,`created_at`);
