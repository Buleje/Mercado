-- ============================================================
-- PROPOSED MIGRATION: Programa de Referidos
-- Archivo: prisma/migrations/proposed-referrals.sql
--
-- INSTRUCCIONES PARA BRANDON:
--   1. Revisar este SQL con tu DBA o ejecutar directamente en Supabase SQL Editor.
--   2. Luego añadir el model Referral al schema.prisma (ver bloque comentado abajo).
--   3. Correr: npx prisma db pull  (para regenerar el cliente si usas db push)
--      O bien:  npx prisma db push  (si prefieres push directo en desarrollo)
--   4. En producción: integrar al flujo de migrate deploy.
--
-- Campos Customer ya existentes (NO requieren migración):
--   - referralCode  String? @unique  (columna ya existe en Customer)
--   - referredBy    String?          (columna ya existe en Customer)
-- ============================================================

-- Tabla principal de referidos
CREATE TABLE IF NOT EXISTS "Referral" (
  "id"             TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId"       TEXT         NOT NULL,
  "referrerId"     TEXT         NOT NULL,   -- Customer.phone del que refirió
  "refereeId"      TEXT         NOT NULL,   -- Customer.phone del nuevo cliente
  "status"         TEXT         NOT NULL DEFAULT 'pending', -- 'pending' | 'rewarded'
  "rewardCouponId" TEXT,                    -- Coupon.id creado para el referrer (post-reward)
  "orderId"        TEXT,                    -- Order.id que disparó el reward
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rewardedAt"     TIMESTAMP(3),

  CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- Evita que un referee tenga más de un registro de referido por tenant
CREATE UNIQUE INDEX IF NOT EXISTS "Referral_tenantId_refereeId_key"
  ON "Referral"("tenantId", "refereeId");

-- Índices de consulta frecuente
CREATE INDEX IF NOT EXISTS "Referral_tenantId_idx"
  ON "Referral"("tenantId");

CREATE INDEX IF NOT EXISTS "Referral_referrerId_idx"
  ON "Referral"("tenantId", "referrerId");

CREATE INDEX IF NOT EXISTS "Referral_status_idx"
  ON "Referral"("tenantId", "status");

-- ============================================================
-- BLOQUE PRISMA SCHEMA (copiar a prisma/schema.prisma):
-- ============================================================
--
-- model Referral {
--   id             String    @id @default(cuid())
--   tenantId       String
--   referrerId     String    // Customer.phone del que refirió
--   refereeId      String    // Customer.phone del nuevo cliente
--   status         String    @default("pending") // pending | rewarded
--   rewardCouponId String?   // Coupon.id creado para el referrer
--   orderId        String?   // Order.id que disparó el reward
--   createdAt      DateTime  @default(now())
--   rewardedAt     DateTime?
--
--   @@unique([tenantId, refereeId])
--   @@index([tenantId])
--   @@index([tenantId, referrerId])
--   @@index([tenantId, status])
-- }
-- ============================================================
