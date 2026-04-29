-- Jalon 7 PR 7.2 follow-up — table `instance_audit_log`.
--
-- Journal append-only des événements d'instance (rotation token,
-- ajout/retrait d'owner, changement d'URL, etc.). Mirroir de
-- `audit_log` mais sans `guild_id` puisque ces événements sont
-- scope-instance, pas scope-guild.
--
-- ID ULID applicatif pour pagination naturelle (ordre monotone
-- aligné avec `created_at desc`). Index dédié `(action, created_at)`
-- pour les requêtes de filtrage par type d'événement.

CREATE TABLE "instance_audit_log" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" varchar(20),
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"severity" text NOT NULL,
	"metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "idx_instance_audit_action_created" ON "instance_audit_log" ("action", "created_at");
CREATE INDEX "idx_instance_audit_actor" ON "instance_audit_log" ("actor_id");
