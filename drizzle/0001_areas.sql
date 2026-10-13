CREATE TABLE `areas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `areas_name_unique` ON `areas` (`name`);
--> statement-breakpoint
-- The three areas every list started with, in the colours they start as.
INSERT INTO `areas` (`name`, `color`) VALUES ('House', 'blue'), ('Kids', 'amber'), ('Paperwork', 'violet');
--> statement-breakpoint
-- Any other area someone typed onto a to-do becomes an area too, in gray
-- until it is given a colour.
INSERT INTO `areas` (`name`, `color`)
SELECT DISTINCT `area`, 'gray' FROM `items`
WHERE `area` IS NOT NULL AND `area` NOT IN ('House', 'Kids', 'Paperwork');
--> statement-breakpoint
ALTER TABLE `items` ADD `area_id` integer REFERENCES areas(id) ON DELETE SET NULL;
--> statement-breakpoint
-- Point every to-do at the area its old text named.
UPDATE `items` SET `area_id` = (SELECT `id` FROM `areas` WHERE `areas`.`name` = `items`.`area`);
