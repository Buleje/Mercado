-- Migration: add_socio_buleje_membership
-- ADR-078 — Socio Buleje programa de membresía + cashback ledger.
--
-- Fase expand-only (ADR-020 pattern). Tres tablas brand-new + 4 enums.
-- Zero-downtime: ningún modelo existente se toca. La app sigue leyendo el mock
-- hasta que se flipee el feature flag `socio.prismaEnabled`.
--
-- Cómo aplicar:
--   DATABASE_URL="$DIRECT_URL" npm run db:migrate
-- (pgBouncer no soporta CREATE TYPE — requiere conexión directa de Supabase)
--
-- Rollback (expand):
--   DROP TABLE "socio_cashback_entries";
--   DROP TABLE "socio_billing_cycles";
--   DROP TABLE "socio_memberships";
--   DROP TYPE "CashbackEntryType";
--   DROP TYPE "BillingCycleStatus";
--   DROP TYPE "SocioStatus";
--   DROP TYPE "SocioPlan";

-- ─── Enums ────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "SocioPlan" AS ENUM ('monthly', 'annual');

-- CreateEnum
CREATE TYPE "SocioStatus" AS ENUM ('trial', 'active', 'past_due', 'paused', 'cancelled');

-- CreateEnum
CREATE TYPE "BillingCycleStatus" AS ENUM ('pending', 'paid', 'failed', 'waived');

-- CreateEnum
CREATE TYPE "CashbackEntryType" AS ENUM ('earned', 'redeemed', 'expired', 'bonus', 'adjustment');

-- ─── Table: socio_memberships ─────────────────────────────────────────

-- CreateTable
CREATE TABLE "socio_memberships" (
    "id"                  TEXT NOT NULL,
    "tenantId"            TEXT NOT NULL,
    "userId"              TEXT NOT NULL,
    "plan"                "SocioPlan" NOT NULL,
    "status"              "SocioStatus" NOT NULL,
    "startedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd"    TIMESTAMP(3) NOT NULL,
    "trialEndsAt"         TIMESTAMP(3),
    "cancelledAt"         TIMESTAMP(3),
    "cancelReason"        TEXT,
    "cancelAtPeriodEnd"   BOOLEAN NOT NULL DEFAULT false,
    "autoRenew"           BOOLEAN NOT NULL DEFAULT true,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,

    CONSTRAINT "socio_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique per (tenantId, userId) — una membership por par
CREATE UNIQUE INDEX "socio_memberships_tenantId_userId_key"
    ON "socio_memberships" ("tenantId", "userId");

-- CreateIndex: admin "miembros activos" queries
CREATE INDEX "socio_memberships_tenantId_status_idx"
    ON "socio_memberships" ("tenantId", "status");

-- CreateIndex: cron diario "a renovar próximamente"
CREATE INDEX "socio_memberships_tenantId_currentPeriodEnd_status_idx"
    ON "socio_memberships" ("tenantId", "currentPeriodEnd", "status");

-- CreateIndex: cron "no renovar al fin de periodo"
CREATE INDEX "socio_memberships_tenantId_cancelAtPeriodEnd_idx"
    ON "socio_memberships" ("tenantId", "cancelAtPeriodEnd");

-- ─── Table: socio_billing_cycles ──────────────────────────────────────

-- CreateTable
CREATE TABLE "socio_billing_cycles" (
    "id"             TEXT NOT NULL,
    "membershipId"   TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "periodStart"    TIMESTAMP(3) NOT NULL,
    "periodEnd"      TIMESTAMP(3) NOT NULL,
    "amountSoles"    DECIMAL(10,2) NOT NULL,
    "status"         "BillingCycleStatus" NOT NULL,
    "paidAt"         TIMESTAMP(3),
    "invoiceId"      TEXT,
    "failureReason"  TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "socio_billing_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: listar ciclos de una membership
CREATE INDEX "socio_billing_cycles_tenantId_membershipId_idx"
    ON "socio_billing_cycles" ("tenantId", "membershipId");

-- CreateIndex: cron "a cobrar hoy" / reportes de cobros fallidos
CREATE INDEX "socio_billing_cycles_tenantId_periodEnd_status_idx"
    ON "socio_billing_cycles" ("tenantId", "periodEnd", "status");

-- AddForeignKey: cascade cleanup si se borra membership
ALTER TABLE "socio_billing_cycles"
    ADD CONSTRAINT "socio_billing_cycles_membershipId_fkey"
    FOREIGN KEY ("membershipId") REFERENCES "socio_memberships"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Table: socio_cashback_entries ────────────────────────────────────
-- Ledger append-only. Nunca UPDATE/DELETE desde app code. Correcciones
-- via nueva fila type=adjustment.

-- CreateTable
CREATE TABLE "socio_cashback_entries" (
    "id"            TEXT NOT NULL,
    "membershipId"  TEXT NOT NULL,
    "tenantId"      TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "orderId"       TEXT,
    "type"          "CashbackEntryType" NOT NULL,
    "amountSoles"   DECIMAL(10,2) NOT NULL,
    "description"   TEXT NOT NULL,
    "balanceAfter"  DECIMAL(10,2) NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "socio_cashback_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: historial por usuario (hot path del dashboard)
CREATE INDEX "socio_cashback_entries_tenantId_userId_createdAt_idx"
    ON "socio_cashback_entries" ("tenantId", "userId", "createdAt");

-- CreateIndex: reporting por tipo (MRR, redemptions, expired)
CREATE INDEX "socio_cashback_entries_tenantId_membershipId_type_idx"
    ON "socio_cashback_entries" ("tenantId", "membershipId", "type");

-- CreateIndex: lookup por orden (attribution + refund flows)
CREATE INDEX "socio_cashback_entries_tenantId_orderId_idx"
    ON "socio_cashback_entries" ("tenantId", "orderId");

-- AddForeignKey
ALTER TABLE "socio_cashback_entries"
    ADD CONSTRAINT "socio_cashback_entries_membershipId_fkey"
    FOREIGN KEY ("membershipId") REFERENCES "socio_memberships"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
