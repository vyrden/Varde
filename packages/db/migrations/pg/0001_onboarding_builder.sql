-- Jalon 3 PR 3.1 — onboarding builder model (ADR 0007).
-- Refonte de `onboarding_sessions` (Q&A → builder), ajout de
-- `onboarding_actions_log`, extension de `ai_invocations` avec
-- actor_id et prompt_version.
--
-- Pré-V1, aucune donnée en production : on drop et recrée
-- `onboarding_sessions`. Les additions sur `ai_invocations` sont
-- en ALTER (idempotent vis-à-vis d'une base vide).

DROP TABLE IF EXISTS "onboarding_sessions" CASCADE;
--> statement-breakpoint
CREATE TABLE "onboarding_sessions" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"started_by" varchar(20) NOT NULL,
	"status" text NOT NULL,
	"preset_source" text NOT NULL,
	"preset_id" varchar(128),
	"ai_invocation_id" varchar(26),
	"draft" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	CONSTRAINT "onboarding_status_check" CHECK (status IN ('draft', 'previewing', 'applying', 'applied', 'rolled_back', 'expired', 'failed')),
	CONSTRAINT "onboarding_preset_source_check" CHECK (preset_source IN ('blank', 'preset', 'ai'))
);
--> statement-breakpoint
ALTER TABLE "onboarding_sessions" ADD CONSTRAINT "onboarding_sessions_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_onboarding_guild_status" ON "onboarding_sessions" USING btree ("guild_id","status");
--> statement-breakpoint
CREATE INDEX "idx_onboarding_expires" ON "onboarding_sessions" USING btree ("expires_at") WHERE "onboarding_sessions"."status" = 'applied';
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_onboarding_active_per_guild" ON "onboarding_sessions" USING btree ("guild_id") WHERE "onboarding_sessions"."status" IN ('draft', 'previewing', 'applying');
--> statement-breakpoint
CREATE TABLE "onboarding_actions_log" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"session_id" varchar(26) NOT NULL,
	"sequence" integer NOT NULL,
	"action_type" varchar(128) NOT NULL,
	"action_payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"external_id" varchar(64),
	"result" jsonb,
	"error" text,
	"applied_at" timestamp with time zone,
	"undone_at" timestamp with time zone,
	CONSTRAINT "onboarding_action_status_check" CHECK (status IN ('pending', 'applied', 'undone', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "onboarding_actions_log" ADD CONSTRAINT "onboarding_actions_log_session_id_onboarding_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."onboarding_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_onboarding_actions_session_sequence" ON "onboarding_actions_log" USING btree ("session_id","sequence");
--> statement-breakpoint
ALTER TABLE "ai_invocations" ADD COLUMN "actor_id" varchar(20);
--> statement-breakpoint
ALTER TABLE "ai_invocations" ADD COLUMN "prompt_version" varchar(32) DEFAULT 'v1' NOT NULL;
--> statement-breakpoint
CREATE INDEX "idx_ai_actor_purpose_created" ON "ai_invocations" USING btree ("actor_id","purpose","created_at");
