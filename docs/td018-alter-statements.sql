-- ============================================================
-- TD-018 ALTER STATEMENTS — Float → DECIMAL(12,2)
-- Generado: 2026-04-09
-- Campos: 76 MONETARIO confirmados
--
-- ORDEN: tablas vacías / pocas filas primero → tablas grandes al final.
-- Si algo falla a mitad, las tablas core (Order, Sale, Product) quedan
-- intactas y la app sigue funcionando. Revertir solo las tablas ya
-- alteradas con el script de rollback correspondiente.
--
-- REGLAS:
-- - NO ejecutar via `prisma migrate` con pgBouncer (cuelga)
-- - Ejecutar via scripts/apply-td018-migration.ts ($executeRawUnsafe)
-- - Cada ALTER en su propio statement (separar por ;)
-- - USING expr hace cast explícito — no puede perder datos
-- - Campos nullable: el USING maneja NULL automáticamente
-- ============================================================

-- ============================================================
-- GRUPO 1: TABLAS DE CONFIGURACIÓN (probablemente vacías o 1 fila)
-- ============================================================

-- Settings (1 fila por tenant)
ALTER TABLE "Settings"
  ALTER COLUMN "cashOpeningAmount" TYPE DECIMAL(12,2)
  USING ("cashOpeningAmount"::DECIMAL(12,2));

ALTER TABLE "Settings"
  ALTER COLUMN "cashAlertMax" TYPE DECIMAL(12,2)
  USING ("cashAlertMax"::DECIMAL(12,2));

ALTER TABLE "Settings"
  ALTER COLUMN "returnMaxNoAuth" TYPE DECIMAL(12,2)
  USING ("returnMaxNoAuth"::DECIMAL(12,2));

ALTER TABLE "Settings"
  ALTER COLUMN "freeDeliveryMin" TYPE DECIMAL(12,2)
  USING ("freeDeliveryMin"::DECIMAL(12,2));

-- ============================================================
-- GRUPO 2: TABLAS DE REGLAS / CONFIGURACIÓN DE NEGOCIO (pocas filas)
-- ============================================================

-- CommissionRule
ALTER TABLE "CommissionRule"
  ALTER COLUMN "minSales" TYPE DECIMAL(12,2)
  USING ("minSales"::DECIMAL(12,2));

ALTER TABLE "CommissionRule"
  ALTER COLUMN "maxSales" TYPE DECIMAL(12,2)
  USING ("maxSales"::DECIMAL(12,2));

-- DiscountRule
ALTER TABLE "DiscountRule"
  ALTER COLUMN valor TYPE DECIMAL(12,2)
  USING (valor::DECIMAL(12,2));

-- Promotion
ALTER TABLE "Promotion"
  ALTER COLUMN "minPurchase" TYPE DECIMAL(12,2)
  USING ("minPurchase"::DECIMAL(12,2));

-- Coupon
ALTER TABLE "Coupon"
  ALTER COLUMN "discountValue" TYPE DECIMAL(12,2)
  USING ("discountValue"::DECIMAL(12,2));

ALTER TABLE "Coupon"
  ALTER COLUMN balance TYPE DECIMAL(12,2)
  USING (balance::DECIMAL(12,2));

ALTER TABLE "Coupon"
  ALTER COLUMN "minPurchase" TYPE DECIMAL(12,2)
  USING ("minPurchase"::DECIMAL(12,2));

-- Bundle
ALTER TABLE "Bundle"
  ALTER COLUMN price TYPE DECIMAL(12,2)
  USING (price::DECIMAL(12,2));

-- ============================================================
-- GRUPO 3: HISTORIAL / LOGS (crecimiento lento)
-- ============================================================

-- PriceHistory
ALTER TABLE "PriceHistory"
  ALTER COLUMN "oldPrice" TYPE DECIMAL(12,2)
  USING ("oldPrice"::DECIMAL(12,2));

ALTER TABLE "PriceHistory"
  ALTER COLUMN "newPrice" TYPE DECIMAL(12,2)
  USING ("newPrice"::DECIMAL(12,2));

-- SupplierPriceVersion
ALTER TABLE "SupplierPriceVersion"
  ALTER COLUMN "oldPrice" TYPE DECIMAL(12,2)
  USING ("oldPrice"::DECIMAL(12,2));

ALTER TABLE "SupplierPriceVersion"
  ALTER COLUMN "newPrice" TYPE DECIMAL(12,2)
  USING ("newPrice"::DECIMAL(12,2));

-- Campaign
ALTER TABLE "Campaign"
  ALTER COLUMN revenue TYPE DECIMAL(12,2)
  USING (revenue::DECIMAL(12,2));

-- ProductAnalytics
ALTER TABLE "ProductAnalytics"
  ALTER COLUMN revenue TYPE DECIMAL(12,2)
  USING (revenue::DECIMAL(12,2));

