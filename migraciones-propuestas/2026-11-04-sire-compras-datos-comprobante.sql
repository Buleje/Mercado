-- ============================================================================
-- PROPUESTA (NO APLICADA) · ADR-532 · SIRE compras (RCE): datos del comprobante
-- del proveedor guardados en la compra y en el gasto.
-- 2026-11-04 · architect (noche autónoma). Diseño completo:
--   .claude/autonomo/noche-04-11/sire-compras-diseno.md
--
-- QUÉ HACE
--   Agrega 14 columnas NULLABLE y SIN DEFAULT a dos tablas que ya existen.
--   · "PurchaseOrder" (9, prefijo invoice*): lo que dice el papel del proveedor.
--       fecha de emisión (RCE 5) · RUC/DNI del emisor (12-13) · moneda (26) ·
--       tipo de cambio (27) · base gravada (15) · IGV (16) · no gravado (21) ·
--       otros tributos (24) · total del comprobante (25). Montos EN SOLES.
--   · "Expense" (5, prefijo document*): fecha de emisión (5) · moneda (26) ·
--       tipo de cambio (27) · no gravado (21) · código de tipo SUNAT (7).
--       IGV, número, tipo y RUC del gasto YA existen (ADR-374): no se duplican.
--   Sin enums nuevos, sin índices, sin UPDATE, sin NOT NULL, sin CHECK: el Prisma
--   viejo de producción no conoce estas columnas y no las selecciona; sigue igual.
--   ADD COLUMN nullable sin default = solo catálogo en Postgres 11+ (no reescribe
--   la tabla); el candado dura milisegundos y lock_timeout corta si hay cola.
--   Idempotente: la 2.ª corrida no cambia nada («0 nuevas»).
--   Textos en TEXT (convención del repo: String de Prisma sin @db.VarChar); el
--   largo lo controla Zod en la ruta.
--
-- CÓMO APLICARLO (skill migrar-esquema; NUNCA migrate dev / db push / DIRECT_URL)
--   0. OK de Brandon: prisma/schema.prisma es zona de peligro (base = producción).
--   1. Copiar este archivo a
--        prisma/migrations/20261104a_sire_compras_comprobante_adr532/migration.sql
--      y agregar los 14 campos a prisma/schema.prisma (bloque en el diseño, §a).
--   2. Ensayo (termina en ROLLBACK y verifica las 14 columnas que declara):
--        node -r dotenv/config scripts/aplicar-migracion-sesion.mjs \
--          prisma/migrations/20261104a_sire_compras_comprobante_adr532/migration.sql \
--          --ensayo dotenv_config_path=.env.local
--   3. Aplicar: el mismo comando sin --ensayo. Repetirlo debe decir «0 nuevas».
--   4. Cruzar:  node scripts/migraciones-cruce.mjs --verificar 20261104a_sire_compras_comprobante_adr532
--   5. Marcar:  node scripts/prisma-session.mjs migrate resolve --applied 20261104a_sire_compras_comprobante_adr532
--   6. npx prisma generate  y reiniciar el dev server (el vivo sigue con el cliente viejo).
--   (Sin verificar: que el script acepte el SET LOCAL de abajo. Si se queja, borrar
--    esa línea: el resto no la necesita.)
--
-- CÓMO REVERTIRLO
--   a) Si NINGÚN código desplegado trae estos campos en su cliente Prisma: correr el
--      bloque «REVERTIR» del final (está comentado; DROP COLUMN IF EXISTS).
--   b) Si producción YA desplegó un Prisma con estos campos: primero sacarlos de
--      schema.prisma y desplegar; recién después el DROP. Al revés, todo SELECT de
--      PurchaseOrder/Expense en producción cae con P2022 «column does not exist».
--   Lo escrito en estas columnas se pierde con el DROP: exportarlo antes.
-- ============================================================================

SET LOCAL lock_timeout = '5s';

