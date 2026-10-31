-- PlatformExpense: gastos REALES de plataforma (superadmin, Brandon 2026-06-30).
-- Global (sin tenantId), distinto de Expense (por-tenant). El pooler de Supabase
-- cuelga `prisma migrate`; se aplica vía Supabase MCP / pg directo y queda acá
-- para `prisma migrate deploy`.
CREATE TABLE IF NOT EXISTS "PlatformExpense" (
  "id"        TEXT PRIMARY KEY,
  "concept"   TEXT NOT NULL,
  "category"  TEXT NOT NULL,
  "amount"    DECIMAL(12,2) NOT NULL,
  "currency"  TEXT NOT NULL DEFAULT 'PEN',
  "date"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recurring" BOOLEAN NOT NULL DEFAULT false,
  "period"    TEXT NOT NULL DEFAULT '',
  "vendor"    TEXT NOT NULL DEFAULT '',
  "notes"     TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PlatformExpense_category_idx" ON "PlatformExpense"("category");
CREATE INDEX IF NOT EXISTS "PlatformExpense_date_idx" ON "PlatformExpense"("date");