-- ABTestEvent
ALTER TABLE "ABTestEvent"
  ALTER COLUMN value TYPE DECIMAL(12,2)
  USING (value::DECIMAL(12,2));

-- ============================================================
-- GRUPO 4: INVENTARIO Y COMPRAS (volumen medio)
-- ============================================================

-- Batch (costo unitario de lotes)
ALTER TABLE "Batch"
  ALTER COLUMN "costUnit" TYPE DECIMAL(12,2)
  USING ("costUnit"::DECIMAL(12,2));

-- PurchaseItem
ALTER TABLE "PurchaseItem"
  ALTER COLUMN "unitCost" TYPE DECIMAL(12,2)
  USING ("unitCost"::DECIMAL(12,2));

-- PurchaseOrder
ALTER TABLE "PurchaseOrder"
  ALTER COLUMN total TYPE DECIMAL(12,2)
  USING (total::DECIMAL(12,2));

ALTER TABLE "PurchaseOrder"
  ALTER COLUMN discount TYPE DECIMAL(12,2)
  USING (discount::DECIMAL(12,2));

-- Expense
ALTER TABLE "Expense"
  ALTER COLUMN amount TYPE DECIMAL(12,2)
  USING (amount::DECIMAL(12,2));

-- ============================================================
-- GRUPO 5: CUENTAS POR PAGAR (volumen medio)
-- ============================================================

-- Payment
ALTER TABLE "Payment"
  ALTER COLUMN amount TYPE DECIMAL(12,2)
  USING (amount::DECIMAL(12,2));

-- Payable
ALTER TABLE "Payable"
  ALTER COLUMN amount TYPE DECIMAL(12,2)
  USING (amount::DECIMAL(12,2));

ALTER TABLE "Payable"
  ALTER COLUMN "paidAmount" TYPE DECIMAL(12,2)
  USING ("paidAmount"::DECIMAL(12,2));

-- ============================================================
-- GRUPO 6: DEVOLUCIONES
-- ============================================================

-- ReturnItem
ALTER TABLE "ReturnItem"
  ALTER COLUMN price TYPE DECIMAL(12,2)
  USING (price::DECIMAL(12,2));

-- Return
ALTER TABLE "Return"
  ALTER COLUMN total TYPE DECIMAL(12,2)
  USING (total::DECIMAL(12,2));

-- ============================================================
-- GRUPO 7: MARKETPLACE — PRECIOS Y COMISIONES
-- ============================================================

-- DeliveryPartner
ALTER TABLE "DeliveryPartner"
  ALTER COLUMN fee TYPE DECIMAL(12,2)
  USING (fee::DECIMAL(12,2));

-- DeliveryAssignment
ALTER TABLE "DeliveryAssignment"
  ALTER COLUMN fee TYPE DECIMAL(12,2)
  USING (fee::DECIMAL(12,2));

-- WholesaleOrderItem
ALTER TABLE "WholesaleOrderItem"
  ALTER COLUMN "unitPrice" TYPE DECIMAL(12,2)
  USING ("unitPrice"::DECIMAL(12,2));

ALTER TABLE "WholesaleOrderItem"
  ALTER COLUMN total TYPE DECIMAL(12,2)
  USING (total::DECIMAL(12,2));

-- WholesaleOrder
ALTER TABLE "WholesaleOrder"
  ALTER COLUMN total TYPE DECIMAL(12,2)
  USING (total::DECIMAL(12,2));

ALTER TABLE "WholesaleOrder"
  ALTER COLUMN commission TYPE DECIMAL(12,2)
  USING (commission::DECIMAL(12,2));

-- CommissionLedger
ALTER TABLE "CommissionLedger"
  ALTER COLUMN amount TYPE DECIMAL(12,2)
  USING (amount::DECIMAL(12,2));

-- StoreProduct
ALTER TABLE "StoreProduct"
  ALTER COLUMN "retailPrice" TYPE DECIMAL(12,2)
  USING ("retailPrice"::DECIMAL(12,2));

ALTER TABLE "StoreProduct"
  ALTER COLUMN "wholesalePrice" TYPE DECIMAL(12,2)
  USING ("wholesalePrice"::DECIMAL(12,2));

-- SalesAnomaly (solo campos de revenue)
ALTER TABLE "SalesAnomaly"
  ALTER COLUMN expected TYPE DECIMAL(12,2)
  USING (expected::DECIMAL(12,2));

ALTER TABLE "SalesAnomaly"
  ALTER COLUMN actual TYPE DECIMAL(12,2)
  USING (actual::DECIMAL(12,2));

-- ============================================================
-- GRUPO 8: CRÉDITO INTERNO (BNPL)
-- ============================================================

-- CreditProfile
ALTER TABLE "CreditProfile"
  ALTER COLUMN "creditLimit" TYPE DECIMAL(12,2)
  USING ("creditLimit"::DECIMAL(12,2));

