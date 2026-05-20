import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getOrSet } from "@/lib/cache";
import { AdminTodaySummaryDB } from "@/lib/db/admin-today-summary.db";

/**
 * GET /api/admin/today-summary
 *
 * Resumen ejecutivo del día: ventas, pedidos, alertas, stock bajo.
 * Usado por el widget "Mi Negocio Hoy" en el admin.
 *
 * @cajero ok — Brandon 2026-05-16 (audit Info): cajero puede leer porque
 * el widget aparece en su pantalla de Ventas/Caja para que entienda el
 * contexto del día. Es solo-lectura, no modifica nada. PII está enmascarada
 * o agregada (counts/sums) — no expone teléfonos crudos.
 *
 * Audit project-wide 2026-05-19: migrado a AdminTodaySummaryDB.
 * 7 prisma.* directos (sale.aggregate x2, order.aggregate, order.count,
 * product.count x2, batch.count, saleItem.groupBy) encapsulados en
 * un solo método paralelo via Promise.all.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const data = await getOrSet(
      `today-summary:${auth.tenantId}`,
      120, // 2 min TTL
      () => AdminTodaySummaryDB.getSummaryForTenant(auth.tenantId),
    );
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
