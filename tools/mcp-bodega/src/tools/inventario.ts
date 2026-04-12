/** Tool: get_inventario_critico — Low stock + expiring batches (FEFO). */

import { query } from "../db.js";
import type { ProductoCritico } from "../types.js";

/** @param tenantId Tenant isolation (rule #3) */
export async function getInventarioCritico(tenantId: string): Promise<ProductoCritico[]> {
  const lowStock = await query<{
    id: number; name: string; category: string; stock: number | null; stock_min: number | null; unit: string;
  }>(`SELECT id, name, category, stock, "stockMin" AS stock_min, unit FROM "Product"
     WHERE "tenantId"=$1 AND active=true AND "deletedAt" IS NULL
       AND "stockMin" IS NOT NULL AND stock IS NOT NULL AND stock < "stockMin"
     ORDER BY (stock::float / NULLIF("stockMin",0)::float) ASC LIMIT 50`, [tenantId]);

  const expiring = await query<{
    product_id: number | null; product_name: string; product_category: string;
    quantity: number; unit: string; lote: string; expiry_date: string; days_left: number;
  }>(`SELECT b."productId" AS product_id, b."productName" AS product_name,
       b."productCategory" AS product_category, b.quantity, b.unit, b.lote,
       b."expiryDate"::text AS expiry_date,
       GREATEST(0, EXTRACT(DAY FROM b."expiryDate"-NOW())::int) AS days_left
     FROM "Batch" b WHERE b."tenantId"=$1 AND b.quantity>0
       AND b."expiryDate" <= (NOW()+INTERVAL '7 days')
     ORDER BY b."expiryDate" ASC LIMIT 50`, [tenantId]);

  const results: ProductoCritico[] = [];
  for (const p of lowStock) {
    results.push({ id: p.id, name: p.name, category: p.category, stock: p.stock,
      stockMin: p.stock_min, unit: p.unit, razon: "stock_bajo" });
  }
  for (const b of expiring) {
    results.push({ id: b.product_id ?? 0, name: b.product_name, category: b.product_category,
      stock: b.quantity, stockMin: null, unit: b.unit, razon: "por_vencer",
      detalleVencimiento: `Lote ${b.lote} vence ${b.expiry_date} (${b.days_left} dias)` });
  }
  return results;
}
