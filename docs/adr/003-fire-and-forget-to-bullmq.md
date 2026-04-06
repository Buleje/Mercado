# ADR-003: Migration from Fire-and-Forget to BullMQ Queues

## Status: Accepted (2026-04)

## Context
Background operations (emails, WhatsApp, PDF generation, activity logging) used fire-and-forget `.catch(() => {})` pattern. Jobs were silently lost on failure with no retry mechanism.

## Decision
Implement BullMQ with Redis backing for durable job processing. Graceful degradation to fire-and-forget when REDIS_URL is not set.

## Consequences
- ✅ Automatic retries (3 attempts, exponential backoff)
- ✅ Job visibility via admin dashboard (ColasTab)
- ✅ Dead letter queue for failed jobs
- ✅ Zero-downtime migration (falls back without Redis)
- ⚠️ Requires Redis in production
- ⚠️ Workers run as separate process (`npm run queue:workers`)
