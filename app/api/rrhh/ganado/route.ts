import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { GanadoDB } from "@/lib/db/rrhh-ganado.db";
import { esFechaKey, rangoDeDias } from "@/lib/rrhh/fechas";
import { RRHH_COMPLETO } from "@/lib/rrhh/roles";

const MAX_DIAS_RANGO = 93;

/** GET /api/rrhh/ganado?desde=&hasta=&colaboradorId= — lo ganado de referencia, sólo nivel completo. */
export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "GENEROUS", "rrhh-lectura");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, [...RRHH_COMPLETO]);
  if (auth instanceof NextResponse) return auth;

  const hoy = limaDateKey();
  const { searchParams } = req.nextUrl;
  const desde = searchParams.get("desde") ?? hoy;
  const hasta = searchParams.get("hasta") ?? hoy;
  const dias = rangoDeDias(desde, hasta);
  if (!esFechaKey(desde) || !esFechaKey(hasta) || dias.length === 0 || dias.length > MAX_DIAS_RANGO) {
    return NextResponse.json({ error: "rango_invalido" }, { status: 422 });
  }

  try {
    const ganado = await GanadoDB.periodo(auth.tenantId, {
      desde,
      hasta,
      hoy,
      colaboradorId: searchParams.get("colaboradorId") ?? undefined,
    });
    return NextResponse.json(ganado, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[rrhh/ganado] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
