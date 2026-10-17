/**
 * GET /api/cotizaciones/disponibilidad?ids=1,2,3 — cuánto hay HOY de cada
 * producto cotizado (F26), con el mínimo efectivo de la regla única
 * (`stockMinimoDe` + el mínimo global del negocio). Sólo lee: cotizar no
 * aparta stock.
 */
import { NextRequest, NextResponse } from "next/server";
import { CotizacionesDB } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { minimoGlobalDelNegocio } from "@/lib/inventario/stock-minimo.server";
import { disponibilidadDe } from "@/lib/cotizaciones/disponibilidad";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;
  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isSafeInteger(n) && n > 0)
    .slice(0, 100);
  if (ids.length === 0) return NextResponse.json({ productos: [] });
  try {
    const [filas, minimoGlobal] = await Promise.all([
      CotizacionesDB.productosParaCotizar(auth.tenantId, ids),
      minimoGlobalDelNegocio(auth.tenantId),
    ]);
    return NextResponse.json({ productos: filas.map((p) => disponibilidadDe(p, minimoGlobal)) });
  } catch (e) {
    logger.error("[cotizaciones] disponibilidad", { err: e instanceof Error ? e.message : String(e), tenantId: auth.tenantId });
    return NextResponse.json({ error: "No se pudo revisar el stock" }, { status: 503 });
  }
}
