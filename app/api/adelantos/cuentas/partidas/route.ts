import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { CuentaForestalDeshabilitadaError, LiquidacionCuentaDB } from "@/lib/db/liquidacion-cuenta.db";
import { huellaDe } from "@/lib/cuentas/liquidacion";

/**
 * GET /api/adelantos/cuentas/partidas?beneficiario=&parte= — lo que se puede
 * liquidar de una persona y su huella (ADR-413). Liquidar es plata con un
 * tercero: sólo admin y dueño.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  /* Lecturas en su propio bucket: abrir el modal gasta 2 (partidas + historial) y anular 2 más.
     Con MODERATE (20 cada 5 min) revisar 10 cuentas seguidas daba 429 sin haber escrito nada. */
  const rl = await applyRateLimit(req, "GENEROUS", "adelantos-liquidacion-lectura");
  if (rl) return rl;
  const sp = req.nextUrl.searchParams;
  const beneficiarioId = sp.get("beneficiario")?.trim() || undefined;
  const parteId = sp.get("parte")?.trim() || undefined;
  if (!beneficiarioId && !parteId) {
    return NextResponse.json({ error: "persona_requerida", message: "Elige a la persona." }, { status: 400 });
  }
  try {
    const partidas = await LiquidacionCuentaDB.partidas(auth.tenantId, { beneficiarioId, parteId });
    if (!partidas) return NextResponse.json({ error: "persona_no_encontrada", message: "Esa persona no existe en este negocio." }, { status: 404 });
    return NextResponse.json({ partidas, huella: huellaDe(partidas) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof CuentaForestalDeshabilitadaError) {
      return NextResponse.json({ error: "specialization_disabled", message: e.message }, { status: 403 });
    }
    logger.error("[adelantos/cuentas/partidas] GET error", { err: e instanceof Error ? e.message : String(e), tenantId: auth.tenantId });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
