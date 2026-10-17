import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { isSpecializationEnabled } from "@/lib/specializations";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";

/**
 * POST /api/admin/forestal/trozas/etiquetas — imprimir etiquetas QR deja rastro (ADR-436).
 *
 * Body: `{ ids: string[] (1..500), asignarCodigo: boolean }`.
 *
 * Sella `etiquetadaEn` y suma `etiquetasImpresas` en las piezas que están en el
 * patio; con `asignarCodigo`, a la que no tiene código de planta le da su
 * correlativo ANTES de imprimir — así la etiqueta sale con la marca que se
 * pinta en el palo y no con el código del bosque.
 *
 * Responde `{ trozas, asignados, omitidas, sinCodigoNuevo, repetidos }`:
 * - `trozas`: las etiquetadas, releídas (con el código nuevo). Con ESTAS se
 *   imprime, no con las que tenía la pantalla.
 * - `omitidas`: no se etiquetaron (no están en el patio / no son del negocio).
 * - `sinCodigoNuevo`: se etiquetaron con el código del bosque (mes cerrado).
 * - `repetidos`: códigos impresos que también están en otra pieza del negocio.
 */

const schema = z.object({
  /** Tope 500: una hoja A4 son 21, un rollo de una guía grande ~60. */
  ids: z.array(z.string().trim().min(1).max(60)).min(1).max(500),
  asignarCodigo: z.boolean(),
});

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "GENEROUS", "ctp:trozas");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
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
      {
        error: "validation_error",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }

  try {
    const r = await WoodEntriesDB.marcarEtiquetadas(auth.tenantId, parsed.data.ids, {
      asignarCodigo: parsed.data.asignarCodigo,
      usuario: auth.username ?? "unknown",
    });
    return NextResponse.json(r);
  } catch (e) {
    return ctpErrorResponse(e, "forestal.trozas.etiquetas.POST", auth.tenantId);
  }
}
