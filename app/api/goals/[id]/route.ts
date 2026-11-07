import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { leerJson } from "@/lib/errores/sin-dato";
import { AdminGoalsDB, type MotivoMetaNoEditada } from "@/lib/db/admin-goals.db";
import { MENSAJES_REGLA_META, metaEditarSchema, reglaMetaRota } from "@/lib/admin/metas-tareas";

type Contexto = { params: Promise<{ id: string }> };

/** Lo que ve la persona cuando el cambio no se guardó (ADR-488). */
const NO_EDITADA: Readonly<Record<MotivoMetaNoEditada, { status: number; error: string }>> = {
  no_existe: { status: 404, error: "La meta ya no existe" },
  avance_solo_manual: { status: 422, error: MENSAJES_REGLA_META.avance_solo_manual },
  unidad_no_valida: { status: 422, error: MENSAJES_REGLA_META.unidad_no_valida },
  cambio_en_paralelo: { status: 409, error: "Alguien cambió esta meta mientras la editabas. Vuelve a abrirla." },
};

/**
 * PATCH — cambia sólo los campos que llegan. `{ current }` sólo en una meta a
 * mano: en las demás el avance sale de los datos (ADR-488) → 422.
 */
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
    const regla = reglaMetaRota(parsed.error.issues);
    return NextResponse.json(
      {
        error: regla ? MENSAJES_REGLA_META[regla] : "Revisa los datos de la meta",
        code: regla ?? "validation_error",
        issues: parsed.error.issues,
      },
      { status: 422 },
    );
  }

  try {
    const r = await AdminGoalsDB.editar(auth.tenantId, id, parsed.data);
    if (!r.ok) {
      const { status, error } = NO_EDITADA[r.motivo];
      return NextResponse.json({ error, code: r.motivo }, { status });
    }
    return NextResponse.json(r.meta);
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
