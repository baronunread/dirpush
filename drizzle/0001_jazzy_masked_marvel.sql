CREATE TABLE `todos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` text DEFAULT '' NOT NULL,
	`job_id` text,
	`message` text NOT NULL,
	`url` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
