import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { CommissionsDB } from "@/lib/db/commissions.db";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

/**
 * GET /api/commissions?from=2025-01-01&to=2025-01-31
 *
 * Returns sales grouped by cashierId con revenue/cogs/profit netos de
 * devoluciones, para cálculo de comisiones del equipo.
 *
 * Audit 2026-05-17 P1-1 (regla #1): migrado a CommissionsDB.cashierSummary.
 * Audit 2026-05-17 P1-5: Zod en query params (antes new Date() sin validar).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const parsed = QuerySchema.safeParse({
      from: req.nextUrl.searchParams.get("from") ?? undefined,
      to: req.nextUrl.searchParams.get("to") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos (esperado YYYY-MM-DD)", issues: parsed.error.issues.map(i => i.message) },
        { status: 400 },
      );
    }

    const result = await CommissionsDB.cashierSummary(auth.tenantId, {
      from: parsed.data.from ? new Date(parsed.data.from) : undefined,
      to: parsed.data.to ? new Date(parsed.data.to + "T23:59:59Z") : undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    logger.error("[commissions] GET error", { err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Error al cargar comisiones" }, { status: 503 });
  }
}
