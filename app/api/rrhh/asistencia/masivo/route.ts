import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { limaDateKey } from "@/lib/utils";
import { AsistenciaDB } from "@/lib/db/rrhh-asistencia.db";
import { RRHH_MARCAR, nivelDeRol, ventanaDeMarcado } from "@/lib/rrhh/roles";
import { masivoSchema } from "@/lib/rrhh/schemas";

/** POST /api/rrhh/asistencia/masivo — «Todos presentes»: sólo a quien no tiene marca, salvo `sobrescribir`. */
export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const _rl = applyRateLimit(req, "GENEROUS", "rrhh-asistencia");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, [...RRHH_MARCAR]);
  if (auth instanceof NextResponse) return auth;
  const nivel = nivelDeRol(auth.role);
  if (!nivel) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "validation_error" }, { status: 422 });
  }
  const parsed = masivoSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 422 });
  }

  const hoy = limaDateKey();
  if (parsed.data.fecha > hoy) {
    return NextResponse.json({ error: "validation_error", message: "Todavía no llega ese día." }, { status: 422 });
  }
  const ventana = ventanaDeMarcado(nivel, auth.role, hoy);
  if (ventana.desde != null && parsed.data.fecha < ventana.desde) {
    return NextResponse.json({ error: "fuera_de_ventana" }, { status: 403 });
  }

  try {
    const resultado = await AsistenciaDB.masivo(auth.tenantId, parsed.data, { usuario: auth.username, hoy, ventana });
    const total = resultado.creadas + resultado.reemplazadas;
    if (total > 0) {
      logActivity(
        "rrhh_asistencia_corregir",
        "Asistencia",
        `Marcó masivo del ${parsed.data.fecha}: ${resultado.creadas} nuevas, ${resultado.reemplazadas} reemplazadas`,
        undefined,
        auth.username,
        undefined,
        auth.tenantId,
      ).catch(() => {});
    }
    return NextResponse.json(resultado);
  } catch (e) {
    logger.error("[rrhh/asistencia/masivo] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
