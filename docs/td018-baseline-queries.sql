-- ============================================================
-- TD-018 BASELINE QUERIES — Float → Decimal(12,2)
-- Ejecutar ANTES y DESPUÉS de la migración para detectar drift.
-- Guardar ambas salidas en docs/td018-baseline-results-pre.txt
-- y docs/td018-baseline-results-post.txt
-- IMPORTANTE: Todas las queries usan parámetros literales seguros
-- (no string interpolation). No usar $queryRawUnsafe en producción.
-- ============================================================

-- ============================================================
-- BLOQUE 1: TABLAS CORE (mayor volumen de datos esperado)
-- ============================================================

-- 1. Order (cabecera de pedidos — campo más crítico)
SELECT
  'Order' AS tabla,
  COUNT(*)          AS total_filas,
  SUM(total)        AS sum_total,
  AVG(total)        AS avg_total,
  MIN(total)        AS min_total,
  MAX(total)        AS max_total,
  SUM(CASE WHEN "couponDiscount" IS NOT NULL THEN "couponDiscount" ELSE 0 END) AS sum_coupon_discount,
  SUM(CASE WHEN "discountAmount"  IS NOT NULL THEN "discountAmount"  ELSE 0 END) AS sum_discount_amount,
  SUM(CASE WHEN "totalCogs"       IS NOT NULL THEN "totalCogs"       ELSE 0 END) AS sum_total_cogs
FROM "Order"
WHERE total > 0;

-- 2. OrderItem (líneas de pedido)
SELECT
  'OrderItem' AS tabla,
  COUNT(*)                       AS total_filas,
  SUM(price)                     AS sum_price,
  AVG(price)                     AS avg_price,
  SUM(price * quantity)          AS sum_precio_x_cantidad,
  SUM(CASE WHEN "costPrice" IS NOT NULL THEN "costPrice" ELSE 0 END) AS sum_cost_price
FROM "OrderItem";

-- 3. Sale (ventas POS)
SELECT
  'Sale' AS tabla,
  COUNT(*)                AS total_filas,
  SUM(total)              AS sum_total,
  AVG(total)              AS avg_total,
  SUM("amountPaid")       AS sum_amount_paid,
  SUM(change)             AS sum_change,
  SUM(CASE WHEN "totalCogs" IS NOT NULL THEN "totalCogs" ELSE 0 END) AS sum_total_cogs
FROM "Sale"
WHERE total > 0;

-- 4. SaleItem (líneas de venta POS)
SELECT
  'SaleItem' AS tabla,
  COUNT(*)                      AS total_filas,
  SUM(price)                    AS sum_price,
  SUM(price * quantity)         AS sum_precio_x_cantidad,
  SUM(CASE WHEN "costPrice" IS NOT NULL THEN "costPrice" ELSE 0 END) AS sum_cost_price
FROM "SaleItem";

-- 5. Product (catálogo)
SELECT
  'Product' AS tabla,
  COUNT(*)                        AS total_filas,
  SUM(price)                      AS sum_price,
  AVG(price)                      AS avg_price,
  MIN(price)                      AS min_price,
  MAX(price)                      AS max_price,
  SUM(CASE WHEN "costPrice" IS NOT NULL THEN "costPrice" ELSE 0 END) AS sum_cost_price,
  COUNT(CASE WHEN price <= 0 THEN 1 END) AS productos_precio_cero
FROM "Product"
WHERE "deletedAt" IS NULL;

-- ============================================================
-- BLOQUE 2: CLIENTES Y CRÉDITO
-- ============================================================

-- 6. Customer (dinero acumulado y crédito)
SELECT
  'Customer' AS tabla,
  COUNT(*)                AS total_filas,
  SUM("totalSpent")       AS sum_total_spent,
  AVG("totalSpent")       AS avg_total_spent,
  SUM("creditBalance")    AS sum_credit_balance,
  SUM("creditLimit")      AS sum_credit_limit,
  COUNT(CASE WHEN "creditBalance" > 0 THEN 1 END) AS clientes_con_balance
FROM "Customer";

