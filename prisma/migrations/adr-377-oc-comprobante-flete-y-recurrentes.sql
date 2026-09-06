-- ADR-377 — La orden de compra guarda el papel, el flete y su recurrencia.
--
-- Tres huecos medidos en la pestaña de Órdenes (2026-08-11):
--
-- 1. No había dónde anotar la factura del proveedor: el vínculo con SUNAT y el
--    crédito fiscal no existía en el sistema.
-- 2. El costo del producto ignoraba el flete. El arroz "cuesta" 19.50 pero
--    llegó con S/40 de mototaxi repartidos entre 20 bolsas: el costo real es
--    21.50 y el margen que muestra el sistema es 2 soles optimista.
-- 3. Los pedidos recurrentes vivían en localStorage: se perdían al cambiar de
--    equipo y su "avisame 2 días antes" no lo leía nadie.
--
-- Todo nullable o con default → expand-safe, sin downtime, sin backfill.
-- Idempotente: se puede correr dos veces.

-- ── 1. El comprobante del proveedor ────────────────────────────────────────
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "invoiceNumber" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "invoiceType" TEXT;

-- ¿El costo unitario cargado YA incluye IGV? En bodega el precio de lista del
-- proveedor casi siempre lo incluye, así que ese es el default.
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "igvIncluded" BOOLEAN NOT NULL DEFAULT true;

-- ── 2. Los costos que no van en el precio de la mercadería ─────────────────
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "flete" DECIMAL(12,2) DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "otrosCostos" DECIMAL(12,2) DEFAULT 0;

-- ── 3. Cuándo llegó de verdad y quién la manejó ────────────────────────────
-- `deliveryDate` ya existía = la fecha PROMETIDA. Esta es la real.
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "receivedDate" TIMESTAMP(3);
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "receivedBy" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;

-- Buscar una orden por el número de factura del proveedor.
CREATE INDEX IF NOT EXISTS "PurchaseOrder_tenantId_invoiceNumber_idx"
  ON "PurchaseOrder" ("tenantId", "invoiceNumber");

-- ── 4. Los pedidos recurrentes salen del localStorage ──────────────────────
CREATE TABLE IF NOT EXISTS "RecurringPurchaseOrder" (
  "id"               TEXT NOT NULL,
  "tenantId"         TEXT NOT NULL,
  "supplierId"       TEXT NOT NULL,
  "supplierName"     TEXT NOT NULL,
  -- Los items del pedido tal como se repiten: [{productId,name,quantity,unitCost,unit}]
  "itemsJson"        JSONB NOT NULL,
  "intervalDays"     INTEGER NOT NULL DEFAULT 15,
  "nextDate"         TIMESTAMP(3) NOT NULL,
  "notifyDaysBefore" INTEGER NOT NULL DEFAULT 2,
  "paymentMethod"    TEXT,
  "active"           BOOLEAN NOT NULL DEFAULT true,
  "lastGeneratedAt"  TIMESTAMP(3),
  "lastOrderId"      TEXT,
  "notes"            TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecurringPurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- El aviso pregunta "¿qué toca pronto?": tenant + fecha, sólo los activos.
CREATE INDEX IF NOT EXISTS "RecurringPurchaseOrder_tenantId_nextDate_idx"
  ON "RecurringPurchaseOrder" ("tenantId", "nextDate");
CREATE INDEX IF NOT EXISTS "RecurringPurchaseOrder_tenantId_supplierId_idx"
  ON "RecurringPurchaseOrder" ("tenantId", "supplierId");

-- Borrar el proveedor se lleva sus recurrencias: un pedido repetido a nadie
-- no significa nada.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RecurringPurchaseOrder_supplierId_fkey'
  ) THEN
    ALTER TABLE "RecurringPurchaseOrder"
      ADD CONSTRAINT "RecurringPurchaseOrder_supplierId_fkey"
      FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
