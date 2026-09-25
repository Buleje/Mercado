import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { ColaboradoresDB } from "@/lib/db/rrhh-colaboradores.db";
import { RRHH_MARCAR, nivelDeRol } from "@/lib/rrhh/roles";
import type { ResumenRrhhDTO } from "@/lib/rrhh/tipos";

/** GET /api/rrhh/resumen — KPIs del hub; el nivel lo decide el servidor, nunca el cliente (ADR-414 §7). */
export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "GENEROUS", "rrhh-lectura");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, [...RRHH_MARCAR]);
  if (auth instanceof NextResponse) return auth;
  const nivel = nivelDeRol(auth.role);
  if (!nivel) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const hoy = limaDateKey();
    const { personal, hoyAsistencia, contratos } = await ColaboradoresDB.resumen(auth.tenantId, hoy);
    const body: ResumenRrhhDTO = {
      nivel,
      hoy,
      personal,
      hoyAsistencia,
      ...(nivel === "marcar" ? {} : { contratos }),
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[rrhh/resumen] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
