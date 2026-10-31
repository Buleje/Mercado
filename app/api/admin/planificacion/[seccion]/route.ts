import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { leerJson } from "@/lib/errores/sin-dato";
import { PlanEmpresaDB } from "@/lib/db/plan-empresa.db";
import { ROLES_ESCRIBIR_PLAN, puedeEditarSeccion } from "@/lib/admin/planificacion-acceso";
import {
  NOMBRE_SECCION,
  SCHEMAS_SECCION,
  esSeccionPlan,
  guardarSeccionSchema,
  type ConflictoSeccion,
  type DatosSeccion,
  type SeccionPlan,
} from "@/lib/planificacion/secciones";

/**
 * PUT /api/admin/planificacion/[seccion] — guarda una sección entera (ADR-497).
 *
 * Body `{ version, datos }`: `version` = la que el cliente editó (0 = nunca se
 * guardó). Si otro guardó primero → 409 `ConflictoSeccion` con lo de ahora; si
 * no → `SeccionGuardada` con version + 1.
 *
 * Rate limit GENEROUS (100/min): el panel autoguarda 1,2 s después de dejar de
 * escribir, así que MODERATE (20 cada 5 min) cortaba a los pocos minutos de
 * escribir la misión o el FODA.
 */

type Contexto = { params: Promise<{ seccion: string }> };

const TOPE_SECCION_BYTES = 512_000;

export async function PUT(req: NextRequest, { params }: Contexto) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const _rl = applyRateLimit(req, "GENEROUS", "planificacion");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, ROLES_ESCRIBIR_PLAN);
  if (auth instanceof NextResponse) return auth;

  const { seccion } = await params;
  if (!esSeccionPlan(seccion)) {
    return NextResponse.json({ error: "Esa sección del plan no existe", code: "not_found" }, { status: 404 });
  }
  // `requireAdmin` deja pasar al manager siempre: socios e inversión se cierran acá.
  if (!puedeEditarSeccion(auth.role, seccion)) {
    return NextResponse.json({ error: "Sólo el administrador o el dueño cambian esta sección", code: "forbidden" }, { status: 403 });
  }

  const cuerpo = guardarSeccionSchema.safeParse(await leerJson(req));
  if (!cuerpo.success) {
    return NextResponse.json({ error: "Faltan la versión o los datos", code: "validation_error", issues: cuerpo.error.issues }, { status: 422 });
  }
  const datos = SCHEMAS_SECCION[seccion].safeParse(cuerpo.data.datos ?? {});
  if (!datos.success) {
    return NextResponse.json(
      { error: `Revisa los datos de «${NOMBRE_SECCION[seccion]}»`, code: "validation_error", issues: datos.error.issues },
      { status: 422 },
    );
  }
  // Los topes de Zod por lista suman varios MB en Objetivos (100 × 60 acciones), y
  // cada guardado deja su copia en el historial: una sección escrita a mano no
  // llega ni a 100 KB, así que más de 512 KB es un error o un abuso.
  if (JSON.stringify(datos.data).length > TOPE_SECCION_BYTES) {
    return NextResponse.json(
      { error: `«${NOMBRE_SECCION[seccion]}» quedó demasiado grande: pártela o borra lo que no uses`, code: "too_large" },
      { status: 413 },
    );
  }

  try {
    const r = await PlanEmpresaDB.guardar(
      auth.tenantId,
      seccion,
      datos.data as DatosSeccion<SeccionPlan>,
      cuerpo.data.version,
      auth.username,
    );
    if (!r.ok) {
      const conflicto: ConflictoSeccion = {
        error: r.actual.autor
          ? `${r.actual.autor} guardó «${NOMBRE_SECCION[seccion]}» mientras escribías`
          : `«${NOMBRE_SECCION[seccion]}» cambió mientras escribías`,
        code: "cambio_en_paralelo",
        actual: r.actual,
      };
      return NextResponse.json(conflicto, { status: 409 });
    }
    return NextResponse.json(r.guardada);
  } catch (e) {
    logger.error("[planificacion] PUT error", { seccion, err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se guardó. Reintenta." }, { status: 503 });
  }
}