-- 7. CreditProfile (motor BNPL)
SELECT
  'CreditProfile' AS tabla,
  COUNT(*)                   AS total_filas,
  SUM("creditLimit")         AS sum_credit_limit,
  SUM("usedCredit")          AS sum_used_credit,
  SUM("availableCredit")     AS sum_available_credit,
  SUM("avgTicket")           AS sum_avg_ticket,
  COUNT(CASE WHEN "usedCredit" > 0 THEN 1 END) AS perfiles_con_credito_activo
FROM "CreditProfile";

-- 8. CreditInstallment (cuotas BNPL)
SELECT
  'CreditInstallment' AS tabla,
  COUNT(*)                    AS total_filas,
  SUM("totalAmount")          AS sum_total_amount,
  SUM("installmentAmount")    AS sum_installment_amount,
  SUM("paidAmount")           AS sum_paid_amount,
  SUM("totalAmount") - SUM("paidAmount") AS sum_deuda_pendiente,
  COUNT(CASE WHEN status = 'active' THEN 1 END)  AS cuotas_activas,
  COUNT(CASE WHEN status = 'overdue' THEN 1 END) AS cuotas_vencidas
FROM "CreditInstallment";

-- ============================================================
-- BLOQUE 3: COMPRAS Y PROVEEDORES
-- ============================================================

-- 9. PurchaseOrder (órdenes de compra)
SELECT
  'PurchaseOrder' AS tabla,
  COUNT(*)                AS total_filas,
  SUM(total)              AS sum_total,
  AVG(total)              AS avg_total,
  SUM(CASE WHEN discount IS NOT NULL THEN discount ELSE 0 END) AS sum_discount
FROM "PurchaseOrder";

-- 10. PurchaseItem (líneas de compra)
SELECT
  'PurchaseItem' AS tabla,
  COUNT(*)                       AS total_filas,
  SUM("unitCost")                AS sum_unit_cost,
  SUM("unitCost" * quantity)     AS sum_costo_total
FROM "PurchaseItem";

-- 11. Payable (cuentas por pagar)
SELECT
  'Payable' AS tabla,
  COUNT(*)              AS total_filas,
  SUM(amount)           AS sum_amount,
  SUM("paidAmount")     AS sum_paid_amount,
  SUM(amount) - SUM("paidAmount") AS sum_deuda_pendiente,
  COUNT(CASE WHEN status = 'pendiente' THEN 1 END) AS payables_pendientes
FROM "Payable";

-- 12. Payment (pagos a proveedores)
SELECT
  'Payment' AS tabla,
  COUNT(*)     AS total_filas,
  SUM(amount)  AS sum_amount,
  AVG(amount)  AS avg_amount
FROM "Payment";

-- ============================================================
-- BLOQUE 4: CAJA Y MOVIMIENTOS
-- ============================================================

-- 13. CashRegister (sesiones de caja)
SELECT
  'CashRegister' AS tabla,
  COUNT(*)                       AS total_filas,
  SUM("openingAmount")           AS sum_opening_amount,
  SUM(CASE WHEN "closingAmount"  IS NOT NULL THEN "closingAmount"  ELSE 0 END) AS sum_closing_amount,
  SUM(CASE WHEN "expectedAmount" IS NOT NULL THEN "expectedAmount" ELSE 0 END) AS sum_expected_amount,
  SUM(CASE WHEN difference       IS NOT NULL THEN difference        ELSE 0 END) AS sum_difference,
  COUNT(CASE WHEN status = 'abierta' THEN 1 END) AS cajas_abiertas
FROM "CashRegister";

-- 14. CashMovement (movimientos de caja)
SELECT
  'CashMovement' AS tabla,
  COUNT(*)                                                     AS total_filas,
  SUM(amount)                                                  AS sum_amount,
  SUM(CASE WHEN type = 'venta'   THEN amount ELSE 0 END) AS sum_ventas,
  SUM(CASE WHEN type = 'ingreso' THEN amount ELSE 0 END) AS sum_ingresos,
  SUM(CASE WHEN type = 'egreso'  THEN amount ELSE 0 END) AS sum_egresos
FROM "CashMovement";

