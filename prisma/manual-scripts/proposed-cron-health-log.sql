-- Migration: CronHealthLog table
-- Purpose: Track every cron job execution (success/failure) for health dashboard
-- Related: lib/cron/health-tracker.ts, app/api/superadmin/cron-health/route.ts
-- Safe: CREATE TABLE only, no data changes, no locks on existing tables

CREATE TABLE IF NOT EXISTS "CronHealthLog" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "jobName"    TEXT NOT NULL,
  "status"     TEXT NOT NULL,
  "durationMs" INTEGER NOT NULL,
  "error"      TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "CronHealthLog_jobName_createdAt_idx"
  ON "CronHealthLog" ("jobName", "createdAt");

CREATE INDEX IF NOT EXISTS "CronHealthLog_createdAt_idx"
  ON "CronHealthLog" ("createdAt");

-- Auto-cleanup: delete logs older than 30 days (run as cron or manual)
-- DELETE FROM "CronHealthLog" WHERE "createdAt" < NOW() - INTERVAL '30 days';