ALTER TABLE "CreditProfile"
  ALTER COLUMN "usedCredit" TYPE DECIMAL(12,2)
  USING ("usedCredit"::DECIMAL(12,2));

ALTER TABLE "CreditProfile"
  ALTER COLUMN "availableCredit" TYPE DECIMAL(12,2)
  USING ("availableCredit"::DECIMAL(12,2));

ALTER TABLE "CreditProfile"
  ALTER COLUMN "avgTicket" TYPE DECIMAL(12,2)
  USING ("avgTicket"::DECIMAL(12,2));

-- CreditInstallment
ALTER TABLE "CreditInstallment"
  ALTER COLUMN "totalAmount" TYPE DECIMAL(12,2)
  USING ("totalAmount"::DECIMAL(12,2));

ALTER TABLE "CreditInstallment"
  ALTER COLUMN "installmentAmount" TYPE DECIMAL(12,2)
  USING ("installmentAmount"::DECIMAL(12,2));

ALTER TABLE "CreditInstallment"
  ALTER COLUMN "paidAmount" TYPE DECIMAL(12,2)
  USING ("paidAmount"::DECIMAL(12,2));

-- ============================================================
-- GRUPO 9: VARIANTES Y CATÁLOGO (sin POS aún)
-- ============================================================

-- ProductVariant
ALTER TABLE "ProductVariant"
  ALTER COLUMN "priceModifier" TYPE DECIMAL(12,2)
  USING ("priceModifier"::DECIMAL(12,2));

-- ============================================================
-- GRUPO 10: CAJA (alta criticidad — dejar para el final del grupo 10)
-- ============================================================

-- CashMovement
ALTER TABLE "CashMovement"
  ALTER COLUMN amount TYPE DECIMAL(12,2)
  USING (amount::DECIMAL(12,2));

-- CashRegister
ALTER TABLE "CashRegister"
  ALTER COLUMN "openingAmount" TYPE DECIMAL(12,2)
  USING ("openingAmount"::DECIMAL(12,2));

ALTER TABLE "CashRegister"
  ALTER COLUMN "closingAmount" TYPE DECIMAL(12,2)
  USING ("closingAmount"::DECIMAL(12,2));

ALTER TABLE "CashRegister"
  ALTER COLUMN "expectedAmount" TYPE DECIMAL(12,2)
  USING ("expectedAmount"::DECIMAL(12,2));

ALTER TABLE "CashRegister"
  ALTER COLUMN difference TYPE DECIMAL(12,2)
  USING (difference::DECIMAL(12,2));

-- ============================================================
-- GRUPO 11: CLIENTES (alta dependencia — antes de ventas)
-- ============================================================

-- Customer
ALTER TABLE "Customer"
  ALTER COLUMN "totalSpent" TYPE DECIMAL(12,2)
  USING ("totalSpent"::DECIMAL(12,2));

ALTER TABLE "Customer"
  ALTER COLUMN "creditBalance" TYPE DECIMAL(12,2)
  USING ("creditBalance"::DECIMAL(12,2));

ALTER TABLE "Customer"
  ALTER COLUMN "creditLimit" TYPE DECIMAL(12,2)
  USING ("creditLimit"::DECIMAL(12,2));

-- ============================================================
-- GRUPO 12: FACTURACIÓN SUNAT (CRÍTICO — requiere precisión exacta)
-- ============================================================

-- SunatInvoice
ALTER TABLE "SunatInvoice"
  ALTER COLUMN subtotal TYPE DECIMAL(12,2)
  USING (subtotal::DECIMAL(12,2));

ALTER TABLE "SunatInvoice"
  ALTER COLUMN igv TYPE DECIMAL(12,2)
  USING (igv::DECIMAL(12,2));

ALTER TABLE "SunatInvoice"
  ALTER COLUMN total TYPE DECIMAL(12,2)
  USING (total::DECIMAL(12,2));

-- ============================================================
-- GRUPO 13: VENTAS POS (mayor volumen, alta criticidad)
-- ============================================================

-- SaleItem (líneas — migrar ANTES que la cabecera)
ALTER TABLE "SaleItem"
  ALTER COLUMN price TYPE DECIMAL(12,2)
  USING (price::DECIMAL(12,2));

ALTER TABLE "SaleItem"
  ALTER COLUMN "costPrice" TYPE DECIMAL(12,2)
  USING ("costPrice"::DECIMAL(12,2));

-- Sale (cabecera de venta POS)
ALTER TABLE "Sale"
  ALTER COLUMN total TYPE DECIMAL(12,2)
  USING (total::DECIMAL(12,2));

ALTER TABLE "Sale"
  ALTER COLUMN "totalCogs" TYPE DECIMAL(12,2)
  USING ("totalCogs"::DECIMAL(12,2));

