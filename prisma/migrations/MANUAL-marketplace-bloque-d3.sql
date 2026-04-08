-- MANUAL-marketplace-bloque-d3.sql
-- Idempotente: usar IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- Ejecutar con DIRECT_URL (pooler IPv4) contra Supabase
--
-- Bloque D3 — Reviews verificadas del Marketplace
-- Incluye:
--   D3.1: Review — extensión con orderId (verificación de compra) + helpfulUpvotes
--   D3.2: ReviewVote — dedupe de votos helpful por customerPhone
--
-- Principios (mismos que D1/D2):
-- - tenantId obligatorio + filtrado en toda query
-- - Timestamps UTC
-- - Índices compuestos empiezan por tenantId
-- - Los campos nuevos de Review son nullable para compatibilidad con data existente

-- ─── D3.1: Review — extender con campos de verificación ─────────────────────
-- La columna orderId liga la review a un pedido real del buyer. Si está null,
-- la review es "unverified" (legacy o creada fuera del flujo verificado).
-- La columna verifiedAt marca el momento en que el link se confirmó.
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "orderId"       TEXT;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "verifiedAt"    TIMESTAMP(3);
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "helpfulUpvotes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "helpfulDownvotes" INTEGER NOT NULL DEFAULT 0;

-- Índices para listado rápido por store/product filtrado por status
CREATE INDEX IF NOT EXISTS "Review_storeId_status_date_idx"
  ON "Review"("storeId", "status", "date" DESC);

CREATE INDEX IF NOT EXISTS "Review_productId_status_date_idx"
  ON "Review"("productId", "status", "date" DESC);

CREATE INDEX IF NOT EXISTS "Review_tenantId_verified_idx"
  ON "Review"("tenantId", "verified");

CREATE INDEX IF NOT EXISTS "Review_orderId_idx"
  ON "Review"("orderId");

-- ─── D3.2: ReviewVote ───────────────────────────────────
-- Tracking de votos "helpful" / "not helpful" por customerPhone para dedupe.
-- Un buyer solo puede votar una vez por review. El tipo de voto puede
-- cambiarse (upvote → downvote) pero no duplicarse.
CREATE TABLE IF NOT EXISTS "ReviewVote" (
  "id"            TEXT          NOT NULL,
  "tenantId"      TEXT          NOT NULL,
  "reviewId"      TEXT          NOT NULL,
  "customerPhone" TEXT          NOT NULL,              -- identificador del voter
  "voteType"      TEXT          NOT NULL,              -- upvote|downvote
  "createdAt"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "ReviewVote_pkey" PRIMARY KEY ("id")
);

-- Un voto único por (reviewId, customerPhone) — el tipo se actualiza con UPDATE
CREATE UNIQUE INDEX IF NOT EXISTS "ReviewVote_review_customer_unique"
  ON "ReviewVote"("reviewId", "customerPhone");

CREATE INDEX IF NOT EXISTS "ReviewVote_tenantId_idx"
  ON "ReviewVote"("tenantId");

CREATE INDEX IF NOT EXISTS "ReviewVote_reviewId_idx"
  ON "ReviewVote"("reviewId");

CREATE INDEX IF NOT EXISTS "ReviewVote_customerPhone_idx"
  ON "ReviewVote"("customerPhone");

-- FK a Review (CASCADE para que si borran la review desaparezcan sus votos)
ALTER TABLE "ReviewVote"
  ADD CONSTRAINT "ReviewVote_reviewId_fkey"
  FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE;

-- ─── Registro en _prisma_migrations (opcional) ───────────
-- Si usás el bypass manual de Prisma, descomentar y ejecutar:
-- INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
-- VALUES (gen_random_uuid(), '', NOW(), '20260408230000_marketplace_bloque_d3', NULL, NULL, NOW(), 1)
-- ON CONFLICT DO NOTHING;
