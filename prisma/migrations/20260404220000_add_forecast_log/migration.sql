-- Migration: add_forecast_log
-- Tabla de registro de predicciones de demanda por SKU para el motor de AI Forecasting.
-- También extiende el enum PurchaseStatus con el valor auto_generated.

-- Extender enum PurchaseStatus para POs generadas por AI Forecasting
ALTER TYPE "PurchaseStatus" ADD VALUE IF NOT EXISTS 'auto_generated';

CREATE TABLE "ForecastLog" (
    "id"           TEXT NOT NULL,
    "tenantId"     TEXT NOT NULL,
    "productId"    INTEGER NOT NULL,
    "predictedQty" DOUBLE PRECISION NOT NULL,
    "actualQty"    DOUBLE PRECISION,
    "confidence"   DOUBLE PRECISION NOT NULL,
    "trend"        TEXT NOT NULL,
    "daysAhead"    INTEGER NOT NULL,
    "forecastDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForecastLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ForecastLog_tenantId_productId_idx" ON "ForecastLog"("tenantId", "productId");
CREATE INDEX "ForecastLog_forecastDate_idx"        ON "ForecastLog"("forecastDate");

ALTER TABLE "ForecastLog"
    ADD CONSTRAINT "ForecastLog_productId_fkey"
    FOREIGN KEY ("productId")
    REFERENCES "Product"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
