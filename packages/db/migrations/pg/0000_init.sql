CREATE TABLE "ai_invocations" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"module_id" varchar(128),
	"purpose" varchar(256) NOT NULL,
	"provider" varchar(64) NOT NULL,
	"model" varchar(128) NOT NULL,
	"prompt_hash" varchar(64) NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_estimate" numeric(18, 8) DEFAULT '0' NOT NULL,
	"success" boolean NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" varchar(128),
	"action" varchar(256) NOT NULL,
	"target_type" text,
	"target_id" varchar(128),
	"module_id" varchar(128),
	"severity" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_actor_type_check" CHECK (actor_type IN ('user', 'system', 'module')),
	CONSTRAINT "audit_target_type_check" CHECK (target_type IS NULL OR target_type IN ('user', 'channel', 'role', 'message')),
	CONSTRAINT "audit_severity_check" CHECK (severity IN ('info', 'warn', 'error'))
);
--> statement-breakpoint
CREATE TABLE "guild_config" (
	"guild_id" varchar(20) PRIMARY KEY NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" varchar(20),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_modules" (
	"guild_id" varchar(20) NOT NULL,
	"module_id" varchar(128) NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"enabled_at" timestamp with time zone,
	"enabled_by" varchar(20),
	"disabled_at" timestamp with time zone,
	CONSTRAINT "guild_modules_guild_id_module_id_pk" PRIMARY KEY("guild_id","module_id")
);
--> statement-breakpoint
CREATE TABLE "guilds" (
	"id" varchar(20) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"locale" varchar(10) DEFAULT 'en' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keystore" (
	"guild_id" varchar(20) NOT NULL,
	"module_id" varchar(128) NOT NULL,
	"key" varchar(128) NOT NULL,
	"ciphertext" "bytea" NOT NULL,
	"iv" "bytea" NOT NULL,
	"auth_tag" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "keystore_guild_id_module_id_key_pk" PRIMARY KEY("guild_id","module_id","key")
);
--> statement-breakpoint
CREATE TABLE "modules_registry" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"version" varchar(64) NOT NULL,
	"manifest" jsonb NOT NULL,
	"schema_version" integer NOT NULL,
	"loaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_sessions" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"started_by" varchar(20) NOT NULL,
	"status" text NOT NULL,
	"mode" text NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"plan" jsonb,
	"applied_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "onboarding_status_check" CHECK (status IN ('in_progress', 'completed', 'aborted', 'rolled_back')),
	CONSTRAINT "onboarding_mode_check" CHECK (mode IN ('fresh', 'existing', 'replay'))
);
--> statement-breakpoint
CREATE TABLE "permission_bindings" (
	"guild_id" varchar(20) NOT NULL,
	"permission_id" varchar(256) NOT NULL,
	"role_id" varchar(20) NOT NULL,
	"granted_by" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permission_bindings_guild_id_permission_id_role_id_pk" PRIMARY KEY("guild_id","permission_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "permissions_registry" (
	"id" varchar(256) PRIMARY KEY NOT NULL,
	"module_id" varchar(128) NOT NULL,
	"description" text NOT NULL,
	"category" varchar(64) NOT NULL,
	"default_level" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_default_level_check" CHECK (default_level IN ('admin', 'moderator', 'member', 'nobody'))
);
--> statement-breakpoint
CREATE TABLE "scheduled_tasks" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"job_key" varchar(256) NOT NULL,
	"module_id" varchar(128) NOT NULL,
	"guild_id" varchar(20),
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"run_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_kind_check" CHECK (kind IN ('one_shot', 'recurring')),
	CONSTRAINT "tasks_status_check" CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "ai_invocations" ADD CONSTRAINT "ai_invocations_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_invocations" ADD CONSTRAINT "ai_invocations_module_id_modules_registry_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules_registry"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_module_id_modules_registry_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules_registry"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_config" ADD CONSTRAINT "guild_config_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_modules" ADD CONSTRAINT "guild_modules_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_modules" ADD CONSTRAINT "guild_modules_module_id_modules_registry_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules_registry"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keystore" ADD CONSTRAINT "keystore_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keystore" ADD CONSTRAINT "keystore_module_id_modules_registry_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules_registry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_sessions" ADD CONSTRAINT "onboarding_sessions_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_bindings" ADD CONSTRAINT "permission_bindings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_bindings" ADD CONSTRAINT "permission_bindings_permission_id_permissions_registry_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions_registry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissions_registry" ADD CONSTRAINT "permissions_registry_module_id_modules_registry_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules_registry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_module_id_modules_registry_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules_registry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_guild_created" ON "ai_invocations" USING btree ("guild_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_guild_created" ON "audit_log" USING btree ("guild_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_action" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_audit_actor" ON "audit_log" USING btree ("actor_type","actor_id");--> statement-breakpoint
CREATE INDEX "idx_audit_target" ON "audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "idx_guilds_left_at" ON "guilds" USING btree ("left_at");--> statement-breakpoint
CREATE INDEX "idx_modules_schema_version" ON "modules_registry" USING btree ("schema_version");--> statement-breakpoint
CREATE INDEX "idx_onboarding_guild_status" ON "onboarding_sessions" USING btree ("guild_id","status");--> statement-breakpoint
CREATE INDEX "idx_onboarding_expires" ON "onboarding_sessions" USING btree ("expires_at") WHERE "onboarding_sessions"."status" = 'in_progress';--> statement-breakpoint
CREATE INDEX "idx_bindings_role" ON "permission_bindings" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "idx_permissions_module" ON "permissions_registry" USING btree ("module_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_tasks_job_key" ON "scheduled_tasks" USING btree ("job_key");--> statement-breakpoint
CREATE INDEX "idx_tasks_run_at" ON "scheduled_tasks" USING btree ("status","run_at");