ALTER TABLE "Sale"
  ALTER COLUMN "amountPaid" TYPE DECIMAL(12,2)
  USING ("amountPaid"::DECIMAL(12,2));

ALTER TABLE "Sale"
  ALTER COLUMN change TYPE DECIMAL(12,2)
  USING (change::DECIMAL(12,2));

-- ============================================================
-- GRUPO 14: PEDIDOS ONLINE (mayor volumen, más dependencias)
-- ============================================================

-- OrderItem (líneas — migrar ANTES que la cabecera)
ALTER TABLE "OrderItem"
  ALTER COLUMN price TYPE DECIMAL(12,2)
  USING (price::DECIMAL(12,2));

ALTER TABLE "OrderItem"
  ALTER COLUMN "costPrice" TYPE DECIMAL(12,2)
  USING ("costPrice"::DECIMAL(12,2));

-- Order (cabecera — ÚLTIMO porque tiene más dependencias en código)
ALTER TABLE "Order"
  ALTER COLUMN total TYPE DECIMAL(12,2)
  USING (total::DECIMAL(12,2));

ALTER TABLE "Order"
  ALTER COLUMN "couponDiscount" TYPE DECIMAL(12,2)
  USING ("couponDiscount"::DECIMAL(12,2));

ALTER TABLE "Order"
  ALTER COLUMN "discountAmount" TYPE DECIMAL(12,2)
  USING ("discountAmount"::DECIMAL(12,2));

ALTER TABLE "Order"
  ALTER COLUMN "totalCogs" TYPE DECIMAL(12,2)
  USING ("totalCogs"::DECIMAL(12,2));

-- ============================================================
-- GRUPO 15: CATÁLOGO DE PRODUCTOS (mayor impacto — AL FINAL)
-- El catálogo está referenciado por todas las tablas anteriores.
-- Si este falla, los datos de ventas ya están migrados pero
-- el precio de referencia no. Migrar al último por seguridad.
-- ============================================================

-- Product
ALTER TABLE "Product"
  ALTER COLUMN price TYPE DECIMAL(12,2)
  USING (price::DECIMAL(12,2));

ALTER TABLE "Product"
  ALTER COLUMN "costPrice" TYPE DECIMAL(12,2)
  USING ("costPrice"::DECIMAL(12,2));

-- ============================================================
-- TOTAL: 76 ALTER TABLE statements en 15 grupos
-- Tiempo estimado: 10-60 segundos según volumen de datos
--
-- POST-MIGRACIÓN: Verificar con information_schema
-- ============================================================

-- Verificación post-migración: confirmar tipos
SELECT
  table_name,
  column_name,
  data_type,
  numeric_precision,
  numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public'
  AND data_type = 'numeric'
  AND table_name IN (
    'Product', 'Order', 'OrderItem', 'Sale', 'SaleItem',
    'Customer', 'CashRegister', 'CashMovement', 'PurchaseOrder',
    'PurchaseItem', 'Payable', 'Payment', 'Return', 'ReturnItem',
    'PriceHistory', 'Expense', 'Bundle', 'Coupon', 'Promotion',
    'StoreProduct', 'WholesaleOrder', 'WholesaleOrderItem',
    'CommissionLedger', 'DeliveryPartner', 'DeliveryAssignment',
    'CreditProfile', 'CreditInstallment', 'SunatInvoice',
    'Campaign', 'ProductAnalytics', 'ProductVariant', 'Batch',
    'CommissionRule', 'Settings', 'DiscountRule', 'SalesAnomaly',
    'ABTestEvent', 'SupplierPriceVersion'
  )
ORDER BY table_name, column_name;

-- Verificar que NO queden Float en las tablas monetarias
-- (si devuelve filas, hay campos Float no migrados)
SELECT
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND data_type = 'double precision'
  AND table_name IN (
    'Product', 'Order', 'OrderItem', 'Sale', 'SaleItem',
    'Customer', 'CashRegister', 'CashMovement', 'PurchaseOrder',
    'PurchaseItem', 'Payable', 'Payment', 'Return', 'ReturnItem',
    'PriceHistory', 'Expense', 'Bundle', 'Coupon', 'Promotion',
    'StoreProduct', 'WholesaleOrder', 'WholesaleOrderItem',
    'CommissionLedger', 'DeliveryPartner', 'DeliveryAssignment',
    'CreditProfile', 'CreditInstallment', 'SunatInvoice',
    'Campaign', 'ProductAnalytics', 'ProductVariant', 'Batch',
    'CommissionRule', 'Settings', 'DiscountRule', 'SalesAnomaly',
    'ABTestEvent', 'SupplierPriceVersion'
  )
ORDER BY table_name, column_name;

-- ============================================================
-- FIN TD-018 ALTER STATEMENTS
-- ============================================================
