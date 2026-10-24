import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { PlanEmpresaDB } from "@/lib/db/plan-empresa.db";
import { MembreteDB } from "@/lib/db/membrete.db";
import { ROLES_LEER_PLAN, puedeEditarPlan, seccionesOcultas } from "@/lib/admin/planificacion-acceso";
import { SECCIONES_PLAN, type PlanEmpresaRespuesta } from "@/lib/planificacion/secciones";

/**
 * GET /api/admin/planificacion — el plan de la empresa entero (ADR-497).
 *
 * Todas las secciones que el rol puede ver (las nunca guardadas con
 * `version: 0` y vacías), `ocultas` = socios e inversión si no es admin/dueño,
 * `puedeEditar` y el membrete (nombre, RUC, logo, teléfono y dirección viven en
 * Configuración: el plan los muestra, no los vuelve a pedir).
 */

const SIN_MEMBRETE: PlanEmpresaRespuesta["membrete"] = { nombre: null, ruc: null, logoUrl: null, telefono: null, direccion: null };

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES_LEER_PLAN);
  if (auth instanceof NextResponse) return auth;

  try {
    const ocultas = seccionesOcultas(auth.role);
    const visibles = SECCIONES_PLAN.filter((s) => !ocultas.includes(s));
    const [secciones, membrete] = await Promise.all([
      PlanEmpresaDB.leer(auth.tenantId, visibles),
      // El membrete es un adorno de la cabecera: si falla, el plan se abre igual.
      MembreteDB.del(auth.tenantId)
        .then(({ nombre, ruc, logoUrl, telefono, direccion }) => ({ nombre, ruc, logoUrl, telefono, direccion }))
        .catch((err: unknown) => {
          logger.warn("[planificacion] membrete no disponible", { err: err instanceof Error ? err.message : String(err) });
          return SIN_MEMBRETE;
        }),
    ]);
    const cuerpo: PlanEmpresaRespuesta = { secciones, ocultas, puedeEditar: puedeEditarPlan(auth.role), membrete };
    return NextResponse.json(cuerpo, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[planificacion] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo leer el plan de la empresa" }, { status: 503 });
  }
}
