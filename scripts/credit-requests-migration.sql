-- Fiado Digital — Frente 3 (solicitud→aprobación) · 2026-07-03
-- Expand-only, aditivo, idempotente. Aplicable con pooler (DATABASE_URL) —
-- NO requiere prisma migrate. Acceso desde lib/db/credit-requests.db.ts (raw SQL,
-- fuera de schema.prisma, mismo patrón que Store.benefits/cover/hoursJson).

-- 1) Solicitudes de aumento/otorgamiento de línea de fiado del vecino.
CREATE TABLE IF NOT EXISTS "CreditRequest" (
  "id"              TEXT PRIMARY KEY,
  "tenantId"        TEXT NOT NULL,
  "customerId"      TEXT NOT NULL,               -- Customer.phone
  "customerName"    TEXT,
  "requestedAmount" NUMERIC(12,2),               -- monto pedido (nullable = "lo que se pueda")
  "reason"          TEXT,
  "status"          TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | APPROVED | REJECTED
  "approvedLimit"   NUMERIC(12,2),               -- línea otorgada al aprobar
  "decidedBy"       TEXT,                        -- username del admin
  "decisionNote"    TEXT,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "decidedAt"       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "CreditRequest_tenant_status_idx"
  ON "CreditRequest" ("tenantId", "status");
CREATE INDEX IF NOT EXISTS "CreditRequest_tenant_customer_idx"
  ON "CreditRequest" ("tenantId", "customerId");

-- 2) Override manual de la línea de crédito. Cuando el dueño aprueba un monto,
--    el scoring engine debe HONRARLO y no pisarlo con el límite derivado del
--    score. `updateCreditProfile` lee esta columna (raw SQL) y usa
--    max(scoreLimit, manualCreditLimit).
ALTER TABLE "CreditProfile"
  ADD COLUMN IF NOT EXISTS "manualCreditLimit" NUMERIC(12,2);
