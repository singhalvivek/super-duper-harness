CREATE TABLE `meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`title_status` text DEFAULT 'ok' NOT NULL,
	`source` text DEFAULT 'google-meet' NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`line_count` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_meetings_started_at` ON `meetings` (`started_at`);--> statement-breakpoint
CREATE TABLE `transcript_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_id` text NOT NULL,
	`seq` integer NOT NULL,
	`speaker` text NOT NULL,
	`text` text NOT NULL,
	`timestamp_ms` integer NOT NULL,
	FOREIGN KEY (`meeting_id`) REFERENCES `meetings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_lines_meeting_seq` ON `transcript_lines` (`meeting_id`,`seq`);