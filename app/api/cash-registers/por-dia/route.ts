import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { CajaPorDiaDB } from "@/lib/db/caja-por-dia.db";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  /** Cuántos días hacia atrás (hoy incluido). */
  dias: z.coerce.number().int().min(1).max(366).default(60),
});

/**
 * GET /api/cash-registers/por-dia?dias=60 — Caja › Historial › Caja por día.
 *
 * Una fila por día de Lima con lo vendido (POS + pedidos que entran, la regla
 * de Mi Plata), el cuadre de las cajas cerradas (esperado, contado, diferencia,
 * faltante, sobrante, peor caja, cuántas sin conteo) y lo que guardó el resumen
 * del día (fiados, stock bajo, notas). Todo se calcula acá: la pantalla sólo
 * lo dibuja. Reemplaza a `/api/cierre-diario/history`, que leía el resumen del
 * cron (esperado 0 y contado vacío siempre).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "cash-por-dia");
  if (rl) return rl;

  const parsed = QuerySchema.safeParse({ dias: new URL(req.url).searchParams.get("dias") || undefined });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await CajaPorDiaDB.listar(auth.tenantId, { dias: parsed.data.dias }));
  } catch (e) {
    logger.error("[cash-registers/por-dia] GET error", { error: e instanceof Error ? e.message : String(e), tenantId: auth.tenantId });
    return NextResponse.json({ error: "No se pudo armar la caja por día" }, { status: 503 });
  }
}
