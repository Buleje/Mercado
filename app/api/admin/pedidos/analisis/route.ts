import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { PedidosOperacionDB, MAX_ANALISIS } from "@/lib/db/pedidos-operacion.db";
import { analizarPedidos, desdeDelPeriodo, esPeriodoAnalisis } from "@/lib/pedidos/analisis-operativo";

/**
 * Análisis operativo de pedidos (N06, 17-10). GET `?periodo=7|30|90|todo`
 * (por omisión 30). Todo se calcula acá: la pantalla sólo dibuja.
 * Sólo lectura; los montos son de pedidos, así que pide un rol de gestión o
 * de venta (el repartidor y el almacenero no ven plata del negocio).
 */
export async function GET(req: NextRequest) {
  const rl = applyRateLimit(req, "GENEROUS", "pedidos-analisis");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["cajero", "tienda_owner", "analista"]);
  if (auth instanceof NextResponse) return auth;
  const crudo = req.nextUrl.searchParams.get("periodo") ?? "30";
  const periodo = esPeriodoAnalisis(crudo) ? crudo : "30";
  const ahora = new Date();
  try {
    const { pedidos, activos, zonas, truncado } = await PedidosOperacionDB.paraAnalisis(
      auth.tenantId,
      desdeDelPeriodo(periodo, ahora),
    );
    const analisis = analizarPedidos(pedidos, activos, zonas, ahora);
    return NextResponse.json({ periodo, generado: ahora.toISOString(), truncado, tope: MAX_ANALISIS, analisis });
  } catch (err) {
    logger.error("[pedidos/analisis] GET falló", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "No pudimos calcular el análisis." }, { status: 503 });
  }
}
