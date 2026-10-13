CREATE TABLE `alerts_sent` (
	`item_id` integer NOT NULL,
	`kind` text NOT NULL,
	`for_date` text NOT NULL,
	`person` text NOT NULL,
	`sent_at` text NOT NULL,
	PRIMARY KEY(`item_id`, `kind`, `for_date`, `person`)
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`area` text,
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
	FOREIGN KEY (`assignee`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`initial` text NOT NULL
);
