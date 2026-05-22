-- Crons CLI-first: flip source of truth from DB to filesystem.
-- Spec: .vault/specs/2026-05-22-crons-cli-first/spec-crons-cli-first.md
-- Clean slate (per spec decision: single-operator project, zero migration).
DELETE FROM cron_runs;
--> statement-breakpoint
DELETE FROM crons;
--> statement-breakpoint

-- Drop legacy columns whose source of truth moved to the filesystem.
ALTER TABLE crons DROP COLUMN prompt;
--> statement-breakpoint
ALTER TABLE crons DROP COLUMN source;
--> statement-breakpoint
ALTER TABLE crons DROP COLUMN created_by;
--> statement-breakpoint
ALTER TABLE crons DROP COLUMN notify_conversation_id;
--> statement-breakpoint
ALTER TABLE crons DROP COLUMN notify_thread_id;
--> statement-breakpoint
ALTER TABLE crons DROP COLUMN created_at;
--> statement-breakpoint

-- Add reconciler fast-path columns + error surface.
ALTER TABLE crons ADD COLUMN content_hash TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE crons ADD COLUMN mtime_ms INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE crons ADD COLUMN last_error TEXT;
--> statement-breakpoint
ALTER TABLE crons ADD COLUMN last_error_at TEXT;
--> statement-breakpoint

-- Add agent session id to cron_runs for traceability.
ALTER TABLE cron_runs ADD COLUMN session_id TEXT;
