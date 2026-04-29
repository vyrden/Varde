-- Jalon 7 PR 7.2 follow-up — table `instance_audit_log`
-- (variante SQLite). Voir doc dans `../pg/0005_instance_audit_log.sql`.

CREATE TABLE `instance_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`severity` text NOT NULL,
	`metadata` text NOT NULL DEFAULT '{}',
	`created_at` text NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `idx_instance_audit_action_created` ON `instance_audit_log` (`action`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_instance_audit_actor` ON `instance_audit_log` (`actor_id`);
