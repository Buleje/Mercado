import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestLoteAserrioDB } from "@/lib/db/forest-lote-aserrio.db";
import { ForestCtpDB, CTP_SECTIONS } from "@/lib/db/forest-ctp.db";
import { ForestCtpDespachoDB } from "@/lib/db/forest-ctp-despacho.db";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { gtfDatosSchema } from "@/lib/forestal/ctp-gtf-datos";
import { ctpErrorResponse, ctpValidationResponse } from "@/lib/forestal/ctp-api-errors";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { TIPOS_DOCUMENTO_LOCTP } from "@/lib/forestal/loctp-campos";
import { LINEAS_PRODUCCION } from "@/lib/forestal/loctp-resumenes";
import { sincronizarPartesDeGuia } from "@/lib/forestal/ctp-sincronizar-partes";

/**
 * /api/admin/forestal/ctp — Libro CTP: producción + despacho + saldos (ADR-127)
 * GET (lista ?section · ?saldos=1) · POST (crea) · PATCH { id, action:"annul", reason } · DELETE ?id
 * Guard: spec:forestal:ctp-libro · rate-limit GENEROUS bucket 'ctp'
 */

const sectionEnum = z.enum(CTP_SECTIONS);
const createSchema = z.object({
  section: sectionEnum,
  entryDate: z.coerce.date().optional(),
  // ADR-134: dejó de ser "la guía" para ser el RESUMEN de las N guías que
  // alimentaron la corrida ("001-0000120, 001-0000131, …"). Con el max(60)
  // original —dimensionado para un solo código— 5 guías ya daban 400, y mezclar
  // guías es justamente la razón de ser del modelo N:M. La columna es TEXT, así
  // que el único límite era éste. 1000 cubre el tope de 50 consumos por línea.
  // La VERDAD de la trazabilidad vive en ForestCtpConsumo; esto es el acta legible.
  gtfIngreso: z.string().trim().max(1000).nullable().optional(),
  materiaPrimaRef: z.string().trim().max(120).nullable().optional(),
  /**
   * El LOTE DE ASERRÍO que produjo esta corrida (ADR-334).
   *
   * Con él la corrida no se declara suelta: se consumen las piezas del lote y el
   * lote queda apuntando a la corrida. Es el hilo Consumos → Producción que el
   * LO-CTP pide y que hasta ahora era texto libre en la columna «Lote».
   */
  loteAserrioId: z.string().trim().max(60).nullable().optional(),
  speciesCommon: z.string().trim().max(120).nullable().optional(),
  speciesScientific: z.string().trim().max(150).nullable().optional(),
  cites: z.boolean().optional(),
  productType: z.string().trim().max(80).nullable().optional(),
  volumeInputM3: z.coerce.number().nonnegative().max(99999).nullable().optional(),
  rendimientoPct: z.coerce.number().nonnegative().max(100).nullable().optional(),
  quantity: z.coerce.number().nonnegative().max(9999999).nullable().optional(),
  unit: z.enum(["m3", "kg", "unidad", "pt"]).nullable().optional(),
  pieces: z.coerce.number().int().nonnegative().max(999999).nullable().optional(),
  gtfNumber: z.string().trim().max(60).nullable().optional(),
  // Campos oficiales del LO-CTP en la salida (ADR-311).
  docType: z.enum(TIPOS_DOCUMENTO_LOCTP.map((t) => t.valor) as [string, ...string[]]).nullable().optional(),
  codigoProducto: z.string().trim().max(60).nullable().optional(),
  /** "Forma de presentación" del formato (ADR-314). Texto: el catálogo sugiere
   *  pero no encierra — rechazar una presentación que la autoridad admite sería
   *  peor que aceptar una de más. */
  presentacion: z.string().trim().max(40).nullable().optional(),
  lineaProduccion: z.enum(LINEAS_PRODUCCION.map((l) => l.valor) as [string, ...string[]]).nullable().optional(),
  destino: z.string().trim().max(200).nullable().optional(),
  /** Sello de la verificación de la GTF de salida contra SERFOR (ADR-312). */
  serforNumeroRegistro: z.string().trim().max(30).nullable().optional(),
  serforVerificadoEn: z.coerce.date().nullable().optional(),
  observations: z.string().trim().max(1000).nullable().optional(),
  // ADR-134: una corrida real mezcla varias guías. La atribución viaja con el
  // alta; `ForestCtpConsumoDB` valida I1/I2 y tenant antes de escribir.
  consumos: z
    .array(
      z.object({
        woodEntryId: z.string().trim().min(1),
        volumeM3: z.coerce.number().positive().max(99999),
      }),
    )
    .max(50)
    .optional(),
  costoProceso: z.coerce.number().nonnegative().max(9999999).nullable().optional(),
  moneda: z.string().trim().max(8).nullable().optional(),
  // ADR-135: de qué corridas salió el producto de este despacho. Cierra la
  // cadena de custodia; `ForestCtpDespachoDB` valida I4/I5 antes de escribir.
  origenes: z
    .array(
      z.object({
        produccionEntryId: z.string().trim().min(1),
        quantity: z.coerce.number().positive().max(9999999),
      }),
    )
    .max(50)
    .optional(),
  /**
   * El cuerpo de la GTF de salida, en el MISMO acto que la línea.
   *
   * Una guía ampara varias líneas de producto (una por especie/paquete): con el
   * `PATCH gtf_datos` como única vía, registrar una guía de cinco productos eran
   * cinco altas + cinco parches, y el almacenero —que puede registrar el
   * despacho pero no editar guías ya emitidas— se comía un 403 en el segundo
   * paso. Escribirlo al crear es parte de registrar la salida; EDITAR la guía de
   * una línea que ya existe sigue siendo del PATCH (admin/owner).
   */
  gtfDatos: gtfDatosSchema.optional(),
  /**
   * Las PIEZAS que salen SIN ASERRAR en esta línea (ADR-363). Sólo despacho.
   *
   * Con esto la línea NO se mide contra el stock de producto (I3): lo que sale
   * es materia prima, y su stock son las trozas — cada una validada por T2.
   */
  trozas: z.array(z.string().trim().min(1).max(60)).max(500).optional(),
});
const patchSchema = z.discriminatedUnion("action", [
  z.object({ id: z.string().trim().min(1), action: z.literal("annul"), reason: z.string().trim().min(3).max(500) }),
  // Emitir la GTF de salida formal (serie autorizada ARFFS + correlativo auto).
  z.object({ id: z.string().trim().min(1), action: z.literal("emitir_gtf") }),
  // Registrar el valor de venta del despacho para el P&L (ADR-141).
  z.object({ id: z.string().trim().min(1), action: z.literal("set_venta"), valorVenta: z.number().min(0).max(9_999_999_999.99).nullable() }),
  // Cuerpo de la guía de transporte: propietario, destinatario, transportista,
  // vehículo, traslado y títulos. La forma la valida `gtfDatosSchema`.
  z.object({ id: z.string().trim().min(1), action: z.literal("gtf_datos"), datos: gtfDatosSchema }),
  /**
   * AMPLIAR una corrida que ya declaró (ADR-361): el lote no sale de la sierra
   * en un solo acto. Suma paquetes a los que ya están —no los reemplaza— y el
   * tope del 56 % se mide sobre el TOTAL acumulado.
   */
  z.object({
    id: z.string().trim().min(1),
    action: z.literal("ampliar_produccion"),
    observations: z.string().trim().max(1000).nullable().optional(),
    paquetes: z
      .array(
        z.object({
          codigo: z.string().trim().min(1).max(60),
          productType: z.string().trim().max(80).nullable().optional(),
          presentacion: z.string().trim().max(80).nullable().optional(),
          cantidad: z.coerce.number().int().nonnegative().max(99999),
          volumenM3: z.coerce.number().positive().max(999999),
          espesorCm: z.coerce.number().positive().max(9999).nullable().optional(),
          anchoCm: z.coerce.number().positive().max(9999).nullable().optional(),
          largoM: z.coerce.number().positive().max(999).nullable().optional(),
          observations: z.string().trim().max(300).nullable().optional(),
        }),
      )
      .min(1)
      .max(200),
  }),
  /**
   * Cerrar una corrida que se abrió al consumir en el patio (ADR-340): qué
   * producto salió y cuánto. Es la Sección 3 del LO-CTP declarada aparte del
   * consumo, que es como pasa en la planta.
   */
  z.object({
    id: z.string().trim().min(1),
    action: z.literal("declarar_produccion"),
    productType: z.string().trim().max(80).nullable().optional(),
    presentacion: z.string().trim().max(80).nullable().optional(),
    quantity: z.coerce.number().positive().max(9999999),
    unit: z.enum(["m3", "kg", "unidad", "pt"]),
    pieces: z.coerce.number().int().nonnegative().max(999999).nullable().optional(),
    codigoProducto: z.string().trim().max(80).nullable().optional(),
    lineaProduccion: z.string().trim().max(10).nullable().optional(),
    observations: z.string().trim().max(1000).nullable().optional(),
    /**
     * Los paquetes que salieron (ADR-349). El detalle de `quantity`: la DB
     * rechaza la declaración si no suman lo mismo. Tope de 200 por corrida —
     * más que eso es un pegado accidental, no una jornada.
     */
    paquetes: z
      .array(
        z.object({
          codigo: z.string().trim().min(1).max(60),
          productType: z.string().trim().max(80).nullable().optional(),
          presentacion: z.string().trim().max(80).nullable().optional(),
          cantidad: z.coerce.number().int().nonnegative().max(99999),
          volumenM3: z.coerce.number().positive().max(999999),
          espesorCm: z.coerce.number().positive().max(9999).nullable().optional(),
          anchoCm: z.coerce.number().positive().max(9999).nullable().optional(),
          largoM: z.coerce.number().positive().max(999).nullable().optional(),
          observations: z.string().trim().max(300).nullable().optional(),
        }),
      )
      .max(200)
      .optional(),
  }),
]);

