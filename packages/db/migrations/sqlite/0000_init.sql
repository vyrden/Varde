CREATE TABLE `ai_invocations` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`module_id` text,
	`purpose` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`prompt_hash` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cost_estimate` text DEFAULT '0' NOT NULL,
	`success` integer NOT NULL,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`module_id`) REFERENCES `modules_registry`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_ai_guild_created` ON `ai_invocations` (`guild_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`module_id` text,
	`severity` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`module_id`) REFERENCES `modules_registry`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "audit_actor_type_check" CHECK(actor_type IN ('user', 'system', 'module')),
	CONSTRAINT "audit_target_type_check" CHECK(target_type IS NULL OR target_type IN ('user', 'channel', 'role', 'message')),
	CONSTRAINT "audit_severity_check" CHECK(severity IN ('info', 'warn', 'error'))
);
--> statement-breakpoint
CREATE INDEX `idx_audit_guild_created` ON `audit_log` (`guild_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_action` ON `audit_log` (`action`);--> statement-breakpoint
CREATE INDEX `idx_audit_actor` ON `audit_log` (`actor_type`,`actor_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_target` ON `audit_log` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `guild_config` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `guild_modules` (
	`guild_id` text NOT NULL,
	`module_id` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`enabled_at` text,
	`enabled_by` text,
	`disabled_at` text,
	PRIMARY KEY(`guild_id`, `module_id`),
	FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`module_id`) REFERENCES `modules_registry`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `guilds` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`joined_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`left_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_guilds_left_at` ON `guilds` (`left_at`);--> statement-breakpoint
CREATE TABLE `keystore` (
	`guild_id` text NOT NULL,
	`module_id` text NOT NULL,
	`key` text NOT NULL,
	`ciphertext` blob NOT NULL,
	`iv` blob NOT NULL,
	`auth_tag` blob NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`guild_id`, `module_id`, `key`),
	FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`module_id`) REFERENCES `modules_registry`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `modules_registry` (
	`id` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`manifest` text NOT NULL,
	`schema_version` integer NOT NULL,
	`loaded_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_modules_schema_version` ON `modules_registry` (`schema_version`);--> statement-breakpoint
CREATE TABLE `onboarding_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`started_by` text NOT NULL,
	`status` text NOT NULL,
	`mode` text NOT NULL,
	`answers` text DEFAULT '{}' NOT NULL,
	`plan` text,
	`applied_actions` text DEFAULT '[]' NOT NULL,
	`started_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`completed_at` text,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "onboarding_status_check" CHECK(status IN ('in_progress', 'completed', 'aborted', 'rolled_back')),
	CONSTRAINT "onboarding_mode_check" CHECK(mode IN ('fresh', 'existing', 'replay'))
);
--> statement-breakpoint
CREATE INDEX `idx_onboarding_guild_status` ON `onboarding_sessions` (`guild_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_onboarding_expires` ON `onboarding_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `permission_bindings` (
	`guild_id` text NOT NULL,
	`permission_id` text NOT NULL,
	`role_id` text NOT NULL,
	`granted_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`guild_id`, `permission_id`, `role_id`),
	FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`permission_id`) REFERENCES `permissions_registry`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_bindings_role` ON `permission_bindings` (`role_id`);--> statement-breakpoint
CREATE TABLE `permissions_registry` (
	`id` text PRIMARY KEY NOT NULL,
	`module_id` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`default_level` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`module_id`) REFERENCES `modules_registry`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "permissions_default_level_check" CHECK(default_level IN ('admin', 'moderator', 'member', 'nobody'))
);
--> statement-breakpoint
CREATE INDEX `idx_permissions_module` ON `permissions_registry` (`module_id`);--> statement-breakpoint
CREATE TABLE `scheduled_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`job_key` text NOT NULL,
	`module_id` text NOT NULL,
	`guild_id` text,
	`kind` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`run_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`module_id`) REFERENCES `modules_registry`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "tasks_kind_check" CHECK(kind IN ('one_shot', 'recurring')),
	CONSTRAINT "tasks_status_check" CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tasks_job_key` ON `scheduled_tasks` (`job_key`);--> statement-breakpoint
CREATE INDEX `idx_tasks_run_at` ON `scheduled_tasks` (`status`,`run_at`);