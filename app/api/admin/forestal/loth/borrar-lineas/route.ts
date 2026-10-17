import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { MAX_LINEAS_A_BORRAR } from "@/lib/forestal/loth-borrar-del-plan";
import { lothErrorResponse, lothValidationResponse } from "@/lib/forestal/loth-api-errors";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { isSpecializationEnabled } from "@/lib/specializations";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/loth/borrar-lineas — borrar lo elegido en «Secciones»
 * (Brandon 07-10-2026: «escoger y eliminar los procesos —tala, trozado,
 * despacho de trozas— según lo escogido por permiso o titular»).
 *
 *   POST ?vista=1 { ids[], incluirLoQueCuelga? } → el plan de borrado SIN
 *        escribir: por sección, por plan y lo que se salta con su motivo.
 *   POST          { ids[], incluirLoQueCuelga? } → lo borra (soft) en UNA tx.
 *
 * Las mismas guardas que «Borrar operaciones del plan» (mes cerrado, Libro
 * CTP, nada colgando). El negocio sale del JWT: un id de otro negocio no se
 * encuentra y se cuenta en `ignoradas`. Sólo admin/dueño.
 */

const bodySchema = z.object({
  ids: z
    .array(z.string().trim().min(1).max(64))
    .min(1, "Elige al menos una línea.")
    .max(MAX_LINEAS_A_BORRAR, `Son más de ${MAX_LINEAS_A_BORRAR} líneas: filtra un poco más.`),
  incluirLoQueCuelga: z.boolean().optional(),
});

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export const POST = withApiHandler("forestal-loth-borrar-lineas-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const prohibido = soloAdminODueno(auth.role, "borrar líneas del libro");
  if (prohibido) return prohibido;
  const vista = new URL(req.url).searchParams.get("vista") === "1";
  const rl = vista ? applyRateLimit(req, "GENEROUS", "loth") : applyRateLimit(req, "STRICT", "loth-borrar-lineas");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return lothValidationResponse(parsed.error);
  try {
    const r = await ForestLothDB.softDeleteLineas(auth.tenantId, parsed.data.ids, auth.username ?? "unknown", {
      simular: vista,
      incluirLoQueCuelga: parsed.data.incluirLoQueCuelga === true,
    });
    /* Ninguno de los ids es una línea viva de este negocio: no hay nada que mirar. */
    if (r.ignoradas === r.pedidas) {
      return NextResponse.json(
        { error: "not_found", message: "Esas líneas no existen en este negocio o ya se borraron." },
        { status: 404 },
      );
    }
    return NextResponse.json(r);
  } catch (err) {
    return lothErrorResponse(err, vista ? "loth.borrar-lineas.vista" : "loth.borrar-lineas.POST", auth.tenantId);
  }
});
