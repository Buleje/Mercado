-- ADR-375 — El presupuesto por categoría deja de vivir en localStorage.
--
-- `BudgetVsRealTab` guardaba el techo mensual en
-- `localStorage["bodega-budget-config"]` y repartía por categoría con una
-- función `estimateBudget()` que lo inventaba. Resultado: el presupuesto no se
-- compartía entre dispositivos y «presupuesto vs real» comparaba contra un
-- número que nadie había decidido.
--
-- Idempotente: se puede correr N veces.
-- Uso: USE_POOLER=1 node -r dotenv/config scripts/apply-375-migration.mjs dotenv_config_path=.env.local

CREATE TABLE IF NOT EXISTS "ExpenseBudget" (
  "id"           TEXT NOT NULL,
  "tenantId"     TEXT NOT NULL,
  "category"     TEXT NOT NULL,
  "montoMensual" DECIMAL(12,2) NOT NULL,
  "updatedBy"    TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExpenseBudget_pkey" PRIMARY KEY ("id")
);

-- Un techo por categoría y por tenant: dos filas para «Alquiler» dejarían la
-- pregunta «¿cuál es el presupuesto?» sin respuesta.
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseBudget_tenantId_category_key"
  ON "ExpenseBudget" ("tenantId", "category");

CREATE INDEX IF NOT EXISTS "ExpenseBudget_tenantId_idx"
  ON "ExpenseBudget" ("tenantId");
