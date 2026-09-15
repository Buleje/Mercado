import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { leerJson } from "@/lib/errores/sin-dato";
import { AdminTasksDB } from "@/lib/db/admin-tasks.db";
import { tareaEditarSchema } from "@/lib/admin/metas-tareas";

type Contexto = { params: Promise<{ id: string }> };

/** PATCH — cambia sólo los campos que llegan; `completedAt` lo decide el servidor al cambiar el estado. */
export async function PATCH(req: NextRequest, { params }: Contexto) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const _rl = applyRateLimit(req, "MODERATE", "tasks-X");
  if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const parsed = tareaEditarSchema.safeParse(await leerJson(req));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Revisa los datos de la tarea", code: "validation_error", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  try {
    const tarea = await AdminTasksDB.editar(auth.tenantId, id, parsed.data);
    if (!tarea) return NextResponse.json({ error: "La tarea ya no existe" }, { status: 404 });
    return NextResponse.json(tarea);
  } catch (e) {
    logger.error("[tasks] PATCH error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo guardar la tarea. Reintenta." }, { status: 503 });
  }
}

/** DELETE — idempotente: si la tarea ya no estaba, el resultado es el mismo. */
export async function DELETE(req: NextRequest, { params }: Contexto) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const _rl = applyRateLimit(req, "MODERATE", "tasks-X");
  if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    await AdminTasksDB.borrar(auth.tenantId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[tasks] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo eliminar la tarea. Reintenta." }, { status: 503 });
  }
}
