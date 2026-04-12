/** Tool: get_ventas_hoy — Sales summary combining Order (e-commerce) + Sale (POS). */

import { query } from "../db.js";
import type { VentasResumen } from "../types.js";

type Row = { total: string; cantidad: string; payment_method: string };
type SaleRow = Row & { cashier_id: string | null };
type TopRow = { name: string; cantidad: string; total: string };

/** @param tenantId Tenant isolation (rule #3) @param fecha YYYY-MM-DD, defaults today */
export async function getVentasHoy(tenantId: string, fecha?: string): Promise<VentasResumen> {
  const d = fecha || new Date().toISOString().split("T")[0];

  const orderRows = await query<Row>(
    `SELECT COALESCE(SUM(total),0)::text AS total, COUNT(*)::text AS cantidad,
       COALESCE("paymentMethod",'efectivo') AS payment_method
     FROM "Order" WHERE "tenantId"=$1 AND "createdAt"::date=$2::date
       AND "deletedAt" IS NULL AND status!='cancelado'
     GROUP BY COALESCE("paymentMethod",'efectivo')`, [tenantId, d]);

  const saleRows = await query<SaleRow>(
    `SELECT COALESCE(SUM(total),0)::text AS total, COUNT(*)::text AS cantidad,
       COALESCE(payment,'efectivo') AS payment_method, "cashierId" AS cashier_id
     FROM "Sale" WHERE "tenantId"=$1 AND "createdAt"::date=$2::date
     GROUP BY COALESCE(payment,'efectivo'), "cashierId"`, [tenantId, d]);

  const topProducts = await query<TopRow>(
    `SELECT name, SUM(quantity)::text AS cantidad, SUM(price*quantity)::text AS total FROM (
       SELECT oi.name,oi.quantity,oi.price FROM "OrderItem" oi
       JOIN "Order" o ON o.id=oi."orderId"
       WHERE o."tenantId"=$1 AND o."createdAt"::date=$2::date
         AND o."deletedAt" IS NULL AND o.status!='cancelado'
       UNION ALL
       SELECT si.name,si.quantity,si.price FROM "SaleItem" si
       JOIN "Sale" s ON s.id=si."saleId"
       WHERE s."tenantId"=$1 AND s."createdAt"::date=$2::date
     ) items GROUP BY name ORDER BY SUM(quantity) DESC LIMIT 3`, [tenantId, d]);

  const porMetodoPago: VentasResumen["porMetodoPago"] = {};
  const porCajero: VentasResumen["porCajero"] = {};
  let totalVentas = 0, cantidadOrdenes = 0;

  const accum = (r: Row) => {
    const t = parseFloat(r.total), c = parseInt(r.cantidad);
    totalVentas += t; cantidadOrdenes += c;
    const pm = r.payment_method;
    porMetodoPago[pm] = { cantidad: (porMetodoPago[pm]?.cantidad ?? 0) + c, total: (porMetodoPago[pm]?.total ?? 0) + t };
    return { t, c };
  };

  for (const r of orderRows) accum(r);
  for (const r of saleRows) {
    accum(r);
    const caj = r.cashier_id ?? "sin_cajero";
    const t = parseFloat(r.total), c = parseInt(r.cantidad);
    porCajero[caj] = { cantidad: (porCajero[caj]?.cantidad ?? 0) + c, total: (porCajero[caj]?.total ?? 0) + t };
  }

  return {
    fecha: d, totalVentas, cantidadOrdenes,
    ticketPromedio: cantidadOrdenes > 0 ? totalVentas / cantidadOrdenes : 0,
    porMetodoPago, porCajero,
    topProductos: topProducts.map((p) => ({ name: p.name, cantidad: parseInt(p.cantidad), total: parseFloat(p.total) })),
  };
}
