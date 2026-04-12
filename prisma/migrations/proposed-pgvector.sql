-- ─────────────────────────────────────────────────────────────────────────────
-- PROPOSED MIGRATION — pgvector Hybrid Recommender v2
-- ADR 042. Apply manually with DIRECT_URL — NOT via `prisma migrate deploy`
-- until the Product model gets an `embedding` field in schema.prisma.
--
-- Steps (run each one in order, inside a transaction):
--
-- 1. Enable the pgvector extension (Supabase has it available but disabled by default)
-- 2. Add the embedding column to Product
-- 3. Create the IVFFlat index for fast cosine similarity search
-- 4. Optional: backfill with the seed job `scripts/embed-products.ts`
--
-- Rollback: `DROP INDEX product_embedding_ivfflat_idx;` then
-- `ALTER TABLE "Product" DROP COLUMN embedding;`
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Enable the extension (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add the embedding column (nullable; 1536 dims for OpenAI text-embedding-3-small)
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 3. IVFFlat index — fast approximate KNN. Use 100 lists for up to ~100k rows.
--    Rebuild with higher lists if the catalog exceeds that scale.
CREATE INDEX IF NOT EXISTS product_embedding_ivfflat_idx
  ON "Product"
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- After this migration runs successfully, update prisma/schema.prisma:
--
--   model Product {
--     ...
--     embedding Unsupported("vector(1536)")?
--     ...
--   }
--
-- and `npx prisma generate`. The Unsupported type blocks direct Prisma reads,
-- which is fine — lib/recommender/hybrid.ts uses raw SQL via $queryRawUnsafe
-- with positional params (per CLAUDE.md rule #11).
-- ─────────────────────────────────────────────────────────────────────────────
