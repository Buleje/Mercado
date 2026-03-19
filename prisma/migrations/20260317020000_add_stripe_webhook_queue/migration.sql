-- Migration: add StripeWebhookQueue for resilient webhook event replay

CREATE TABLE IF NOT EXISTS "StripeWebhookQueue" (
    "id"          TEXT NOT NULL,
    "stripeId"    TEXT NOT NULL,
    "eventType"   TEXT NOT NULL,
    "payload"     TEXT NOT NULL,
    "attempts"    INTEGER NOT NULL DEFAULT 0,
    "lastError"   TEXT,
    "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StripeWebhookQueue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StripeWebhookQueue_stripeId_key"
    ON "StripeWebhookQueue"("stripeId");

CREATE INDEX IF NOT EXISTS "StripeWebhookQueue_processedAt_idx"
    ON "StripeWebhookQueue"("processedAt");

CREATE INDEX IF NOT EXISTS "StripeWebhookQueue_nextRetryAt_idx"
    ON "StripeWebhookQueue"("nextRetryAt");
