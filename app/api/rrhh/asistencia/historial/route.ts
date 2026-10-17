import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { AsistenciaDB } from "@/lib/db/rrhh-asistencia.db";
import { ColaboradoresDB } from "@/lib/db/rrhh-colaboradores.db";
import { aAsistenciaDTO } from "@/lib/rrhh/dto";
import { esFechaKey } from "@/lib/rrhh/fechas";
import { RRHH_MARCAR, nivelDeRol } from "@/lib/rrhh/roles";

/** GET /api/rrhh/asistencia/historial?colaboradorId=&fecha= — todas las versiones de UN día. */
export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "GENEROUS", "rrhh-asistencia");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, [...RRHH_MARCAR]);
  if (auth instanceof NextResponse) return auth;
  const nivel = nivelDeRol(auth.role);
  if (!nivel) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const colaboradorId = searchParams.get("colaboradorId");
  const fecha = searchParams.get("fecha");
  if (!colaboradorId || !fecha || !esFechaKey(fecha)) {
    return NextResponse.json({ error: "validation_error" }, { status: 422 });
  }

  try {
    if (!(await ColaboradoresDB.existe(auth.tenantId, colaboradorId))) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const versiones = await AsistenciaDB.historial(auth.tenantId, colaboradorId, fecha);
    return NextResponse.json(
      { versiones: versiones.map((v) => aAsistenciaDTO(v, true)) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    logger.error("[rrhh/asistencia/historial] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
