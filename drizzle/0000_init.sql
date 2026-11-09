CREATE TABLE `agent_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `api_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `decisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`listing_id` integer NOT NULL,
	`run_at` integer NOT NULL,
	`trigger` text NOT NULL,
	`provider` text NOT NULL,
	`verdict` text NOT NULL,
	`confidence` real,
	`headline` text,
	`reasons` text,
	`actions` text,
	`context` text,
	`raw` text,
	`duration_ms` integer,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `listings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`price` real NOT NULL,
	`kb` real NOT NULL,
	`deposit` real DEFAULT 0 NOT NULL,
	`rent` real DEFAULT 0 NOT NULL,
	`region` text NOT NULL,
	`sgg` text,
	`buy_ym` text NOT NULL,
	`move_ym` text NOT NULL,
	`misc` real DEFAULT 200 NOT NULL,
	`ignore_rules` integer DEFAULT false NOT NULL,
	`meta` text,
	`watch` integer DEFAULT false NOT NULL,
	`apt_name` text,
	`area_m2` real,
	`naver_complex_no` text,
	`kb_complex_id` text,
	`auto_sync` integer DEFAULT true NOT NULL,
	`target_price` real,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profile` (
	`id` integer PRIMARY KEY NOT NULL,
	`as_of` text NOT NULL,
	`saved` real NOT NULL,
	`monthly_save` real NOT NULL,
	`income` real NOT NULL,
	`other_debt` real DEFAULT 0 NOT NULL,
	`first_buyer` integer DEFAULT true NOT NULL,
	`m_rate` real NOT NULL,
	`m_years` integer NOT NULL,
	`c_rate` real NOT NULL,
	`c_years` integer NOT NULL,
	`auto_rate` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`log` text
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`listing_id` integer NOT NULL,
	`source` text NOT NULL,
	`taken_at` integer NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE cascade
);
