import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { ForestLoteAserrioDB } from "@/lib/db/forest-lote-aserrio.db";
import { ForestJornadaBloqueDB } from "@/lib/db/forest-jornada-bloque.db";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";
import { abiertasDelLote, bloqueDeLoteConsumido } from "@/lib/forestal/bloque-de-lote-consumido";

/**
 * GET ?loteId= — el bloque de la Distribución de rolliza para un lote YA
 * consumido (ADR-521): un bloque que adopta la corrida abierta del lote, para
 * repartir lo aserrado en el cubicador y declararla desde el Recorrido.
 *
 * Sólo LEE: la pantalla siembra el bloque y lo guarda con la distribución.
 * 409 con `code` cuando no se puede armar sin adivinar (el lote no está
 * consumido, ninguna o varias corridas abiertas, la corrida comió piezas de
 * otro lote, más trozas de las que admite un bloque).
 *
 * Mismo guard que `/lotes-aserrio`: trabajo de patio (admin, almacenero y
 * dueño) con la especialización del libro.
 */

const querySchema = z.object({
  loteId: z.string().trim().min(1, "Falta el lote").max(120),
});

export async function GET(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "GENEROUS", "ctp:lote-a-distribucion");
    if (rl) return rl;
    const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
    if (auth instanceof NextResponse) return auth;
    if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
      return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
    }
    const parsed = querySchema.safeParse({ loteId: req.nextUrl.searchParams.get("loteId") ?? "" });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", message: parsed.error.issues[0]?.message ?? "Datos inválidos." },
        { status: 400 },
      );
    }
    const tenantId = auth.tenantId;
    /* El lote se busca con el tenant del JWT: un id de otro negocio no aparece (404). */
    const [lote] = await ForestLoteAserrioDB.list(tenantId, { ids: [parsed.data.loteId], limite: 1 });
    if (!lote) {
      return NextResponse.json(
        { error: "not_found", message: "Ese lote ya no está en el Libro: recarga la lista de lotes." },
        { status: 404 },
      );
    }
    /* Todas las piezas de la corrida (de cualquier lote): una que también comió
       madera de otro lote no se adopta. Sólo si hay UNA abierta; con 0 o
       varias, el helper ya dice por qué no. */
    const abiertas = abiertasDelLote(lote);
    const corrida =
      lote.status === "consumido" && abiertas.length === 1
        ? await ForestJornadaBloqueDB.corridaConSusPiezas(tenantId, abiertas[0]!.id)
        : null;
    const r = bloqueDeLoteConsumido(lote, corrida?.trozaIds ?? []);
    if (!r.ok) {
      return NextResponse.json({ error: r.code, code: r.code, message: r.message }, { status: 409 });
    }
    return NextResponse.json({ bloque: r.bloque, corrida: r.corrida });
  } catch (e) {
    return ctpErrorResponse(e, "forestal.lotes-aserrio.bloque-para-distribucion.GET", "");
  }
}
