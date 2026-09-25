import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { ColaboradoresDB } from "@/lib/db/rrhh-colaboradores.db";
import { RRHH_COMPLETO } from "@/lib/rrhh/roles";

/** GET /api/rrhh/colaboradores/[id]/exportar — derecho de acceso (Ley 29733), sólo nivel completo. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _rl = applyRateLimit(req, "STRICT", "rrhh-exportar");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, [...RRHH_COMPLETO]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  try {
    const datos = await ColaboradoresDB.exportar(auth.tenantId, id);
    if (!datos) return NextResponse.json({ error: "not_found" }, { status: 404 });

    logActivity(
      "rrhh_colaborador_exportar",
      "Colaborador",
      `Exportó la ficha de ${datos.colaborador.nombre}`,
      id,
      auth.username,
      undefined,
      auth.tenantId,
    ).catch(() => {});

    return NextResponse.json(datos, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="colaborador-${id}.json"`,
      },
    });
  } catch (e) {
    logger.error("[rrhh/colaboradores/id/exportar] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
