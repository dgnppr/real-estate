ALTER TABLE `profile` ADD `borrowers` text;--> statement-breakpoint
ALTER TABLE `profile` ADD `mortgage_borrower` text DEFAULT 'auto' NOT NULL;