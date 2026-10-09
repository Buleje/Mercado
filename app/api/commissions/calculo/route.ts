import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { CommissionsDB } from "@/lib/db/commissions.db";
import { CommissionRulesDB } from "@/lib/db/commission-rules.db";
import { CommissionPagosDB } from "@/lib/db/commission-pagos.db";
import { logger } from "@/lib/logger";
import { calcularComisiones, rangoLima } from "@/lib/comisiones/calcular";

const QuerySchema = z
  .object({ from: z.string().date(), to: z.string().date() })
  .refine((q) => q.from <= q.to, { message: "La fecha inicial va antes que la final." });

/**
 * GET /api/commissions/calculo?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Lo ganado por cada vendedor en el período, calculado acá (no en el
 * navegador): ventas netas de devoluciones × la regla de `CommissionRule`
 * que le toca, menos lo ya pagado como gasto «Comisiones». Fechas en hora de
 * Lima. Ver `lib/comisiones/calcular.ts`.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const parsed = QuerySchema.safeParse({
    from: req.nextUrl.searchParams.get("from") ?? undefined,
    to: req.nextUrl.searchParams.get("to") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Fechas inválidas (YYYY-MM-DD)." },
      { status: 400 },
    );
  }
  const { from, to } = parsed.data;

  try {
    const rango = rangoLima(from, to);
    const [ventas, reglas, gastos] = await Promise.all([
      CommissionsDB.cashierSummary(auth.tenantId, rango),
      CommissionRulesDB.list(auth.tenantId),
      CommissionPagosDB.list(auth.tenantId),
    ]);
    const resultado = calcularComisiones(
      from,
      to,
      ventas,
      reglas.map((r) => ({ id: r.id, cashierId: r.cashierId, label: r.label, minSales: Number(r.minSales), maxSales: r.maxSales == null ? null : Number(r.maxSales), rate: Number(r.rate) })),
      gastos,
    );
    return NextResponse.json(resultado);
  } catch (err) {
    logger.error("[commissions/calculo] GET error", { err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "No se pudieron calcular las comisiones." }, { status: 503 });
  }
}
