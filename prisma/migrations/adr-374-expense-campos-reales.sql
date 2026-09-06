-- ADR-374 — La metadata del gasto deja de vivir dentro de `description`.
--
-- Frecuencia, día de pago, método y proveedor se guardaban serializados como
-- un bloque `\n---META---\n{…}` al final de `Expense.description`
-- (lib/expense-meta.ts). Consecuencias que se pagaron: no se podía filtrar ni
-- sumar por esos campos desde la base, y el bloque se filtraba a la vista —
-- el CSV del Historial de Gastos se exportaba con el JSON adentro.
--
-- FASE EXPAND: todo nullable, nada se borra. El bloque serializado sigue
-- siendo la fuente hasta que el backfill corra; el código lee la columna y
-- cae al bloque si está vacía. La fase CONTRACT (limpiar `description`) va en
-- una migración posterior, cuando ninguna lectura dependa del bloque.
--
-- Idempotente: se puede correr N veces.
-- Uso: node -r dotenv/config scripts/apply-374-migration.mjs dotenv_config_path=.env.local

ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "frequency" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "paymentDay" INTEGER;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "supplierName" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "documentType" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "documentNumber" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "supplierRuc" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "igvAmount" DECIMAL(12,2);
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "afectoIgv" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "attachmentUrl" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "costCenter" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "templateId" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);

-- El historial siempre pregunta lo mismo: «los ejecutados de este tenant en
-- este período». Sin el índice compuesto, descarta las plantillas fila por fila.
CREATE INDEX IF NOT EXISTS "Expense_tenantId_recurring_date_idx"
  ON "Expense" ("tenantId", "recurring", "date");

CREATE INDEX IF NOT EXISTS "Expense_templateId_idx"
  ON "Expense" ("templateId");
