CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer NOT NULL,
	`action` text NOT NULL,
	`target` text,
	`details` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`name` text PRIMARY KEY NOT NULL,
	`port` integer NOT NULL,
	`master_key` text NOT NULL,
	`status` text DEFAULT 'stopped' NOT NULL,
	`created_at` integer NOT NULL,
	`last_started_at` integer,
	`last_stopped_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_port_unique` ON `profiles` (`port`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
