import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { leerJson } from "@/lib/errores/sin-dato";
import { AdminTasksDB } from "@/lib/db/admin-tasks.db";
import { tareaCrearSchema } from "@/lib/admin/metas-tareas";

/**
 * /api/tasks — tareas del equipo del negocio de la sesión (ADR-415).
 *
 * Antes era `local-data/tasks.json`: una sola lista para todos los negocios, y
 * en Vercel (disco de sólo lectura) no se guardaba ninguna.
 */

/** GET — array de tareas, las más nuevas primero. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const tareas = await AdminTasksDB.listar(auth.tenantId);
    return NextResponse.json(tareas, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[tasks] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudieron cargar las tareas" }, { status: 503 });
  }
}

/** POST — crear una tarea; siempre nace `pendiente`. */
export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const _rl = applyRateLimit(req, "MODERATE", "tasks");
  if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = tareaCrearSchema.safeParse(await leerJson(req));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Revisa los datos de la tarea", code: "validation_error", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  try {
    const tarea = await AdminTasksDB.crear(auth.tenantId, parsed.data, auth.username);
    return NextResponse.json(tarea, { status: 201 });
  } catch (e) {
    logger.error("[tasks] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo guardar la tarea. Reintenta." }, { status: 503 });
  }
}
