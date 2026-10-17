import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { leerJson } from "@/lib/errores/sin-dato";
import { PlanEmpresaDB } from "@/lib/db/plan-empresa.db";
import {
  ROLES_ESCRIBIR_PLAN,
  ROLES_LEER_PLAN,
  puedeEditarSeccion,
  puedeVerSeccion,
} from "@/lib/admin/planificacion-acceso";
import { NOMBRE_SECCION, esSeccionPlan, type ConflictoSeccion } from "@/lib/planificacion/secciones";

/**
 * /api/admin/planificacion/[seccion]/historial — «Versiones anteriores» (ADR-497).
 *
 * GET  → `{ versiones: VersionSeccion[] }`, la más nueva primero (máx 30).
 * POST `{ version }` → copia esa versión como una nueva (la de ahora + 1) y
 *      devuelve `SeccionGuardada`. Lo de ahora queda en el historial.
 * Socios e inversión: sólo admin y dueño, para leer y para volver.
 */

type Contexto = { params: Promise<{ seccion: string }> };

const restaurarSchema = z.object({ version: z.number().int().min(1) });

const noExiste = () => NextResponse.json({ error: "Esa sección del plan no existe", code: "not_found" }, { status: 404 });
const prohibido = () =>
  NextResponse.json({ error: "Sólo el administrador o el dueño ven esta sección", code: "forbidden" }, { status: 403 });

export async function GET(req: NextRequest, { params }: Contexto) {
  const auth = await requireAdmin(req, ROLES_LEER_PLAN);
  if (auth instanceof NextResponse) return auth;

  const { seccion } = await params;
  if (!esSeccionPlan(seccion)) return noExiste();
  if (!puedeVerSeccion(auth.role, seccion)) return prohibido();

  try {
    const versiones = await PlanEmpresaDB.historial(auth.tenantId, seccion);
    return NextResponse.json({ versiones }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[planificacion] historial GET error", { seccion, err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo leer el historial" }, { status: 503 });
  }
}

export async function POST(req: NextRequest, { params }: Contexto) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const _rl = applyRateLimit(req, "MODERATE", "planificacion-historial");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, ROLES_ESCRIBIR_PLAN);
  if (auth instanceof NextResponse) return auth;

  const { seccion } = await params;
  if (!esSeccionPlan(seccion)) return noExiste();
  if (!puedeEditarSeccion(auth.role, seccion)) return prohibido();

  const cuerpo = restaurarSchema.safeParse(await leerJson(req));
  if (!cuerpo.success) {
    return NextResponse.json({ error: "Falta la versión a la que volver", code: "validation_error", issues: cuerpo.error.issues }, { status: 422 });
  }

  try {
    const r = await PlanEmpresaDB.restaurar(auth.tenantId, seccion, cuerpo.data.version, auth.username);
    if (r.ok) return NextResponse.json(r.guardada);
    if (r.motivo === "no_existe") {
      return NextResponse.json({ error: `La versión ${cuerpo.data.version} ya no está guardada`, code: "not_found" }, { status: 404 });
    }
    const conflicto: ConflictoSeccion = {
      error: `«${NOMBRE_SECCION[seccion]}» cambió recién: vuelve a abrir el historial`,
      code: "cambio_en_paralelo",
      actual: r.actual,
    };
    return NextResponse.json(conflicto, { status: 409 });
  } catch (e) {
    logger.error("[planificacion] historial POST error", { seccion, err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo volver a esa versión. Reintenta." }, { status: 503 });
  }
}