-- ============================================================
-- BLOQUE 5: FACTURACIÓN SUNAT (CRÍTICO — precisión exacta)
-- ============================================================

-- 15. SunatInvoice (comprobantes electrónicos)
SELECT
  'SunatInvoice' AS tabla,
  COUNT(*)                AS total_filas,
  SUM(subtotal)           AS sum_subtotal,
  SUM(igv)                AS sum_igv,
  SUM(total)              AS sum_total,
  -- Verificar consistencia: subtotal + igv debe ≈ total (tolerancia 0.01)
  SUM(ABS(total - (subtotal + igv))) AS suma_diferencia_redondeo,
  COUNT(CASE WHEN "sunatStatus" = 'accepted' THEN 1 END) AS facturas_aceptadas,
  COUNT(CASE WHEN "sunatStatus" = 'rejected' THEN 1 END) AS facturas_rechazadas
FROM "SunatInvoice";

-- ============================================================
-- BLOQUE 6: DEVOLUCIONES Y DESCUENTOS
-- ============================================================

-- 16. Return (devoluciones)
SELECT
  'Return' AS tabla,
  COUNT(*)     AS total_filas,
  SUM(total)   AS sum_total,
  AVG(total)   AS avg_total
FROM "Return"
WHERE total > 0;

-- 17. ReturnItem (líneas de devolución)
SELECT
  'ReturnItem' AS tabla,
  COUNT(*)               AS total_filas,
  SUM(price)             AS sum_price,
  SUM(price * quantity)  AS sum_precio_x_cantidad
FROM "ReturnItem";

-- 18. Coupon (cupones)
SELECT
  'Coupon' AS tabla,
  COUNT(*)                  AS total_filas,
  SUM("discountValue")      AS sum_discount_value,
  SUM(CASE WHEN balance IS NOT NULL THEN balance ELSE 0 END) AS sum_balance_giftcard,
  SUM(CASE WHEN "minPurchase" IS NOT NULL THEN "minPurchase" ELSE 0 END) AS sum_min_purchase,
  COUNT(CASE WHEN active = true THEN 1 END) AS cupones_activos
FROM "Coupon";

-- ============================================================
-- BLOQUE 7: PRECIOS E HISTORIAL
-- ============================================================

-- 19. PriceHistory (historial de precios)
SELECT
  'PriceHistory' AS tabla,
  COUNT(*)          AS total_filas,
  SUM("oldPrice")   AS sum_old_price,
  SUM("newPrice")   AS sum_new_price,
  AVG("newPrice" - "oldPrice") AS avg_delta_price
FROM "PriceHistory";

-- 20. SupplierPriceVersion (versiones de precio de proveedor)
SELECT
  'SupplierPriceVersion' AS tabla,
  COUNT(*)          AS total_filas,
  SUM("oldPrice")   AS sum_old_price,
  SUM("newPrice")   AS sum_new_price
FROM "SupplierPriceVersion";

-- ============================================================
-- BLOQUE 8: GASTOS Y COMBOS
-- ============================================================

-- 21. Expense (gastos operativos)
SELECT
  'Expense' AS tabla,
  COUNT(*)      AS total_filas,
  SUM(amount)   AS sum_amount,
  AVG(amount)   AS avg_amount,
  MIN(amount)   AS min_amount,
  MAX(amount)   AS max_amount
FROM "Expense";

-- 22. Bundle (combos)
SELECT
  'Bundle' AS tabla,
  COUNT(*)     AS total_filas,
  SUM(price)   AS sum_price,
  AVG(price)   AS avg_price
FROM "Bundle"
WHERE active = true;

-- ============================================================
-- BLOQUE 9: MARKETPLACE
-- ============================================================

-- 23. StoreProduct (precios de tienda)
SELECT
  'StoreProduct' AS tabla,
  COUNT(*)                      AS total_filas,
  SUM("retailPrice")            AS sum_retail_price,
  AVG("retailPrice")            AS avg_retail_price,
  SUM(CASE WHEN "wholesalePrice" IS NOT NULL THEN "wholesalePrice" ELSE 0 END) AS sum_wholesale_price
