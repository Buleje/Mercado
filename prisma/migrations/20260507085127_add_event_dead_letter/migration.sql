-- SECURITY 2026-05-07 (audit P0-2 production): persistir DLQ en DB.
-- Antes InMemoryDeadLetterQueue perdía eventos en cada cold start Vercel.

CREATE TABLE "EventDeadLetter" (
  "id"           TEXT PRIMARY KEY,
  "tenantId"     TEXT NOT NULL,
  "eventType"    TEXT NOT NULL,
  "eventPayload" JSONB NOT NULL,
  "occurredAt"   TIMESTAMP(3) NOT NULL,
  "failedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attemptCount" INTEGER NOT NULL DEFAULT 1,
  "lastError"    TEXT NOT NULL,
  "handlerName"  TEXT NOT NULL,
  "resolvedAt"   TIMESTAMP(3)
);

CREATE INDEX "EventDeadLetter_tenantId_resolvedAt_idx" ON "EventDeadLetter"("tenantId", "resolvedAt");
CREATE INDEX "EventDeadLetter_eventType_resolvedAt_idx" ON "EventDeadLetter"("eventType", "resolvedAt");
