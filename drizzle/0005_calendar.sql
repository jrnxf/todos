-- Google Calendar sync: who connected a calendar, which event is which
-- to-do, and when each to-do last changed. Rows from before this have their
-- creation as their last change.
CREATE TABLE `calendar_events` (
	`person` text NOT NULL,
	`item_id` integer NOT NULL,
	`event_id` text NOT NULL,
	`etag` text NOT NULL,
	`hash` text NOT NULL,
	PRIMARY KEY(`person`, `item_id`),
	FOREIGN KEY (`person`) REFERENCES `calendar_links`(`person`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_events_event` ON `calendar_events` (`person`,`event_id`);--> statement-breakpoint
CREATE TABLE `calendar_links` (
	`person` text PRIMARY KEY NOT NULL,
	`refresh_token` text NOT NULL,
	`access_token` text,
	`access_token_expires_at` integer,
	`calendar_id` text,
	`sync_token` text,
	`channel_id` text,
	`channel_resource_id` text,
	`channel_token_hash` text,
	`channel_expires_at` integer,
	`problem` text,
	`connected_at` text NOT NULL,
	`last_synced_at` text
);
--> statement-breakpoint
ALTER TABLE `items` ADD `updated_at` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL;--> statement-breakpoint
UPDATE `items` SET `updated_at` = `created_at`;
