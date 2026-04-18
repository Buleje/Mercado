-- Migration: add_subscription_bodega_al_mes
-- ADR-076. "Bodega al Mes" — Subscribe & Save adaptado PE.
--
-- Zero-downtime: brand-new tables with zero rows, additive only.
-- No cambios sobre Customer, Product, Order. No DROP, no ALTER de columnas existentes.
--
-- Aplicación manual (correr desde la raíz con DIRECT_URL accesible):
--     DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy
--
-- Rollback (si fuese necesario):
--     DROP TABLE "subscription_deliveries";
--     DROP TABLE "subscriptions";
--     DROP TYPE "SubscriptionStatus";
--     DROP TYPE "SubscriptionFreq";
--
-- (Comando rollback arriba es DOCUMENTACIÓN — no lo corras sin confirmar con el dueño del repo.)

-- CreateEnum: frecuencias de entrega soportadas
CREATE TYPE "SubscriptionFreq" AS ENUM ('weekly', 'biweekly', 'monthly', 'bimonthly');

-- CreateEnum: ciclo de vida de la suscripción
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'paused', 'cancelled');

-- CreateTable: Subscription (entidad mutable — plan por cliente)
CREATE TABLE "subscriptions" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "productId"      INTEGER NOT NULL,
    "frequency"      "SubscriptionFreq" NOT NULL,
    "quantity"       INTEGER NOT NULL DEFAULT 1,
    "discount"       DECIMAL(5, 4) NOT NULL DEFAULT 0.0500,
    "status"         "SubscriptionStatus" NOT NULL,
    "nextDeliveryAt" TIMESTAMP(3) NOT NULL,
    "pausedAt"       TIMESTAMP(3),
    "cancelledAt"    TIMESTAMP(3),
    "cancelReason"   TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SubscriptionDelivery (ledger append-only por cada entrega)
CREATE TABLE "subscription_deliveries" (
    "id"             TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "scheduledFor"   TIMESTAMP(3) NOT NULL,
    "deliveredAt"    TIMESTAMP(3),
    "skipped"        BOOLEAN NOT NULL DEFAULT false,
    "skipReason"     TEXT,
    "orderId"        TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: dashboard del cliente ("mis suscripciones activas")
CREATE INDEX "subscriptions_tenantId_userId_status_idx"
    ON "subscriptions" ("tenantId", "userId", "status");

-- CreateIndex: hot path del cron delivery-scheduler
-- ("suscripciones activas con entrega próxima en las siguientes N horas")
CREATE INDEX "subscriptions_tenantId_nextDeliveryAt_status_idx"
    ON "subscriptions" ("tenantId", "nextDeliveryAt", "status");

-- CreateIndex: reporting admin ("cuántas activas / pausadas / canceladas en este tenant")
CREATE INDEX "subscriptions_tenantId_status_idx"
    ON "subscriptions" ("tenantId", "status");

-- CreateIndex: histórico de entregas por suscripción
CREATE INDEX "subscription_deliveries_tenantId_subscriptionId_idx"
    ON "subscription_deliveries" ("tenantId", "subscriptionId");

-- CreateIndex: barrido por fecha programada (cron)
CREATE INDEX "subscription_deliveries_tenantId_scheduledFor_idx"
    ON "subscription_deliveries" ("tenantId", "scheduledFor");

-- AddForeignKey: cascade cuando se elimina físicamente una Subscription.
-- Nota: en el uso típico las suscripciones no se eliminan — se marcan como
-- cancelled (un estado, no un borrado). El CASCADE aplica sólo al edge case
-- de GDPR / Ley 29733 right-to-erasure.
ALTER TABLE "subscription_deliveries"
    ADD CONSTRAINT "subscription_deliveries_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId")
    REFERENCES "subscriptions"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- Nota sobre CREATE INDEX CONCURRENTLY: las tablas nuevas tienen cero filas,
-- por lo tanto CREATE INDEX (sin CONCURRENTLY) no bloquea nada y es el patrón
-- default generado por `prisma migrate deploy`. No hace falta session mode.
