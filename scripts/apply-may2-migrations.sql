-- Apply 4 pending migrations from May 2, 2026
-- ============================================
--
-- Run this in Supabase SQL Editor:
--   https://supabase.com/dashboard/project/sofkgguriggocouiuamx/sql/new
--
-- Bypasses the local DIRECT_URL/DNS issue (WSL can't resolve
-- db.sofkgguriggocouiuamx.supabase.co) and pgBouncer transaction
-- mode (incompatible with `prisma migrate deploy`).
--
-- All statements use IF NOT EXISTS guards — safe to run multiple times.
-- After running, mark them as applied in _prisma_migrations:
--   the script does that at the bottom so `prisma migrate status`
--   reflects reality.
--
-- ============================================
-- 1️⃣ 20260502100000_add_delivery_sos_alert
-- ============================================

CREATE TABLE IF NOT EXISTS "DeliverySOSAlert" (
  "id"         TEXT NOT NULL,
  "partnerId"  TEXT NOT NULL,
  "lat"        DOUBLE PRECISION NOT NULL,
  "lng"        DOUBLE PRECISION NOT NULL,
  "message"    TEXT,
  "status"     TEXT NOT NULL DEFAULT 'active',
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "DeliverySOSAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DeliverySOSAlert_partnerId_idx" ON "DeliverySOSAlert"("partnerId");
CREATE INDEX IF NOT EXISTS "DeliverySOSAlert_status_idx"    ON "DeliverySOSAlert"("status");

-- ============================================
-- 2️⃣ 20260502110000_add_delivery_partner_score
-- ============================================

ALTER TABLE "DeliveryPartner"
  ADD COLUMN IF NOT EXISTS "score" INTEGER NOT NULL DEFAULT 0;

-- ============================================
-- 3️⃣ 20260502120000_add_payment_approval
-- ============================================

CREATE TABLE IF NOT EXISTS "PaymentApproval" (
  "id"              TEXT NOT NULL,
  "conversationId"  TEXT,
  "customerPhone"   TEXT NOT NULL,
  "expectedAmount"  DECIMAL(12,2) NOT NULL,
  "detectedAmount"  DECIMAL(12,2),
  "imageUrl"        TEXT NOT NULL,
  "visionResponse"  JSONB,
  "yapeOpCode"      TEXT,
  "yapeLast4"       TEXT,
  "yapeDate"        TIMESTAMP(3),
  "status"          TEXT NOT NULL DEFAULT 'pending',
  "rejectionReason" TEXT,
  "reviewedBy"      TEXT,
  "reviewedAt"      TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentApproval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PaymentApproval_status_idx"        ON "PaymentApproval"("status");
CREATE INDEX IF NOT EXISTS "PaymentApproval_customerPhone_idx" ON "PaymentApproval"("customerPhone");
CREATE INDEX IF NOT EXISTS "PaymentApproval_createdAt_idx"     ON "PaymentApproval"("createdAt");

-- ============================================
-- 4️⃣ 20260502130000_add_payment_approval_link
-- ============================================

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "paymentApprovalId" TEXT;

CREATE INDEX IF NOT EXISTS "Order_paymentApprovalId_idx"
  ON "Order"("paymentApprovalId");

CREATE INDEX IF NOT EXISTS "PaymentApproval_conversationId_idx"
  ON "PaymentApproval"("conversationId");

-- ============================================
-- Mark migrations as applied in _prisma_migrations
-- ============================================
-- Idempotent: only inserts a row if the migration name isn't already there.

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
SELECT gen_random_uuid()::text,
       'manual-sql-editor-apply-2026-05-02',
       NOW(),
       '20260502100000_add_delivery_sos_alert',
       NULL, NULL, NOW(), 1
WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20260502100000_add_delivery_sos_alert');

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
SELECT gen_random_uuid()::text,
       'manual-sql-editor-apply-2026-05-02',
       NOW(),
       '20260502110000_add_delivery_partner_score',
       NULL, NULL, NOW(), 1
WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20260502110000_add_delivery_partner_score');

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
SELECT gen_random_uuid()::text,
       'manual-sql-editor-apply-2026-05-02',
       NOW(),
       '20260502120000_add_payment_approval',
       NULL, NULL, NOW(), 1
WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20260502120000_add_payment_approval');

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
SELECT gen_random_uuid()::text,
       'manual-sql-editor-apply-2026-05-02',
       NOW(),
       '20260502130000_add_payment_approval_link',
       NULL, NULL, NOW(), 1
WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20260502130000_add_payment_approval_link');

-- ============================================
-- Verify (optional — run separately to confirm)
-- ============================================
-- SELECT to_regclass('public."PaymentApproval"') AS payment_approval_tbl,
--        to_regclass('public."DeliverySOSAlert"') AS sos_alert_tbl,
--        EXISTS (SELECT 1 FROM information_schema.columns
--                WHERE table_name = 'DeliveryPartner' AND column_name = 'score') AS partner_score_col,
--        EXISTS (SELECT 1 FROM information_schema.columns
--                WHERE table_name = 'Order' AND column_name = 'paymentApprovalId') AS order_payment_link_col;