FROM "StoreProduct";

-- 24. WholesaleOrder (órdenes mayoristas)
SELECT
  'WholesaleOrder' AS tabla,
  COUNT(*)              AS total_filas,
  SUM(total)            AS sum_total,
  SUM(commission)       AS sum_commission
FROM "WholesaleOrder";

-- 25. WholesaleOrderItem (líneas mayoristas)
SELECT
  'WholesaleOrderItem' AS tabla,
  COUNT(*)                   AS total_filas,
  SUM("unitPrice")           AS sum_unit_price,
  SUM(total)                 AS sum_total,
  SUM("unitPrice" * quantity) AS sum_precio_x_cantidad
FROM "WholesaleOrderItem";

-- 26. CommissionLedger (registro de comisiones)
SELECT
  'CommissionLedger' AS tabla,
  COUNT(*)     AS total_filas,
  SUM(amount)  AS sum_amount,
  COUNT(CASE WHEN status = 'pending'  THEN 1 END) AS comisiones_pendientes,
  COUNT(CASE WHEN status = 'settled'  THEN 1 END) AS comisiones_liquidadas
FROM "CommissionLedger";

-- 27. DeliveryPartner (fee de repartidores)
SELECT
  'DeliveryPartner' AS tabla,
  COUNT(*)     AS total_filas,
  SUM(fee)     AS sum_fee,
  AVG(fee)     AS avg_fee
FROM "DeliveryPartner";

-- 28. DeliveryAssignment (fee de asignaciones)
SELECT
  'DeliveryAssignment' AS tabla,
  COUNT(*)     AS total_filas,
  SUM(fee)     AS sum_fee,
  AVG(fee)     AS avg_fee
FROM "DeliveryAssignment";

-- ============================================================
-- BLOQUE 10: CAMPAÑAS Y VARIANTES
-- ============================================================

-- 29. Campaign (ingresos atribuidos)
SELECT
  'Campaign' AS tabla,
  COUNT(*)       AS total_filas,
  SUM(revenue)   AS sum_revenue,
  AVG(revenue)   AS avg_revenue
FROM "Campaign";

-- 30. CommissionRule (rangos de comisión)
SELECT
  'CommissionRule' AS tabla,
  COUNT(*)            AS total_filas,
  SUM("minSales")     AS sum_min_sales,
  SUM(CASE WHEN "maxSales" IS NOT NULL THEN "maxSales" ELSE 0 END) AS sum_max_sales
FROM "CommissionRule";

-- 31. ProductVariant (modificador de precio)
SELECT
  'ProductVariant' AS tabla,
  COUNT(*)                 AS total_filas,
  SUM("priceModifier")     AS sum_price_modifier,
  COUNT(CASE WHEN "priceModifier" != 0 THEN 1 END) AS variantes_con_modificador
FROM "ProductVariant";

-- 32. Batch (costo unitario de lotes)
SELECT
  'Batch' AS tabla,
  COUNT(*)         AS total_filas,
  SUM("costUnit")  AS sum_cost_unit,
  AVG("costUnit")  AS avg_cost_unit,
  COUNT(CASE WHEN "costUnit" > 0 THEN 1 END) AS lotes_con_costo
FROM "Batch";

-- 33. Promotion (monto mínimo)
SELECT
  'Promotion' AS tabla,
  COUNT(*)                  AS total_filas,
  SUM(CASE WHEN "minPurchase" IS NOT NULL THEN "minPurchase" ELSE 0 END) AS sum_min_purchase,
  COUNT(CASE WHEN active = true THEN 1 END) AS promociones_activas
FROM "Promotion";

-- 34. ProductAnalytics (ingresos por producto)
SELECT
  'ProductAnalytics' AS tabla,
  COUNT(*)        AS total_filas,
  SUM(revenue)    AS sum_revenue,
  AVG(revenue)    AS avg_revenue
FROM "ProductAnalytics"
WHERE revenue > 0;

