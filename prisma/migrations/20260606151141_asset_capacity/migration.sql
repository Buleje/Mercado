-- Capacidad operativa por día para utilización (Brandon 2026-06-06). Aditivo.
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "capacityPerDay" INTEGER DEFAULT 8;
