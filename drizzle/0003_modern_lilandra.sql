CREATE TABLE `domain_ratings` (
	`domain` text NOT NULL,
	`measured_at` integer NOT NULL,
	`rating` real NOT NULL,
	PRIMARY KEY(`domain`, `measured_at`)
);
