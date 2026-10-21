CREATE TABLE `answers` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`session_id` text NOT NULL,
	`round` integer NOT NULL,
	`item_id` text NOT NULL,
	`item_name` text NOT NULL,
	`choice` text NOT NULL,
	`category` text NOT NULL,
	`correct` integer NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `answer_round` ON `answers` (`session_id`,`round`);--> statement-breakpoint
CREATE UNIQUE INDEX `answer_item` ON `answers` (`session_id`,`item_id`);--> statement-breakpoint
CREATE INDEX `answers_room` ON `answers` (`room_id`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_hash` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`config` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`config_version` integer NOT NULL,
	`name` text NOT NULL,
	`config` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sessions_room` ON `sessions` (`room_id`);