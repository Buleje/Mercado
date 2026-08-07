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
    const filas = await WoodEntriesDB.trozasDelPatio(auth.tenantId);
    /* Cuánto se consumió ya de cada guía: con eso el picker avisa ANTES de armar
       el acta en vez de que el servidor la rechace al final (ADR-353). */
    const consumido = await WoodEntriesDB.consumidoPorIngreso(
      auth.tenantId,
      filas.map((t) => t.woodEntryId),
    );
    const num = (v: unknown) => (v == null ? null : Number(v));
    return NextResponse.json({
      trozas: filas.map((t) => ({
        id: t.id,
        woodEntryId: t.woodEntryId,
        codificacion: t.codificacion,
        codigoPlanta: t.codigoPlanta,
        parcela: t.parcela,
        especieComun: t.especieComun,
        especieCientifica: t.especieCientifica,
        dimensiones: t.dimensiones,
        /* Las tres medidas sueltas, no sólo el texto: la tabla del patio las
           muestra en columnas y `dimensiones` viene libre («0.95 x 0.92 x 3.60»
           o vacío según cómo entró la guía). */
        d1Cm: num(t.d1Cm),
        d2Cm: num(t.d2Cm),
        largoM: num(t.largoM),
        volumenM3: num(t.volumenM3),
        gtfNumber: t.entry.gtfNumber,
        proveedor: t.entry.providerName,
        /** Fecha del ASIENTO de la guía en el libro (no es la recepción). */
        fechaIngreso: t.entry.entryDate,
        /** Cuándo bajó ESTA pieza del camión (ADR-336). */
        fechaRecepcion: t.fechaRecepcion,
        /**
         * ¿La guía de esta pieza ya se recibió? (ADR-339)
         *
         * Versión por-pieza del mismo criterio: la valida el operador, la fecha
         * el ingreso, o la fecha la propia pieza. Es lo que decide qué madera se
         * puede llevar a la sierra desde Consumos.
         */
        guiaRecepcionada:
          t.entry.status === "validado" || Boolean(t.entry.fechaRecepcion) || Boolean(t.fechaRecepcion),
        /* El título habilitante y la resolución que amparan la madera: es por
           donde el patio agrupa cuando llega la carga de un permiso entero
           (casilleros 6 y 8 de la GTF). */
        permiso: t.entry.originCode,
        resolucion: t.entry.originSourceNumber,
        /* Lo que el ASIENTO declara y lo que ya se le consumió: el tope de I2.
           Van por troza porque es como las lee el picker; son el mismo par para
           todas las piezas de un mismo asiento. */
        guiaVolumenM3: num(t.entry.volumeM3),
        guiaConsumidoM3: consumido.get(t.woodEntryId) ?? 0,
        // Defensa en profundidad: además de soltarlas al anular, se LEE como
        // libre la que apunta a una corrida muerta. Los datos que ya quedaron
        // mal antes del arreglo se corrigen solos al mirarlos.
        consumidaEnId:
          t.consumidaEn && t.consumidaEn.status === "registrado" && !t.consumidaEn.deletedAt
            ? t.consumidaEnId
            : null,
        /* La que ya salió SIN ASERRAR (ADR-363). Mismo criterio que el consumo:
           si el despacho está anulado, la madera volvió al patio. Sin este campo
           en la whitelist, el JSON lo omite y la pantalla declara libre una
           pieza que ya viajó. */
        despachadaEnId:
          t.despachadaEn && t.despachadaEn.status === "registrado" && !t.despachadaEn.deletedAt
            ? t.despachadaEnId
            : null,
        noRecepcionada: t.noRecepcionada,
        trozaOrigenId: t.trozaOrigenId,
        descarte: t.descarte,
        retrozos: t._count.retrozos,
        // Dónde está apartada (ADR-334). El picker la muestra igual —la pieza
        // existe y el operador la ve en la pila— pero con su lote a la vista:
        // sin esto se elegía para una corrida madera ya reservada para otra.
        loteAserrioId: t.loteAserrioId,
        loteAserrioCode: t.loteAserrio?.code ?? null,
      })),
      total: filas.length,
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
