PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_domain_ratings` (
	`domain` text NOT NULL,
	`measured_at` integer NOT NULL,
	`rating` real NOT NULL,
	`version` text DEFAULT 'dr3' NOT NULL,
	PRIMARY KEY(`domain`, `version`, `measured_at`)
);
--> statement-breakpoint
INSERT INTO `__new_domain_ratings`("domain", "measured_at", "rating") SELECT "domain", "measured_at", "rating" FROM `domain_ratings`;--> statement-breakpoint
DROP TABLE `domain_ratings`;--> statement-breakpoint
ALTER TABLE `__new_domain_ratings` RENAME TO `domain_ratings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;