-- ADR-131: distribución preparada vs empaquetada (Brandon 2026-06-12)
-- Idempotente. Aplicar vía pg directo (DIRECT_URL) — el pooler cuelga prisma migrate.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isPrepared" BOOLEAN NOT NULL DEFAULT false;
