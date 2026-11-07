-- ADR-512 — «Pedir corrección» de una guía EMITIDA: el pedido ordenado llega a
-- la bandeja de soporte del superadmin (SupportTicket).
--
-- EXPAND puro: 7 columnas nuevas (una NOT NULL con default constante, metadata
-- sólo en PG 11+) y 3 índices. Ninguna fila existente cambia: todas quedan
-- kind = 'general'. El Prisma viejo de producción no lee estas columnas y sus
-- INSERT toman el default. La tabla tenía 0 filas al 23-10 (CREATE INDEX normal,
-- sin CONCURRENTLY: no hay nada que bloquear).
-- Revertir (sólo si nadie usa la solicitud): quitar los 3 índices y las 7 columnas.
--
-- Aplicar: node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/20261023a_soporte_correccion_guia_adr512/migration.sql dotenv_config_path=.env.local

ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'general';
ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "entityType" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "entityId" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "detalle" JSONB;
ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "resolucion" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "resolvedBy" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "SupportTicket_tenantId_kind_createdAt_idx" ON "SupportTicket"("tenantId", "kind", "createdAt");
CREATE INDEX IF NOT EXISTS "SupportTicket_tenantId_entityType_entityId_idx" ON "SupportTicket"("tenantId", "entityType", "entityId");
CREATE INDEX IF NOT EXISTS "SupportTicket_kind_status_createdAt_idx" ON "SupportTicket"("kind", "status", "createdAt");
