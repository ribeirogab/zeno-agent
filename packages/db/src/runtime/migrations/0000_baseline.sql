CREATE TABLE `agent_capabilities` (
	`tool_name` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "agent_capabilities_enabled_check" CHECK("agent_capabilities"."enabled" IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE `backend_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`backend_id` text NOT NULL,
	`field_name` text NOT NULL,
	`value_encrypted` blob NOT NULL,
	`iv` blob NOT NULL,
	`status` text DEFAULT 'untested' NOT NULL,
	`last_tested_at` integer,
	`last_auth_alert_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backend_credentials_profile_backend_field_unique` ON `backend_credentials` (`profile_id`,`backend_id`,`field_name`);--> statement-breakpoint
CREATE INDEX `idx_backend_credentials_profile_backend` ON `backend_credentials` (`profile_id`,`backend_id`);--> statement-breakpoint
CREATE TABLE `backend_settings` (
	`profile_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`profile_id`, `key`)
);
--> statement-breakpoint
CREATE TABLE `commands` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`processed_at` text,
	`completed_at` text,
	`result` text,
	`correlation_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `commands_pending_idx` ON `commands` (`status`,`created_at`) WHERE "commands"."status" = 'pending';--> statement-breakpoint
CREATE TABLE `connector_apps` (
	`id` text PRIMARY KEY NOT NULL,
	`catalog_id` text NOT NULL,
	`app_id` text NOT NULL,
	`app_slug` text NOT NULL,
	`app_name` text NOT NULL,
	`pem` text NOT NULL,
	`pem_sha256` text NOT NULL,
	`pem_rotated_at` text,
	`last_refresh_error_at` text,
	`last_refresh_error_message` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `connector_apps_catalog_app_unique` ON `connector_apps` (`catalog_id`,`app_id`);--> statement-breakpoint
CREATE INDEX `idx_connector_apps_catalog` ON `connector_apps` (`catalog_id`);--> statement-breakpoint
CREATE TABLE `connector_invocations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`connector_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`thread_id` text,
	`correlation_id` text,
	`result` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`error_message` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`connector_id`) REFERENCES `connectors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_connector_invocations_connector_created` ON `connector_invocations` (`connector_id`,"created_at" DESC);--> statement-breakpoint
CREATE INDEX `idx_connector_invocations_thread` ON `connector_invocations` (`thread_id`);--> statement-breakpoint
CREATE TABLE `connector_secrets` (
	`connector_id` text NOT NULL,
	`key` text NOT NULL,
	`is_public` integer DEFAULT 0 NOT NULL,
	`value_encrypted` blob NOT NULL,
	`iv` blob NOT NULL,
	PRIMARY KEY(`connector_id`, `key`),
	FOREIGN KEY (`connector_id`) REFERENCES `connectors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `connector_skills` (
	`connector_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`connector_id`, `skill_id`),
	FOREIGN KEY (`connector_id`) REFERENCES `connectors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_connector_skills_skill` ON `connector_skills` (`skill_id`);--> statement-breakpoint
CREATE TABLE `connector_tool_permissions` (
	`connector_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`description` text,
	`category` text NOT NULL,
	`permission` text NOT NULL,
	PRIMARY KEY(`connector_id`, `tool_name`),
	FOREIGN KEY (`connector_id`) REFERENCES `connectors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_connector_tool_permissions_connector` ON `connector_tool_permissions` (`connector_id`);--> statement-breakpoint
CREATE TABLE `connectors` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`display_name` text NOT NULL,
	`description` text,
	`source` text NOT NULL,
	`catalog_id` text,
	`transport` text NOT NULL,
	`command` text,
	`args` text,
	`url` text,
	`status` text DEFAULT 'enabled' NOT NULL,
	`last_error` text,
	`last_error_at` text,
	`last_verified_at` text,
	`app_id` text,
	`kind` text DEFAULT 'mcp' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `connector_apps`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "connectors_slug_check" CHECK("connectors"."slug" GLOB '[a-z0-9]*' AND "connectors"."slug" NOT GLOB '*[^a-z0-9-]*' AND length("connectors"."slug") >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `connectors_slug_unique` ON `connectors` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_connectors_status_slug` ON `connectors` (`status`,`slug`);--> statement-breakpoint
CREATE TABLE `cron_connectors` (
	`cron_id` text NOT NULL,
	`connector_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`cron_id`, `connector_id`),
	FOREIGN KEY (`cron_id`) REFERENCES `crons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connector_id`) REFERENCES `connectors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_cron_connectors_connector` ON `cron_connectors` (`connector_id`);--> statement-breakpoint
CREATE TABLE `cron_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`cron_id` text NOT NULL,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`output` text,
	`error` text,
	FOREIGN KEY (`cron_id`) REFERENCES `crons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_cron_runs_cron` ON `cron_runs` (`cron_id`,"started_at" DESC);--> statement-breakpoint
CREATE TABLE `cron_skills` (
	`cron_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`cron_id`, `skill_id`),
	FOREIGN KEY (`cron_id`) REFERENCES `crons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_cron_skills_skill` ON `cron_skills` (`skill_id`);--> statement-breakpoint
CREATE TABLE `crons` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`prompt` text NOT NULL,
	`schedule` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`source` text NOT NULL,
	`created_by` text,
	`notify_conversation_id` text,
	`notify_thread_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_run_at` text,
	`next_run_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_crons_enabled_next_run` ON `crons` (`enabled`,`next_run_at`);--> statement-breakpoint
CREATE TABLE `logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` text NOT NULL,
	`level` integer NOT NULL,
	`service` text NOT NULL,
	`event` text,
	`correlation_id` text,
	`message` text,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `logs_ts_desc_idx` ON `logs` ("ts" DESC);--> statement-breakpoint
CREATE INDEX `logs_level_idx` ON `logs` (`level`);--> statement-breakpoint
CREATE INDEX `logs_event_idx` ON `logs` (`event`);--> statement-breakpoint
CREATE INDEX `logs_correlation_idx` ON `logs` (`correlation_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`thread_id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_used_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `skills` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`source` text DEFAULT 'dashboard' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skills_name_unique` ON `skills` (`name`);--> statement-breakpoint
CREATE INDEX `idx_skills_name` ON `skills` (`name`);--> statement-breakpoint
CREATE INDEX `idx_skills_source` ON `skills` (`source`);