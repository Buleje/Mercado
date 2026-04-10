/**
 * Tool: get_fiado_vencido
 * Returns customers with overdue credit (fiados) for a given tenant.
 *
 * Schema refs: Fiado (id, tenantId, customerId, total, saldo, descripcion,
 *   status [ACTIVO|PAGADO|VENCIDO|CANCELADO], fechaVence, createdAt)
 * Joined with: Customer (phone as PK, name, tenantId)
 */

import { query } from "../db.js";
import type { FiadoVencido } from "../types.js";

/**
 * Fetches all fiados with status ACTIVO or VENCIDO where fechaVence < today.
 * Returns customer info, amounts, and days overdue.
 * @param tenantId - Tenant isolation (required, rule #3)
 */
export async function getFiadoVencido(tenantId: string): Promise<FiadoVencido[]> {
  const rows = await query<{
    id: string;
    customer_id: string;
    customer_name: string;
    customer_phone: string;
    total: string;
    saldo: string;
    descripcion: string | null;
    status: string;
    fecha_vence: string | null;
    dias_vencido: number;
    created_at: string;
  }>(
    `SELECT
       f.id,
       f."customerId"   AS customer_id,
       c.name           AS customer_name,
       c.phone          AS customer_phone,
       f.total::text,
       f.saldo::text,
       f.descripcion,
       f.status::text,
       f."fechaVence"::text AS fecha_vence,
       GREATEST(0, EXTRACT(DAY FROM NOW() - f."fechaVence")::int) AS dias_vencido,
       f."createdAt"::text AS created_at
     FROM "Fiado" f
     JOIN "Customer" c ON c.phone = f."customerId"
     WHERE f."tenantId" = $1
       AND f.status IN ('ACTIVO', 'VENCIDO')
       AND f."fechaVence" IS NOT NULL
       AND f."fechaVence" < NOW()
     ORDER BY f."fechaVence" ASC`,
    [tenantId]
  );

  return rows.map((r) => ({
    id: r.id,
    customerId: r.customer_id,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    total: parseFloat(r.total),
    saldo: parseFloat(r.saldo),
    descripcion: r.descripcion,
    status: r.status as FiadoVencido["status"],
    fechaVence: r.fecha_vence,
    diasVencido: r.dias_vencido,
    createdAt: r.created_at,
  }));
}
