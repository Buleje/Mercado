import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { assertCsrf } from "@/lib/auth/csrf";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";

/**
 * POST /api/admin/forestal/trozas/renumerar — le da un correlativo nuevo y libre
 * a las trozas cuyo código de planta está repetido (ADR-336).
 *
 * Es la única vía para tocar un código ya asignado, y existe por una razón
 * concreta: el libro heredó 61 códigos repetidos de antes de que la unicidad
 * fuera regla. Mientras exista uno, dos piezas de la pila comparten la marca
 * pintada y el índice único de Postgres no se puede crear.
 *
 * Al terminar intenta poner ese candado: cuando el último duplicado se resuelve,
 * el problema deja de ser posible sin que nadie tenga que acordarse.
 */

const schema = z.object({
  /** Las piezas a renumerar. Tope 500: es una limpieza, no una migración. */
  trozaIds: z.array(z.string().trim().min(1).max(60)).min(1).max(500),
});

export async function POST(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "GENEROUS", "ctp:trozas");
    if (rl) return rl;
    const auth = await requireAdmin(req, ["admin", "owner"]);
    if (auth instanceof NextResponse) return auth;
    const csrf = assertCsrf(req);
    if (csrf) return csrf;
    const habilitado = await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro");
    if (!habilitado) return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
        { status: 400 },
      );
    }

    const r = await WoodEntriesDB.renumerarCodigosPlanta(
      auth.tenantId,
      parsed.data.trozaIds,
      auth.username ?? "unknown",
    );
    // El candado se intenta SIEMPRE, no sólo cuando la limpieza salió redonda:
    // la última pieza puede haberla resuelto otra pestaña.
    const candado = await WoodEntriesDB.intentarCandadoCodigoPlanta();
    return NextResponse.json({ ...r, candado });
  } catch (e) {
    return ctpErrorResponse(e, "forestal.trozas.renumerar", "");
  }
}
