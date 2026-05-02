-- Migration: add_delivery_sos_alert
-- Tabla para alertas SOS emitidas por los repartidores desde la app móvil.

CREATE TABLE "DeliverySOSAlert" (
  "id"         TEXT        NOT NULL,
  "partnerId"  TEXT        NOT NULL,
  "lat"        DOUBLE PRECISION NOT NULL,
  "lng"        DOUBLE PRECISION NOT NULL,
  "message"    TEXT,
  "status"     TEXT        NOT NULL DEFAULT 'active',
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),

  CONSTRAINT "DeliverySOSAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeliverySOSAlert_partnerId_idx" ON "DeliverySOSAlert"("partnerId");
CREATE INDEX "DeliverySOSAlert_status_idx"    ON "DeliverySOSAlert"("status");
