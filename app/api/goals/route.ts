import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { leerJson } from "@/lib/errores/sin-dato";
import { AdminGoalsDB } from "@/lib/db/admin-goals.db";
import { metaCrearSchema } from "@/lib/admin/metas-tareas";

/**
 * /api/goals — metas del panel del negocio de la sesión (ADR-415).
 *
 * Antes era `local-data/goals.json`: una sola lista para todos los negocios, y
 * en Vercel (disco de sólo lectura) no se guardaba ninguna.
 */

/** GET — array de metas, en el orden en que se crearon. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const metas = await AdminGoalsDB.listar(auth.tenantId);
    return NextResponse.json(metas, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[goals] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudieron cargar las metas" }, { status: 503 });
  }
}

/** POST — crear una meta. */
export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const _rl = applyRateLimit(req, "MODERATE", "goals");
  if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = metaCrearSchema.safeParse(await leerJson(req));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Revisa los datos de la meta", code: "validation_error", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  try {
    const meta = await AdminGoalsDB.crear(auth.tenantId, parsed.data, auth.username);
    return NextResponse.json(meta, { status: 201 });
  } catch (e) {
    logger.error("[goals] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo guardar la meta. Reintenta." }, { status: 503 });
  }
}
