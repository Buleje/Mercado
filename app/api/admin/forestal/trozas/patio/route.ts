import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { isSpecializationEnabled } from "@/lib/specializations";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";
import { leerContratoId } from "@/lib/forestal/contrato-filtro";
import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { ForestPlantaAsignacionDB } from "@/lib/db/forest-planta-asignacion.db";
import { ForestPlantaZonaDB } from "@/lib/db/forest-planta-zona.db";
import { claveTroza } from "@/lib/forestal/planta-zona-types";
import { rendimientoPonderado } from "@/lib/forestal/ctp-kpis-seccion";
import { logger } from "@/lib/logger";

/**
 * /api/admin/forestal/trozas/patio — las piezas que están en el patio (ADR-326).
 *
 * GET  — todas las trozas vivas del tenant, con su guía y su estado de consumo.
 *        Vienen TODAS, también las bloqueadas: el operador tiene que ver por qué
 *        una pieza que sabe que está ahí no se puede elegir.
 *        `?contratoId=` = «Solo este permiso» (ADR-431): el filtro lo hace el
 *        servidor, con `tenantId` en cada salto; malformado = 400, nunca «todo».
 * POST — declara qué piezas se comió una corrida. `trozaIds: []` las suelta.
 *
 * El VOLUMEN del consumo no pasa por acá: sigue viviendo en `ForestCtpConsumo`
 * con sus invariantes I1-I6. Esto registra cuáles fueron.
 */

/**
 * `clave → zona` del Mapa de Planta, sólo con zonas que existen (una asignación
 * a una cancha borrada no ubica nada). Falla en `null`, no en error: no saber
 * dónde está apilada una carga no puede tumbar el patio.
 */
async function canchasVigentes(tenantId: string): Promise<Record<string, string> | null> {
  try {
    const [mapa, zonas] = await Promise.all([
      ForestPlantaAsignacionDB.getMap(tenantId),
      ForestPlantaZonaDB.list(tenantId),
    ]);
    const vivas = new Set(zonas.map((z) => z.id));
    return Object.fromEntries(Object.entries(mapa).filter(([, z]) => vivas.has(z)));
  } catch (err) {
    logger.error("[forestal.trozas.patio] canchas failed", { tenantId, error: String(err) });
    return null;
  }
}

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

    /* «Solo este permiso» (ADR-421/431). Se valida ANTES de tocar la base: un
       valor malformado es un 400 y no «sin filtro» — quien prendió el
       interruptor cree estar viendo un solo permiso, y devolverle todo el patio
       sería mostrarle madera ajena como si fuera de ese papel. */
    const contrato = leerContratoId(sp);
    if (!contrato.ok) return NextResponse.json({ error: contrato.error }, { status: 400 });
    const contratoId = contrato.contratoId;

    /* `loteId` acota al lote (decenas de piezas): esa lista viene SIEMPRE
       completa y no depende del tope del patio. Se combina con el contrato. */
    const loteId = sp.get("loteId")?.trim() || undefined;
    /* El mapeo a `TrozaConsumible` (whitelist completa + cuánto se consumió ya
       de cada guía, ADR-353) vive en `WoodEntriesDB.trozasComoConsumibles` —
       single source: un segundo llamador (el planificador de consumo) no
       reinventa el whitelist. */
    const [filas, total, canchas, lineas] = await Promise.all([
      WoodEntriesDB.trozasComoConsumibles(auth.tenantId, { loteId, contratoId }),
      WoodEntriesDB.contarTrozasDelPatio(auth.tenantId, { loteId, contratoId }),
      canchasVigentes(auth.tenantId),
      ForestCtpDB.lineasDeRendimiento(auth.tenantId).catch((err) => {
        logger.error("[forestal.trozas.patio] rendimiento failed", { tenantId: auth.tenantId, error: String(err) });
        return null;
      }),
    ]);
    /* La cancha de cada pieza (ADR-465): la de la troza separada manda sobre
       la de su pila. Sin mapa legible no se manda el campo — `undefined` es
       «no sé», y el indicador no cuenta «0 ubicadas». */
    const trozas = canchas
      ? filas.map((t) => ({ ...t, zonaId: canchas[claveTroza(t.id)] ?? canchas[t.woodEntryId] ?? null }))
      : filas;
    /* El rendimiento REAL del libro, ponderado por m³ de entrada (la misma
       función que la cabecera de Producción). Para estimar pies tablares de lo
       libre; `null` = sin corridas con entrada, y entonces no se estima. */
    const rend = lineas ? rendimientoPonderado(lineas) : null;
    return NextResponse.json({
      trozas,
      rendimientoLibro:
        rend && rend.pct != null
          ? { pct: Math.round(rend.pct * 100) / 100, entradaM3: Math.round(rend.entradaM3 * 1000) / 1000, corridas: (lineas ?? []).filter((l) => (l.rendimientoPct ?? 0) > 0).length }
          : null,
      /**
       * `total` es el patio DE VERDAD y `devueltas` lo que entró en esta
       * respuesta. Antes `total` era `filas.length` —el mismo número acotado— así
       * que un patio de 6.000 piezas informaba 5.000 como si fueran todas: la
       * pantalla no tenía forma de saber que le faltaba madera.
       */
      total,
      devueltas: trozas.length,
      truncado: trozas.length < total,
      /* Qué alcance tiene esta respuesta: la pantalla lo dice («Solo este
         permiso: …») en vez de suponerlo. */
      contratoId: contratoId ?? null,
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
