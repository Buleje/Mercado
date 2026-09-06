import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { isSpecializationEnabled } from "@/lib/specializations";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";

/**
 * /api/admin/forestal/trozas/patio — las piezas que están en el patio (ADR-326).
 *
 * GET  — todas las trozas vivas del tenant, con su guía y su estado de consumo.
 *        Vienen TODAS, también las bloqueadas: el operador tiene que ver por qué
 *        una pieza que sabe que está ahí no se puede elegir.
 * POST — declara qué piezas se comió una corrida. `trozaIds: []` las suelta.
 *
 * El VOLUMEN del consumo no pasa por acá: sigue viviendo en `ForestCtpConsumo`
 * con sus invariantes I1-I6. Esto registra cuáles fueron.
 */

async function guard(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "GENEROUS", "ctp:trozas");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const denegado = await guard(auth.tenantId);
  if (denegado) return denegado;

  try {
    const sp = new URL(req.url).searchParams;
    /**
     * `?varadas=<días>` — sólo el conteo de lo que lleva demasiado tiempo
     * parado. Lo pide la tira de pendientes del libro, que se muestra en TODAS
     * las pestañas: traerse cinco mil piezas para mostrar un número sería pagar
     * el patio entero en cada pantalla.
     */
    const varadas = sp.get("varadas");
    if (varadas != null) {
      const dias = Number.parseInt(varadas, 10);
      if (!Number.isFinite(dias) || dias < 1 || dias > 3650) {
        return NextResponse.json({ error: "invalid_varadas" }, { status: 400 });
      }
      return NextResponse.json({ dias, ...(await WoodEntriesDB.contarTrozasVaradas(auth.tenantId, dias)) });
    }

    /* `loteId` acota al lote (decenas de piezas): esa lista viene SIEMPRE
       completa y no depende del tope del patio. */
    const loteId = sp.get("loteId")?.trim() || undefined;
    /* El mapeo a `TrozaConsumible` (whitelist completa + cuánto se consumió ya
       de cada guía, ADR-353) vive en `WoodEntriesDB.trozasComoConsumibles` —
       single source: un segundo llamador (el planificador de consumo) no
       reinventa el whitelist. */
    const [trozas, total] = await Promise.all([
      WoodEntriesDB.trozasComoConsumibles(auth.tenantId, { loteId }),
      WoodEntriesDB.contarTrozasDelPatio(auth.tenantId, { loteId }),
    ]);
    return NextResponse.json({
      trozas,
      /**
       * `total` es el patio DE VERDAD y `devueltas` lo que entró en esta
       * respuesta. Antes `total` era `filas.length` —el mismo número acotado— así
       * que un patio de 6.000 piezas informaba 5.000 como si fueran todas: la
       * pantalla no tenía forma de saber que le faltaba madera.
       */
      total,
      devueltas: trozas.length,
      truncado: trozas.length < total,
    });
  } catch (e) {
    return ctpErrorResponse(e, "forestal.trozas.patio.GET", auth.tenantId);
  }
}

const postSchema = z.object({
  ctpEntryId: z.string().trim().min(1).max(60),
  trozaIds: z.array(z.string().trim().min(1).max(60)).max(2000),
  fecha: z.string().trim().max(40).optional(),
});

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "GENEROUS", "ctp:trozas");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const denegado = await guard(auth.tenantId);
  if (denegado) return denegado;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }

  try {
    const fechaParsed = parsed.data.fecha ? z.coerce.date().safeParse(parsed.data.fecha) : null;
    const r = await WoodEntriesDB.marcarTrozasConsumidas(
      auth.tenantId,
      parsed.data.ctpEntryId,
      parsed.data.trozaIds,
      { fecha: fechaParsed?.success ? fechaParsed.data : undefined, usuario: auth.username ?? "unknown" },
    );
    return NextResponse.json(r);
  } catch (e) {
    return ctpErrorResponse(e, "forestal.trozas.patio.POST", auth.tenantId);
  }
}
