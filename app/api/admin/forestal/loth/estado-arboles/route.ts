import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/loth/estado-arboles — en qué punto de la cadena está
 * cada árbol del censo de un plan: en pie, talado, trozado, despachado (en
 * parte o entero) o en el CTP, con su tala, sus trozas, sus guías y los
 * avisos cuando el censo y el libro no dicen lo mismo. Lo pinta el mapa del
 * Libro TH sobre cada punto.
 *
 * Se calcula acá, con TODAS las líneas del plan: el mapa carga el libro con un
 * tope de 500 líneas y con un libro grande el estado saldría a medias.
 *
 * GET ?planId=X → { arboles: EstadoArbol[], sinCenso: string[] }
 *
 * Guard: requireAdmin → rate limit (bucket propio: el mapa ya gasta el de
 * `loth` al cargar) → spec:forestal:loth-libro. Sólo lectura.
 */

const querySchema = z.object({ planId: z.string().trim().min(1, "Falta el plan").max(64) });

export const GET = withApiHandler("forestal-loth-estado-arboles", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "loth-estado-arboles");
  if (rl) return rl;

  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }

  const parsed = querySchema.safeParse({ planId: new URL(req.url).searchParams.get("planId") ?? "" });
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", message: parsed.error.issues[0]?.message }, { status: 400 });
  }

  try {
    return NextResponse.json(await ForestLothDB.estadoDeArboles(auth.tenantId, parsed.data.planId));
  } catch (err) {
    logger.error("[loth.estado-arboles.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
