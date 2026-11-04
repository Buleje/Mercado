-- 04 · Por pagar: documento del proveedor, moneda, adjunto y fecha prometida
-- Compras C41 (factura repetida) · C42 (moneda/emisor/adjunto) · C45 (promesa y responsable).
-- PROPUESTA 17-10 — SIN APLICAR. Dinero: reviewer antes del merge.
--
-- Hoy: serie y número viven como texto dentro de la referencia (lib/compras/referencia-documento.ts);
-- la «factura repetida» se revisa en código y dos guardados a la vez pueden pasar los dos.
-- Mover el vencimiento pisa la fecha original sin rastro.
--
-- EXPAND puro: columnas nullable o con default constante (sólo metadatos). "Payable" tiene
-- 0 filas en la base (medido 17-10): el único parcial no puede chocar con nada existente.
-- Estados en el código: pendiente | parcial | pagado | cancelado.
-- MIGRATE: referencia-documento.ts pasa a ESCRIBIR estas columnas (y seguir leyendo el texto viejo
--   como respaldo hasta que no quede ninguno). CONTRACT (otra sesión): dejar de parsear el texto.
--
-- DB class: lib/db/cuentas-por-pagar.db.ts y lib/db/por-pagar.db.ts — create/update aceptan los campos;
--   moverVencimiento(tenantId, id, {fechaPrometida, motivo}) guarda vencimientoOriginal la 1.ª vez.
--   El P2002 del único se traduce a «Esa factura ya está registrada para este proveedor».
-- Rutas: POST/PATCH /api/payables (+ Zod safeParse de los campos) — requireAdmin(req, ["tienda_owner","admin","encargado"]).
-- Pantalla: Por pagar › alta y detalle (tipo/serie/número/RUC emisor, moneda, adjunto, «prometido para»).
--
-- Aplicar: igual que 01, carpeta 20261017_payable_documento.
-- Revertir: quitar el índice único parcial y las 9 columnas a mano (con 0 filas no se pierde nada).
--
-- prisma/schema.prisma, dentro de model Payable:
--   documentoTipo       String?     /// factura | boleta | recibo_honorarios | nota_venta | otro
--   documentoSerie      String?
--   documentoNumero     String?
--   emisorRuc           String?
--   moneda              String      @default("PEN")
--   adjuntoUrl          String?
--   vencimientoOriginal DateTime?
--   fechaPrometida      DateTime?
--   responsableId       String?
--   @@index([tenantId, fechaPrometida])
--   (el único parcial vive sólo en la base)

ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "documentoTipo" TEXT;
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "documentoSerie" TEXT;
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "documentoNumero" TEXT;
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "emisorRuc" TEXT;
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "moneda" TEXT NOT NULL DEFAULT 'PEN';
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "adjuntoUrl" TEXT;
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "vencimientoOriginal" TIMESTAMP(3);
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "fechaPrometida" TIMESTAMP(3);
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "responsableId" TEXT;

CREATE INDEX IF NOT EXISTS "Payable_tenantId_fechaPrometida_idx"
  ON "Payable"("tenantId", "fechaPrometida");

-- La misma factura del mismo proveedor no entra dos veces (salvo cancelada). Cierra la carrera en la base.
CREATE UNIQUE INDEX IF NOT EXISTS "Payable_documento_vivo_key"
  ON "Payable"("tenantId", "supplierId", "documentoTipo", "documentoSerie", "documentoNumero")
  WHERE "documentoNumero" IS NOT NULL AND "status" <> 'cancelado';