-- 35. SalesAnomaly (expected/actual monetario)
SELECT
  'SalesAnomaly' AS tabla,
  COUNT(*)                                                        AS total_filas,
  COUNT(CASE WHEN metric = 'revenue' THEN 1 END)                 AS anomalias_revenue,
  SUM(CASE WHEN metric = 'revenue' THEN expected ELSE 0 END)     AS sum_expected_revenue,
  SUM(CASE WHEN metric = 'revenue' THEN actual   ELSE 0 END)     AS sum_actual_revenue
FROM "SalesAnomaly";

-- 36. ABTestEvent (conversion value)
SELECT
  'ABTestEvent' AS tabla,
  COUNT(*)                                                      AS total_filas,
  COUNT(CASE WHEN value IS NOT NULL THEN 1 END)                 AS eventos_con_valor,
  SUM(CASE WHEN value IS NOT NULL THEN value ELSE 0 END)        AS sum_value
FROM "ABTestEvent";

-- ============================================================
-- BLOQUE 11: SETTINGS (configuración monetaria)
-- ============================================================

-- 37. Settings (montos de configuración)
SELECT
  'Settings' AS tabla,
  COUNT(*)                    AS total_filas,
  SUM(CASE WHEN "cashOpeningAmount" IS NOT NULL THEN "cashOpeningAmount" ELSE 0 END) AS sum_cash_opening,
  SUM(CASE WHEN "cashAlertMax"      IS NOT NULL THEN "cashAlertMax"      ELSE 0 END) AS sum_cash_alert_max,
  SUM(CASE WHEN "returnMaxNoAuth"   IS NOT NULL THEN "returnMaxNoAuth"   ELSE 0 END) AS sum_return_max,
  SUM(CASE WHEN "freeDeliveryMin"   IS NOT NULL THEN "freeDeliveryMin"   ELSE 0 END) AS sum_free_delivery_min
FROM "Settings";

-- ============================================================
-- BLOQUE 12: VERIFICACIÓN DE INTEGRIDAD CRUZADA
-- (Ejecutar post-migración para confirmar que los casts no alteraron los montos)
-- ============================================================

-- Compara suma Order.total con suma OrderItem.price * quantity
-- (Pueden no coincidir exactamente por descuentos y cupones, pero la
-- diferencia no debe cambiar entre pre y post migración)
SELECT
  'Cruce Order vs OrderItem' AS verificacion,
  (SELECT SUM(total) FROM "Order" WHERE total > 0)                               AS sum_order_total,
  (SELECT SUM(price * quantity) FROM "OrderItem")                                AS sum_item_total,
  (SELECT SUM(total) FROM "Order" WHERE total > 0)
    - (SELECT SUM(price * quantity) FROM "OrderItem")                            AS diferencia;

-- Compara suma Sale.total con suma SaleItem.price * quantity
SELECT
  'Cruce Sale vs SaleItem' AS verificacion,
  (SELECT SUM(total) FROM "Sale" WHERE total > 0)                                AS sum_sale_total,
  (SELECT SUM(price * quantity) FROM "SaleItem")                                 AS sum_item_total,
  (SELECT SUM(total) FROM "Sale" WHERE total > 0)
    - (SELECT SUM(price * quantity) FROM "SaleItem")                             AS diferencia;

-- Verifica SunatInvoice: subtotal + igv = total (debe ser 0 o muy pequeño post-migración)
SELECT
  'Integridad SunatInvoice' AS verificacion,
  COUNT(*)                  AS facturas_con_discrepancia,
  MAX(ABS(total - (subtotal + igv))) AS max_diferencia
FROM "SunatInvoice"
WHERE ABS(total - (subtotal + igv)) > 0.01;

-- Verifica Customer: availableCredit = creditLimit - usedCredit
SELECT
  'Integridad CreditProfile' AS verificacion,
  COUNT(*)                   AS perfiles_con_discrepancia
FROM "CreditProfile"
WHERE ABS("availableCredit" - ("creditLimit" - "usedCredit")) > 0.01;

-- ============================================================
-- FIN DE BASELINE QUERIES TD-018
-- Guardar salida completa antes y después de la migración.
-- Las sumas deben coincidir exactamente. Si hay diferencias,
-- revisar el CAST usado en el ALTER (USING expression).
-- ============================================================
