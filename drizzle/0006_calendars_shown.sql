-- Seeing other Google calendars in the views: which ones each person chose,
-- and what Google granted each calendar link. Links from before this were
-- granted the Todos calendar's scope only.
CREATE TABLE `calendars_shown` (
	`person` text NOT NULL,
	`calendar_id` text NOT NULL,
	PRIMARY KEY(`person`, `calendar_id`),
	FOREIGN KEY (`person`) REFERENCES `calendar_links`(`person`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `calendar_links` ADD `scopes` text DEFAULT 'https://www.googleapis.com/auth/calendar.app.created' NOT NULL;