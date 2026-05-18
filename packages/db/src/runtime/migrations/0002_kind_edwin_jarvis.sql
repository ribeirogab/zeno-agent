-- SQLite forbids non-constant DEFAULT on ALTER TABLE ADD COLUMN
-- (https://www.sqlite.org/lang_altertable.html#altertabaddcol).
-- drizzle-kit generated a `DEFAULT (strftime(...))` clause here, which
-- raised `SqliteError: Cannot add a column with non-constant default`
-- on every boot. Split into a constant-default ADD + a backfill UPDATE.
-- New rows still get the correct timestamp because drizzle inlines the
-- schema's `sql`(strftime(...))`` default into generated INSERT statements.
ALTER TABLE `connector_secrets` ADD `updated_at` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL;--> statement-breakpoint
UPDATE `connector_secrets` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
