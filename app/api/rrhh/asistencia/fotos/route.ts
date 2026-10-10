import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { listarFotosAsistencia } from "@/lib/rrhh/asistencia-fotos.server";
import type { RespuestaFotosAsistencia } from "@/lib/rrhh/asistencia-fotos";
import { esFechaKey } from "@/lib/rrhh/fechas";
import { RRHH_MARCAR } from "@/lib/rrhh/roles";

/** GET /api/rrhh/asistencia/fotos?fecha=AAAA-MM-DD (default hoy Lima) → fotos del día. 422 si la fecha no existe. */
export const GET = withApiHandler("rrhh-asistencia-fotos", async (req: NextRequest) => {
  const rl = applyRateLimit(req, "GENEROUS", "rrhh-asistencia-fotos");
  if (rl) return rl;
  const auth = await requireAdmin(req, [...RRHH_MARCAR]);
  if (auth instanceof NextResponse) return auth;

  const fecha = req.nextUrl.searchParams.get("fecha") ?? limaDateKey();
  if (!esFechaKey(fecha)) {
    return NextResponse.json({ ok: false, error: "fecha_invalida" } satisfies RespuestaFotosAsistencia, { status: 422 });
  }
  try {
    const fotos = await listarFotosAsistencia(auth.tenantId, fecha, auth.role);
    return NextResponse.json({ ok: true, fotos } satisfies RespuestaFotosAsistencia, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    logger.error("[rrhh.asistencia-fotos] GET falló", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ ok: false, error: "no_se_pudo_leer" } satisfies RespuestaFotosAsistencia, { status: 500 });
  }
});
