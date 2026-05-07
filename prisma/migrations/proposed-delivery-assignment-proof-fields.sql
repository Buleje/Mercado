-- Migration: agregar proofPhotoUrl + routeStartedAt a DeliveryAssignment
-- Sprint 3 — auto-flow delivery con foto de prueba
-- Patrón: expand puro (nullable, sin default), zero downtime.
-- Aplicar con DIRECT_URL (puerto 5432), NO con pgBouncer.

ALTER TABLE "DeliveryAssignment"
  ADD COLUMN IF NOT EXISTS "routeStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "proofPhotoUrl"  TEXT;