/** `?from`/`?to` = instantes ISO del período (lib/forestal/ctp-period.ts). Inválido → sin límite. */
function periodFromUrl(url: URL): { fromDate?: Date; toDate?: Date } {
  const dateParam = z.coerce.date();
  const read = (key: string) => {
    const raw = url.searchParams.get(key);
    if (!raw) return undefined;
    const parsed = dateParam.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  };
  return { fromDate: read("from"), toDate: read("to") };
}

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return ok ? null : NextResponse.json({ error: "specialization_disabled", message: "El módulo CTP no está habilitado para este tenant." }, { status: 403 });
}


export const GET = withApiHandler("forestal-ctp-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  const url = new URL(req.url);
  const period = periodFromUrl(url);
  try {
    if (url.searchParams.get("saldos") === "1") {
      return NextResponse.json({ saldos: await ForestCtpDB.saldos(auth.tenantId, period) });
    }
    /* Productos disponibles (ADR-349): lo aserrado que sigue en la planta, con
       sus paquetes. El saldo sale de la única fuente (ADR-316). */
    if (url.searchParams.get("disponibles") === "1") {
      return NextResponse.json(
        await ForestCtpDB.productosDisponibles(auth.tenantId, {
          ...period,
          especie: url.searchParams.get("especie") ?? undefined,
          producto: url.searchParams.get("producto") ?? undefined,
        }),
      );
    }
    // P&L del período: venta − COGS agregado (ADR-141).
    if (url.searchParams.get("pnl") === "1") {
      return NextResponse.json({ pnl: await ForestCtpDespachoDB.pnlDelPeriodo(auth.tenantId, period) });
    }
    // Conciliación: apertura + movimientos = existencia final (ADR-139 rollforward).
    if (url.searchParams.get("conciliacion") === "1") {
      return NextResponse.json({ conciliacion: await ForestCtpDB.conciliacionPeriodo(auth.tenantId, period) });
    }
    // Curva del saldo de materia prima en el tiempo (¿el patio sube o baja?).
    if (url.searchParams.get("curva") === "1") {
      return NextResponse.json({ curva: await ForestCtpDB.curvaSaldo(auth.tenantId, period) });
    }
    // ADR-135 D3: despachos del período que no podrían emitir certificado.
    if (url.searchParams.get("traza") === "1") {
      return NextResponse.json({ traza: await ForestCtpDespachoDB.trazabilidadDelPeriodo(auth.tenantId, period) });
    }
    // Grafo de cadena de custodia del período (Radar de trazabilidad).
    if (url.searchParams.get("grafo") === "1") {
      return NextResponse.json({ grafo: await ForestCtpDB.grafoTrazabilidad(auth.tenantId, period) });
    }
    // Kardex (cuenta corriente) de la materia prima de una especie.
    const kardexEspecie = url.searchParams.get("kardex");
    if (kardexEspecie) {
      return NextResponse.json({ kardex: await ForestCtpDB.kardexEspecie(auth.tenantId, kardexEspecie, period) });
    }
    // Trazabilidad hacia adelante de UN ingreso: ¿a dónde fue esta madera?
    const trazaForward = url.searchParams.get("trazaForward");
    if (trazaForward) {
      return NextResponse.json({ trazaForward: await ForestCtpDB.trazaForwardIngreso(auth.tenantId, trazaForward) });
    }
    // Historial de cambios de UNA línea del libro (rec #10 QA): todo lo que el
    // audit trail registró sobre ese registro — defensa ante fiscalización.
    const historialId = url.searchParams.get("historial");
    if (historialId) {
      const { ActivityLogDB } = await import("@/lib/db/activity-log.db");
      const rows = await ActivityLogDB.list(auth.tenantId, { entityId: historialId, limit: 50 });
      return NextResponse.json({
        historial: rows
          .filter((r) => r.action.startsWith("ctp_"))
          .map((r) => ({ id: r.id, action: r.action, detail: r.detail, user: r.user, createdAt: r.createdAt })),
      });
    }
    // UNA línea por id. La usa el ANEXO N° 04 emitido desde el cubicador: la
    // cubicación sabe de qué corrida salió, y el anexo no puede detallar más de
    // lo que esa corrida produjo.
    const entryId = url.searchParams.get("entryId");
    if (entryId) {
      const entry = await ForestCtpDB.getById(auth.tenantId, entryId);
      return entry
        ? NextResponse.json({ entry })
        : NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    // Reorden predictivo (all-time, ritmo últimos 90 días).
    if (url.searchParams.get("reorden") === "1") {
      return NextResponse.json({ reorden: await ForestCtpDB.proyeccionReorden(auth.tenantId) });
    }
    // Tendencias mensuales (últimos N meses; ignora el período).
    if (url.searchParams.get("tendencias") === "1") {
      const meses = Number(url.searchParams.get("meses") ?? "6");
      return NextResponse.json({ tendencias: await ForestCtpDB.tendenciasMensuales(auth.tenantId, Number.isFinite(meses) ? meses : 6) });
    }
    const availableFor = url.searchParams.get("available");
    if (availableFor && (CTP_SECTIONS as readonly string[]).includes(availableFor)) {
      // `?excludeCtpEntryId=` al EDITAR una línea: lo que ella misma consume no
      // cuenta contra el disponible (si no, sus guías se verían agotadas).
      return NextResponse.json({
        items: await ForestCtpDB.availableSource(auth.tenantId, availableFor as (typeof CTP_SECTIONS)[number], {
          excludeCtpEntryId: url.searchParams.get("excludeCtpEntryId") ?? undefined,
        }),
      });
    }
    const s = url.searchParams.get("section");
    const section = s && (CTP_SECTIONS as readonly string[]).includes(s) ? (s as (typeof CTP_SECTIONS)[number]) : undefined;
    const { entries, total } = await ForestCtpDB.list(auth.tenantId, {
      section,
      search: url.searchParams.get("search") ?? undefined,
      includeAnnulled: url.searchParams.get("includeAnnulled") === "1",
      ...period,
    });
    return NextResponse.json({ entries, total });
  } catch (err) {
    logger.error("[ctp.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("forestal-ctp-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return ctpValidationResponse(parsed.error);
  try {
    const { loteAserrioId, gtfDatos, trozas, ...linea } = parsed.data;
    const conTrozas = Boolean(trozas?.length) && parsed.data.section === "despacho";

    /* T2 ANTES de crear (ADR-363): si una pieza ya se aserró o ya salió, el
       error llega sin haber dejado un despacho fantasma en el libro. El marcado
       vuelve a validar con LOCK — esto no reemplaza al lock, lo adelanta. */
    if (conTrozas) await WoodEntriesDB.assertTrozasDespachables(auth.tenantId, trozas!);

    const entry = await ForestCtpDB.create(auth.tenantId, {
      ...linea,
      desdeTrozas: conTrozas,
      createdBy: auth.username ?? "unknown",
    });

    /* Las piezas se marcan DESPUÉS: hace falta el id de la línea. Si esto falla
       —una carrera con otro camión— la línea se deshace: una salida declarada
       sin madera atrás es peor que no haberla registrado. */
    if (conTrozas && entry?.id) {
      try {
        await WoodEntriesDB.marcarDespachoTrozas(auth.tenantId, entry.id, trozas!, {
          fecha: parsed.data.entryDate,
          usuario: auth.username ?? "unknown",
        });
      } catch (e) {
        await ForestCtpDB.softDelete(auth.tenantId, entry.id, auth.username ?? "unknown").catch((err) =>
          logger.error("[ctp.POST] no se pudo deshacer la línea sin trozas", { entryId: entry.id, error: String(err) }),
        );
        throw e;
      }
    }

    /* La guía se escribe DESPUÉS de que la línea existe (hace falta su id) y
       sobre la misma vía que el PATCH: así valida período cerrado y audita
       igual. Si falla, la línea ya está —no se pierde el despacho— y se avisa
       para completarla desde la ficha. */
    let gtfDatosError: string | null = null;
    if (gtfDatos && entry?.id && parsed.data.section === "despacho") {
      try {
        const r = await ForestCtpDespachoDB.guardarGtfDatos(auth.tenantId, entry.id, gtfDatos, auth.username ?? "unknown");
        if (!r.ok) gtfDatosError = r.reason;
        else {
          void sincronizarPartesDeGuia(auth.tenantId, gtfDatos, auth.username ?? "unknown").catch((err) =>
            logger.warn("[ctp.POST] sincronización de partes falló", { error: String(err) }),
          );
        }
      } catch (e) {
        gtfDatosError = e instanceof Error ? e.message : String(e);
        logger.error("[ctp.POST] la línea se creó pero la guía no se guardó", { entryId: entry.id, error: gtfDatosError });
      }
    }

    /* El lote entra a la sierra DESPUÉS de que la corrida existe: hasta que no
       hay corrida no hay a qué apuntar las piezas. Si esto falla, la corrida ya
       está —no se pierde el trabajo— y se avisa para completarlo a mano. */
    let lote: { piezas: number; volumenM3: number } | null = null;
    let loteError: string | null = null;
    if (loteAserrioId && entry?.id && parsed.data.section === "produccion") {
      try {
        lote = await ForestLoteAserrioDB.consumir(
          auth.tenantId,
          loteAserrioId,
          entry.id,
          parsed.data.entryDate,
          auth.username ?? "unknown",
        );
      } catch (e) {
        loteError = e instanceof Error ? e.message : String(e);
        logger.error("[ctp.POST] la corrida se creó pero el lote no se consumió", { loteAserrioId, error: loteError });
      }
    }
    return NextResponse.json({ entry, lote, loteError, gtfDatosError }, { status: 201 });
  } catch (err) {
    // Puede traer `consumos` ⇒ puede violar I1/I2 ⇒ 422 con el motivo, no 500.
    return ctpErrorResponse(err, "ctp.POST", auth.tenantId);
  }
});

export const PATCH = withApiHandler("forestal-ctp-patch", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return ctpValidationResponse(parsed.error);
  try {
    if (parsed.data.action === "ampliar_produccion") {
      const { id, action: _amp, ...campos } = parsed.data;
      const entry = await ForestCtpDB.ampliarProduccion(auth.tenantId, id, campos, auth.username ?? "unknown");
      return NextResponse.json({ entry });
    }
    if (parsed.data.action === "declarar_produccion") {
      const { id, action: _a, ...campos } = parsed.data;
      const entry = await ForestCtpDB.declararProduccion(auth.tenantId, id, campos, auth.username ?? "unknown");
      if (!entry) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json({ entry });
    }
    if (parsed.data.action === "gtf_datos") {
      const r = await ForestCtpDespachoDB.guardarGtfDatos(
        auth.tenantId,
        parsed.data.id,
        parsed.data.datos,
        auth.username ?? "unknown",
      );
      // Lo tipeado en la guía entra a la libreta: el destinatario de siempre no
      // se vuelve a tipear la próxima. Fire-and-forget — la guía ya se guardó y
      // el directorio es una comodidad, no puede hacer fallar el guardado.
      if (r.ok) {
        void sincronizarPartesDeGuia(auth.tenantId, parsed.data.datos, auth.username ?? "unknown").catch(
          (err) => logger.warn("[ctp.gtf_datos] sincronización de partes falló", { error: String(err) }),
        );
      }
      if (!r.ok) {
        return NextResponse.json(
          {
            error: r.reason,
            message:
              r.reason === "anulado"
                ? "El despacho está anulado: su guía no se puede editar."
                : "No se encontró ese despacho.",
          },
          { status: r.reason === "anulado" ? 422 : 404 },
        );
      }
      // Se devuelve lo NORMALIZADO por Zod: la UI se queda con lo que quedó
      // guardado y no con lo que creía estar mandando.
      return NextResponse.json({ ok: true, datos: parsed.data.datos });
    }

    if (parsed.data.action === "emitir_gtf") {
      const result = await ForestCtpDespachoDB.emitirGtf(auth.tenantId, parsed.data.id, auth.username ?? "unknown");
      if (!result.ok) {
        const message =
          result.reason === "serie_no_configurada"
            ? "No hay serie de GTF configurada. Cargá la «Serie GTF autorizada» en la pestaña Ficha CTP."
            : result.reason === "anulado"
              ? "El despacho está anulado: no se puede emitir su GTF."
              : "No se encontró la línea de despacho.";
        return NextResponse.json({ error: result.reason, message }, { status: 422 });
      }
      return NextResponse.json({ gtf: result.gtf, correlativo: result.correlativo, yaEmitida: result.yaEmitida });
    }
    if (parsed.data.action === "set_venta") {
      await ForestCtpDespachoDB.setValorVenta(auth.tenantId, parsed.data.id, parsed.data.valorVenta, auth.username ?? "unknown");
      return NextResponse.json({ ok: true, margen: await ForestCtpDespachoDB.margenDeDespacho(auth.tenantId, parsed.data.id) });
    }
    return NextResponse.json({ entry: await ForestCtpDB.annul(auth.tenantId, parsed.data.id, parsed.data.reason, auth.username ?? "unknown") });
  } catch (err) {
    // Los invariantes del libro (período cerrado, stock, atribución) tienen que
    // llegar al operario con su motivo: con un 500 genérico veía "error interno"
    // al anular una línea de un mes cerrado y no entendía por qué.
    return ctpErrorResponse(err, "ctp.PATCH", auth.tenantId);
  }
});

export const DELETE = withApiHandler("forestal-ctp-delete", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  try {
    await ForestCtpDB.softDelete(auth.tenantId, id, auth.username ?? "unknown");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return ctpErrorResponse(err, "ctp.DELETE", auth.tenantId);
  }
});
