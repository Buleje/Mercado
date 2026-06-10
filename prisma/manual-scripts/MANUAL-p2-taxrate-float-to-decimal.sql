-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION P2 (audit 2026-06-10) · Settings.taxRate Float → Decimal(5,2)
-- IGV almacenado como Float acumula error IEEE-754 en cálculos de impuesto.
-- Valores actuales: 18.0 exactos — cast sin pérdida. ALTER instantáneo.
-- APLICAR: psql "$DIRECT_URL" -f prisma/manual-scripts/MANUAL-p2-taxrate-float-to-decimal.sql
-- ROLLBACK: ALTER TABLE "Settings" ALTER COLUMN "taxRate" TYPE DOUBLE PRECISION USING "taxRate"::DOUBLE PRECISION;
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;
ALTER TABLE "Settings"
  ALTER COLUMN "taxRate"
  TYPE DECIMAL(5,2)
  USING "taxRate"::DECIMAL(5,2);
ALTER TABLE "Settings" ALTER COLUMN "taxRate" SET DEFAULT 18;
COMMIT;
