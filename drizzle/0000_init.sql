CREATE TABLE `candidates` (
	`domain` text PRIMARY KEY NOT NULL,
	`name` text,
	`url` text NOT NULL,
	`classification` text DEFAULT 'UNVERIFIED' NOT NULL,
	`provenance` text DEFAULT '[]' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` text,
	`type` text NOT NULL,
	`worker` text,
	`data` text DEFAULT '{}' NOT NULL,
	`at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_job` ON `events` (`job_id`);--> statement-breakpoint
CREATE TABLE `galleries` (
	`revision` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` text NOT NULL,
	`items` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`subject` text NOT NULL,
	`product_id` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`step` text DEFAULT 'queued' NOT NULL,
	`worker` text,
	`lease_expires_at` integer,
	`not_before` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`block_type` text,
	`block_message` text,
	`last_error` text,
	`outcome` text,
	`listing_url` text,
	`data` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_unique_subject` ON `jobs` (`kind`,`product_id`,`subject`);--> statement-breakpoint
CREATE INDEX `jobs_status` ON `jobs` (`status`);--> statement-breakpoint
CREATE TABLE `registry_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`directory_id` text NOT NULL,
	`observation` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
