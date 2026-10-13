-- People are the PEOPLE setting now, not a table. SQLite cannot drop a
-- foreign key in place, so `items` is rebuilt without the one on `assignee`,
-- and only then is `people` dropped: D1 enforces foreign keys throughout a
-- migration, and dropping the table first would fail on any assigned to-do.
CREATE TABLE `__new_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`area_id` integer,
	`assignee` text,
	`due_date` text,
	`due_time` text,
	`heads_up_days` text DEFAULT '[1]' NOT NULL,
	`must_not_miss` integer DEFAULT false NOT NULL,
	`done_at` text,
	`done_by` text,
	`created_at` text NOT NULL,
	`created_by` text,
	`deleted_at` text,
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_items`("id", "title", "notes", "area_id", "assignee", "due_date", "due_time", "heads_up_days", "must_not_miss", "done_at", "done_by", "created_at", "created_by", "deleted_at") SELECT "id", "title", "notes", "area_id", "assignee", "due_date", "due_time", "heads_up_days", "must_not_miss", "done_at", "done_by", "created_at", "created_by", "deleted_at" FROM `items`;--> statement-breakpoint
DROP TABLE `items`;--> statement-breakpoint
ALTER TABLE `__new_items` RENAME TO `items`;--> statement-breakpoint
DROP TABLE `people`;
