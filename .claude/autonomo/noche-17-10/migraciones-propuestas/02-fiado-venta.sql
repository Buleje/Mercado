-- 02 · El fiado sabe de qué venta salió
-- Ventas M27 (recibo y devolución exactos del fiado). PROPUESTA 17-10 — SIN APLICAR.
--
-- Hoy: "Fiado" no guarda la venta; la relación se adivina por la descripción y la hora.
-- Una devolución de una venta fiada no sabe qué fiado bajar.
--
-- EXPAND puro: columna nullable + índice (sólo metadatos en PG11+, sin reescritura).
-- Sin FK a "Sale" (tabla caliente, relación a nivel de app). Idempotente.
-- MIGRATE: los fiados viejos quedan en null — la descripción NO permite backfill confiable
--   (medido en la sesión: 30 fiados existentes; ninguno trae el id de la venta). No inventar.
-- CONTRACT: nada.
--
-- DB class: lib/db/fiados.db.ts — create(tenantId, {…, saleId?}); porVenta(tenantId, saleId).
-- Ruta: POST /api/sales lo llena al crear el fiado (misma tx); devoluciones bajan el fiado por saleId.
-- Pantalla: fiado › «Venta de origen» con enlace; recibo del fiado con las líneas reales.
--
-- Aplicar: igual que 01, carpeta 20261017_fiado_sale_id.
-- Revertir: quitar la columna "saleId" de "Fiado" a mano (se pierde sólo el vínculo).
--
-- prisma/schema.prisma, dentro de model Fiado:
--   saleId      String?
--   @@index([tenantId, saleId])

ALTER TABLE "Fiado" ADD COLUMN IF NOT EXISTS "saleId" TEXT;

CREATE INDEX IF NOT EXISTS "Fiado_tenantId_saleId_idx" ON "Fiado"("tenantId", "saleId");
