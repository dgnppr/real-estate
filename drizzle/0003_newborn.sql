ALTER TABLE `profile` ADD `child_birth` text;--> statement-breakpoint
ALTER TABLE `profile` ADD `assets` real;--> statement-breakpoint
ALTER TABLE `profile` ADD `loan_product` text DEFAULT 'auto' NOT NULL;