-- ── PurchaseOrder: el papel del proveedor (la orden ya guarda invoiceNumber e invoiceType) ──
-- RCE 5: fecha IMPRESA en el comprobante. DATE (solo día): sin hora ni zona, no se corre a mañana en Lima.
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "invoiceDate" DATE;
-- RCE 12-13: RUC (11) o DNI (8) del emisor tal como sale en el papel. Foto: no cambia si se edita el proveedor.
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "invoiceSupplierDoc" TEXT;
-- RCE 26: moneda del comprobante, ISO 4217 (PEN, USD). Los montos de abajo van SIEMPRE en soles.
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "invoiceCurrency" TEXT;
-- RCE 27: soles por 1 unidad (venta SUNAT). 4 decimales para no perder lo escrito; el RCE lo saca con 3.
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "invoiceExchangeRate" DECIMAL(8,4);
-- RCE 15: base imponible gravada (destinada a operaciones gravadas), en soles.
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "invoiceTaxableBase" DECIMAL(12,2);
-- RCE 16: IGV del papel, en soles.
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "invoiceIgv" DECIMAL(12,2);
-- RCE 21: exonerado + inafecto (compras dentro de la Amazonía), en soles.
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "invoiceNonTaxable" DECIMAL(12,2);
-- RCE 24 (y 22-23 hasta separarlos): ISC, ICBPER y otros tributos del papel, en soles.
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "invoiceOtherTaxes" DECIMAL(12,2);
-- RCE 25: total del COMPROBANTE en soles. No es "total" de la orden: la orden deja fuera líneas
-- quitadas o sin producto, y suma flete/descuento propios.
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "invoiceTotal" DECIMAL(12,2);

-- ── Expense: completa lo que ADR-374 ya trajo (documentType, documentNumber, supplierRuc, igvAmount) ──
-- RCE 5: fecha impresa en la boleta/factura del gasto ("date" es el día del gasto, puede no coincidir).
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "documentDate" DATE;
-- RCE 26-27: moneda y tipo de cambio ("amount" sigue en soles).
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "documentCurrency" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "documentExchangeRate" DECIMAL(8,4);
-- RCE 21: parte exonerada/inafecta. Base gravada = amount - igvAmount - documentNonTaxable.
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "documentNonTaxable" DECIMAL(12,2);
-- RCE 7: código Tabla 11 cuando el tipo en texto no alcanza ("ticket" = 12, recibo de luz/agua = 14, otro = 00).
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "documentTypeCode" TEXT;

-- ── REVERTIR (solo en el caso a) de arriba; está comentado a propósito) ──
-- ALTER TABLE "PurchaseOrder" DROP COLUMN IF EXISTS "invoiceDate";
-- ALTER TABLE "PurchaseOrder" DROP COLUMN IF EXISTS "invoiceSupplierDoc";
-- ALTER TABLE "PurchaseOrder" DROP COLUMN IF EXISTS "invoiceCurrency";
-- ALTER TABLE "PurchaseOrder" DROP COLUMN IF EXISTS "invoiceExchangeRate";
-- ALTER TABLE "PurchaseOrder" DROP COLUMN IF EXISTS "invoiceTaxableBase";
-- ALTER TABLE "PurchaseOrder" DROP COLUMN IF EXISTS "invoiceIgv";
-- ALTER TABLE "PurchaseOrder" DROP COLUMN IF EXISTS "invoiceNonTaxable";
-- ALTER TABLE "PurchaseOrder" DROP COLUMN IF EXISTS "invoiceOtherTaxes";
-- ALTER TABLE "PurchaseOrder" DROP COLUMN IF EXISTS "invoiceTotal";
-- ALTER TABLE "Expense" DROP COLUMN IF EXISTS "documentDate";
-- ALTER TABLE "Expense" DROP COLUMN IF EXISTS "documentCurrency";
-- ALTER TABLE "Expense" DROP COLUMN IF EXISTS "documentExchangeRate";
-- ALTER TABLE "Expense" DROP COLUMN IF EXISTS "documentNonTaxable";
-- ALTER TABLE "Expense" DROP COLUMN IF EXISTS "documentTypeCode";
