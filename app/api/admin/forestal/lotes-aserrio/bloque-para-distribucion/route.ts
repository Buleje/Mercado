import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { ForestLoteAserrioDB } from "@/lib/db/forest-lote-aserrio.db";
import { ForestJornadaBloqueDB } from "@/lib/db/forest-jornada-bloque.db";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";
import { abiertasDelLote, bloqueDeLoteConsumido, type BloqueParaDistribucion } from "@/lib/forestal/bloque-de-lote-consumido";
import { TOPE_LOTES_A_DISTRIBUCION, type ResultadoLoteADistribucion } from "@/lib/forestal/lotes-a-distribucion";

/**
 * GET ?loteId= — el bloque de la Distribución de rolliza para un lote YA
 * consumido (ADR-521): un bloque que adopta la corrida abierta del lote, para
 * repartir lo aserrado en el cubicador y declararla desde el Recorrido.
 *
 * GET ?loteIds=a,b,c — lo mismo para VARIOS lotes de una vez (Brandon 28-10:
 * «escoger varios lotes y llevar en uno solo todo a repartir»): 200 con un
 * resultado por lote, en el orden pedido. Si uno no se puede armar, los otros
 * igual salen y el suyo dice por qué (mismo `code` y mensaje que el 409).
 * Tope `TOPE_LOTES_A_DISTRIBUCION`.
 *
 * Sólo LEE: la pantalla siembra el bloque y lo guarda con la distribución.
 * 409 con `code` cuando no se puede armar sin adivinar (el lote no está
 * consumido, ninguna o varias corridas abiertas, la corrida comió piezas de
 * otro lote, más trozas de las que admite un bloque).
 *
 * Mismo guard que `/lotes-aserrio`: trabajo de patio (admin, almacenero y
 * dueño) con la especialización del libro.
 */

const loteIdSchema = z.string().trim().min(1, "Falta el lote").max(120);
const querySchema = z.object({ loteId: loteIdSchema });
const variosSchema = z.object({
  loteIds: z
    .array(loteIdSchema)
    .min(1, "Elige al menos un lote")
    .max(TOPE_LOTES_A_DISTRIBUCION, `Elige hasta ${TOPE_LOTES_A_DISTRIBUCION} lotes por vez`),
});

type LoteDelLibro = Awaited<ReturnType<typeof ForestLoteAserrioDB.list>>[number];

/* Todas las piezas de la corrida (de cualquier lote): una que también comió
   madera de otro lote no se adopta. Sólo si hay UNA abierta; con 0 o varias,
   el helper ya dice por qué no. */
async function armar(tenantId: string, lote: LoteDelLibro): Promise<BloqueParaDistribucion> {
  const abiertas = abiertasDelLote(lote);
  const corrida =
    lote.status === "consumido" && abiertas.length === 1
      ? await ForestJornadaBloqueDB.corridaConSusPiezas(tenantId, abiertas[0]!.id)
      : null;
  return bloqueDeLoteConsumido(lote, corrida?.trozaIds ?? []);
}

const NO_ESTA = "Ese lote ya no está en el Libro: recarga la lista de lotes.";

function invalido(message: string | undefined) {
  return NextResponse.json({ error: "validation_error", message: message ?? "Datos inválidos." }, { status: 400 });
}

export async function GET(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "GENEROUS", "ctp:lote-a-distribucion");
    if (rl) return rl;
    const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
    if (auth instanceof NextResponse) return auth;
    if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
      return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
    }
    const tenantId = auth.tenantId;
    const params = req.nextUrl.searchParams;

    if (params.has("loteIds")) {
      const pedidos = [...new Set((params.get("loteIds") ?? "").split(",").map((x) => x.trim()).filter(Boolean))];
      const parsed = variosSchema.safeParse({ loteIds: pedidos });
      if (!parsed.success) return invalido(parsed.error.issues[0]?.message);
      const ids = parsed.data.loteIds;
      /* Con el tenant del JWT: un id de otro negocio no aparece (NO_ENCONTRADO). */
      const lotes = await ForestLoteAserrioDB.list(tenantId, { ids, limite: ids.length });
      const porId = new Map(lotes.map((l) => [l.id, l]));
      const resultados: ResultadoLoteADistribucion[] = await Promise.all(
        ids.map(async (loteId): Promise<ResultadoLoteADistribucion> => {
          const lote = porId.get(loteId);
          if (!lote) return { loteId, lote: null, ok: false, code: "NO_ENCONTRADO", message: NO_ESTA };
          const r = await armar(tenantId, lote);
          return { loteId, lote: lote.code, ...r };
        }),
      );
      return NextResponse.json({ resultados });
    }

    const parsed = querySchema.safeParse({ loteId: params.get("loteId") ?? "" });
    if (!parsed.success) return invalido(parsed.error.issues[0]?.message);
    /* El lote se busca con el tenant del JWT: un id de otro negocio no aparece (404). */
    const [lote] = await ForestLoteAserrioDB.list(tenantId, { ids: [parsed.data.loteId], limite: 1 });
    if (!lote) {
      return NextResponse.json({ error: "not_found", message: NO_ESTA }, { status: 404 });
    }
    const r = await armar(tenantId, lote);
    if (!r.ok) {
      return NextResponse.json({ error: r.code, code: r.code, message: r.message }, { status: 409 });
    }
    return NextResponse.json({ bloque: r.bloque, corrida: r.corrida });
  } catch (e) {
    return ctpErrorResponse(e, "forestal.lotes-aserrio.bloque-para-distribucion.GET", "");
  }
}
