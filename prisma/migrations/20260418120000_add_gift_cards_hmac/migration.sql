-- ═══════════════════════════════════════════════════════════════════════════
-- ADR-077 — Gift Cards Buleje: HMAC-hashed codes + redemption ledger
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Expand-only migration (additive). NO DROPs, NO NOT NULL retro sobre tablas
-- existentes. Se puede aplicar en prod sin downtime.
--
-- CÓDIGOS PLANOS NUNCA SE PERSISTEN. Solo HMAC-SHA256(code, AUTH_SECRET).
--
-- Nota sobre CREATE INDEX CONCURRENTLY:
--   * Prisma NO soporta nativamente CONCURRENTLY dentro de migrations gestionadas,
--     pero sí las detecta y las deja pasar como statements separados.
--   * Aquí lo marcamos como TODO: al deploy en prod, ejecutar los índices
--     más pesados con `CONCURRENTLY` desde un DBA shell separado. Las tablas
--     arrancan vacías, así que el CREATE INDEX inicial es cheap.
--
-- Rollback seguro: ver docs/adr/077-gift-cards-hmac-redemption.md.
--
-- Legacy gift cards mock data to be backfilled: scripts/backfill-gift-cards.ts
-- (solo dev/staging — genera códigos NUEVOS; los mocks originales se ignoran).

-- ── Enums ──────────────────────────────────────────────────────────────────
CREATE TYPE "GiftCardDesign" AS ENUM (
  'cumpleanos',
  'navidad',
  'felicitaciones',
  'aniversario',
  'gracias',
  'anio_nuevo',
  'bienvenida',
  'general'
);

CREATE TYPE "GiftCardStatus" AS ENUM (
  'pending_delivery',
  'active',
  'fully_redeemed',
  'partially_redeemed',
  'expired',
  'cancelled'
);

-- ── gift_cards ─────────────────────────────────────────────────────────────
CREATE TABLE "gift_cards" (
  "id"              TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  "codeHash"        TEXT NOT NULL,
  "codeLast4"       TEXT NOT NULL,
  "amountSoles"     DECIMAL(10,2) NOT NULL,
  "balanceSoles"    DECIMAL(10,2) NOT NULL,
  "currency"        TEXT NOT NULL DEFAULT 'PEN',
  "design"          "GiftCardDesign" NOT NULL,
  "status"          "GiftCardStatus" NOT NULL,
  "senderName"      TEXT,
  "senderEmail"     TEXT,
  "senderUserId"    TEXT,
  "recipientName"   TEXT NOT NULL,
  "recipientEmail"  TEXT,
  "recipientPhone"  TEXT,
  "recipientUserId" TEXT,
  "dedicatoria"     TEXT,
  "expiresAt"       TIMESTAMP(3),
  "purchasedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "firstRedeemedAt" TIMESTAMP(3),
  "fullyRedeemedAt" TIMESTAMP(3),
  "cancelledAt"     TIMESTAMP(3),
  "cancelReason"    TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "gift_cards_pkey" PRIMARY KEY ("id")
);

-- Unicidad del codeHash (permite .findUnique({ where: { codeHash } }))
CREATE UNIQUE INDEX "gift_cards_codeHash_key" ON "gift_cards"("codeHash");

-- Lookup de "mis recibidas" — el filtro típico es (tenantId, recipientUserId, status)
CREATE INDEX "gift_cards_tenantId_recipientUserId_status_idx"
  ON "gift_cards"("tenantId", "recipientUserId", "status");

-- Lookup de "mis enviadas"
CREATE INDEX "gift_cards_tenantId_senderUserId_idx"
  ON "gift_cards"("tenantId", "senderUserId");

-- Filtros de admin por estado (pending_delivery, active, etc.)
CREATE INDEX "gift_cards_tenantId_status_idx"
  ON "gift_cards"("tenantId", "status");

-- Lookup rápido por codeHash aislado (fast-path para /validate y /redeem).
-- Redundante con el UNIQUE de arriba pero lo dejamos explícito para que
-- postgres elija el b-tree correcto cuando la query solo filtra por hash.
CREATE INDEX "gift_cards_codeHash_idx" ON "gift_cards"("codeHash");

-- ── gift_card_redemptions ──────────────────────────────────────────────────
CREATE TABLE "gift_card_redemptions" (
  "id"             TEXT NOT NULL,
  "giftCardId"     TEXT NOT NULL,
  "tenantId"       TEXT NOT NULL,
  "userId"         TEXT,
  "orderId"        TEXT,
  "amountRedeemed" DECIMAL(10,2) NOT NULL,
  "redeemedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gift_card_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "gift_card_redemptions_tenantId_giftCardId_idx"
  ON "gift_card_redemptions"("tenantId", "giftCardId");

CREATE INDEX "gift_card_redemptions_tenantId_userId_idx"
  ON "gift_card_redemptions"("tenantId", "userId");

CREATE INDEX "gift_card_redemptions_tenantId_redeemedAt_idx"
  ON "gift_card_redemptions"("tenantId", "redeemedAt");

-- FK con ON DELETE RESTRICT: nunca borrar una gift card que ya tiene canjes
-- (evita inconsistencia contable — se usa status='cancelled' en lugar).
ALTER TABLE "gift_card_redemptions"
  ADD CONSTRAINT "gift_card_redemptions_giftCardId_fkey"
  FOREIGN KEY ("giftCardId") REFERENCES "gift_cards"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Notas operacionales ────────────────────────────────────────────────────
-- 1) RLS: las tablas quedan sin RLS por ahora. El aislamiento por tenantId
--    se enforce en la aplicación vía lib/tenant.ts + lib/db/gift-cards.db.ts
--    (mismo patrón que Customer/Order/Coupon). Si a futuro se añade RLS,
--    replicar las políticas de 20260411000000_store_page_system/migration.sql.
--
-- 2) Backfill de mocks:
--      # dev/staging
--      node -r dotenv/config scripts/backfill-gift-cards.ts
--
-- 3) En producción, aplicar con:
--      DATABASE_URL=$DIRECT_URL npx prisma migrate deploy
--
-- 4) Rollback:
--      DROP TABLE "gift_card_redemptions";
--      DROP TABLE "gift_cards";
--      DROP TYPE "GiftCardStatus";
--      DROP TYPE "GiftCardDesign";
