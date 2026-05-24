-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION P0 · Float → Decimal en campos monetarios de comisiones
-- Ticket: audit04-database.md — hallazgos #1 y #2
--
-- PROBLEMA:
--   CommissionRule.rate  (línea 1929) → Float → imprecisión IEEE-754 en dinero
--   Store.commission     (línea 2610) → Float → imprecisión IEEE-754 en dinero
--
-- SOLUCIÓN:
--   Decimal(5,4) para CommissionRule.rate  → rango 0.0000–9.9999 (0%–999.99%)
--   Decimal(5,2) para Store.commission     → rango 0.00–999.99 (comisión %)
--
-- PATRÓN: ALTER directo (no requiere expand→contract porque es type cast sin
--   pérdida de datos: Float → Decimal preserva los valores almacenados con
--   redondeo a la precisión destino, que es MAYOR que la necesaria para %).
--
-- APLICAR con DIRECT_URL (no pgBouncer):
--   psql "$DIRECT_URL" -f prisma/migrations/MANUAL-p0-commission-float-to-decimal.sql
--
-- ROLLBACK:
--   ALTER TABLE "CommissionRule" ALTER COLUMN "rate" TYPE DOUBLE PRECISION USING "rate"::DOUBLE PRECISION;
--   ALTER TABLE "Store" ALTER COLUMN "commission" TYPE DOUBLE PRECISION USING "commission"::DOUBLE PRECISION;
--
-- RIESGO: BAJO
--   - Tablas pequeñas (comisiones por tenant, tiendas marketplace)
--   - No hay pérdida de datos: Float → Decimal(5,4) redondea a 4 decimales
--   - No requiere backfill adicional
--   - ALTER TABLE en tablas pequeñas es instantáneo (< 1s)
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. CommissionRule.rate: Float → Decimal(5,4)
--    Ejemplo: 0.05 (5%) se almacena como 0.0500 — exacto, sin drift IEEE-754
ALTER TABLE "CommissionRule"
  ALTER COLUMN "rate"
  TYPE DECIMAL(5,4)
  USING "rate"::DECIMAL(5,4);

-- Verificar que no haya rates fuera de rango (> 9.9999)
-- Si este SELECT retorna filas, el ALTER habría fallado — es informativo post-apply
-- SELECT id, "cashierId", "rate" FROM "CommissionRule" WHERE "rate" > 9.9999;

-- 2. Store.commission: Float → Decimal(5,2)
--    Ejemplo: 5.0 (5%) se almacena como 5.00 — exacto
--    Usamos Decimal(5,2) porque commission es porcentaje display (5.00, 12.50, etc.)
--    y no necesita 4 decimales.
ALTER TABLE "Store"
  ALTER COLUMN "commission"
  TYPE DECIMAL(5,2)
  USING "commission"::DECIMAL(5,2);

-- 3. Verificación post-apply (ejecutar manualmente para confirmar)
-- SELECT 'CommissionRule' AS tabla, COUNT(*) AS total_filas,
--        MIN("rate") AS min_rate, MAX("rate") AS max_rate
-- FROM "CommissionRule"
-- UNION ALL
-- SELECT 'Store', COUNT(*), MIN("commission"), MAX("commission")
-- FROM "Store";

COMMIT;
