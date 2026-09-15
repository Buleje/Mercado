import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { leerJson } from "@/lib/errores/sin-dato";
import { AdminGoalsDB } from "@/lib/db/admin-goals.db";
import { metaEditarSchema } from "@/lib/admin/metas-tareas";

type Contexto = { params: Promise<{ id: string }> };

/** PATCH — cambia sólo los campos que llegan (`{ current }` al mover el avance). */
export async function PATCH(req: NextRequest, { params }: Contexto) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const _rl = applyRateLimit(req, "MODERATE", "goals-X");
  if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const parsed = metaEditarSchema.safeParse(await leerJson(req));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Revisa los datos de la meta", code: "validation_error", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  try {
    const meta = await AdminGoalsDB.editar(auth.tenantId, id, parsed.data);
    if (!meta) return NextResponse.json({ error: "La meta ya no existe" }, { status: 404 });
    return NextResponse.json(meta);
  } catch (e) {
    logger.error("[goals] PATCH error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo guardar la meta. Reintenta." }, { status: 503 });
  }
}

/**
 * DELETE — idempotente: si la meta ya no estaba, el resultado es el mismo.
 * GoalsTab repone la meta en pantalla ante cualquier error, así que un 404 la
 * haría reaparecer.
 */
export async function DELETE(req: NextRequest, { params }: Contexto) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const _rl = applyRateLimit(req, "MODERATE", "goals-X");
  if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    await AdminGoalsDB.borrar(auth.tenantId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[goals] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo eliminar la meta. Reintenta." }, { status: 503 });
  }
}
