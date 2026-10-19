CREATE TABLE `accounts` (
	`directory_id` text NOT NULL,
	`product_id` text DEFAULT '' NOT NULL,
	`method` text NOT NULL,
	`username` text,
	`vault` text,
	`job_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_login_at` integer,
	PRIMARY KEY(`directory_id`, `product_id`)
);
