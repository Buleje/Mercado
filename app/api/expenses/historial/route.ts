import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ExpensesDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { toErrorPayload } from "@/lib/api-error";
import { logger } from "@/lib/logger";

/**
 * GET /api/expenses/historial
 *
 * Audit 2026-05-17 (feature compras — Historial de Gastos): vista
 * unificada que agrega gastos de TODOS los módulos del negocio:
 *  - Expense table (gastos manuales — alquiler, servicios, etc.)
 *  - PurchaseOrder con status "recibido"|"pagado" (compras a proveedores)
 *
 * Query params:
 *  - from, to (ISO datetime)
 *  - source (all | expense | purchase) — default all
 */

const QuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  source: z.enum(["all", "expense", "purchase"]).optional().default("all"),
});

export async function GET(req: NextRequest) {
  const _rl = await applyRateLimit(req, "GENEROUS", "expenses-historial"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      source: searchParams.get("source") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    const items = await ExpensesDB.getHistorialUnificado(auth.tenantId, {
      from: parsed.data.from ? new Date(parsed.data.from) : undefined,
      to: parsed.data.to ? new Date(parsed.data.to) : undefined,
      source: parsed.data.source,
    });

    // KPIs agregados. Los totales se calculan acá, en el backend: el cliente
    // sólo los muestra (regla #6 del proyecto).
    const redondear = (n: number) => Math.round(n * 100) / 100;
    const totalGastado = items.reduce((s, i) => s + i.amount, 0);
    // Cuánto de eso ya salió de la caja: una OC recibida y sin pagar es gasto
    // devengado, no plata que se fue.
    const totalPagado = items.reduce((s, i) => s + i.montoPagado, 0);
    const porCategoria = items.reduce<Record<string, number>>((acc, i) => {
      acc[i.category] = redondear((acc[i.category] ?? 0) + i.amount);
      return acc;
    }, {});
    const porSource = {
      expense: items.filter((i) => i.source === "expense").reduce((s, i) => s + i.amount, 0),
      purchase: items.filter((i) => i.source === "purchase").reduce((s, i) => s + i.amount, 0),
    };

    return NextResponse.json({
      items,
      kpis: {
        totalGastado: redondear(totalGastado),
        totalPagado: redondear(totalPagado),
        totalPorPagar: redondear(totalGastado - totalPagado),
        cantidadGastos: items.length,
        porCategoria,
        porSource: { expense: redondear(porSource.expense), purchase: redondear(porSource.purchase) },
      },
    });
  } catch (err) {
    logger.error("[expenses/historial] GET error", {
      err: err instanceof Error ? err.message : String(err),
    });
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
