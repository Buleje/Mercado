import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";
import { normalizarFotos } from "@/lib/forestal/fotos-carga";
import { mixtoVivo } from "@/lib/forestal/lote-mixto";
import { ForestLothDB } from "@/lib/db/forest-loth.db";

/**
 * GET /api/admin/forestal/trozas/ficha?id=<trozaId> — la historia de una pieza.
 *
 * De qué guía vino, cuándo bajó del camión, en qué lote se apartó, qué corrida
 * se la comió o con qué despacho salió entera, y —si se cortó— en qué pedazos
 * siguió viaje. Es la pregunta del que está parado frente al tronco, que el
 * libro sólo sabía contestar por guía, por lote o por despacho.
 *
 * Sólo lee.
 */

const num = (v: unknown) => (v == null ? null : Number(v));

/**
 * Una corrida o un despacho ANULADO ya devolvió la madera al patio: se informa
 * como historia («esto pasó y se anuló»), nunca como destino vigente. Por eso
 * viaja `vigente` y no se filtra la fila: esconderla dejaría un agujero en el
 * relato de la pieza.
 */
const vigenteDe = (e: { status: string; deletedAt: Date | null } | null) =>
  Boolean(e && e.status === "registrado" && !e.deletedAt);

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "GENEROUS", "ctp:trozas");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  try {
    const t = await WoodEntriesDB.fichaDeTroza(auth.tenantId, id);
    if (!t) return NextResponse.json({ error: "not_found" }, { status: 404 });
    /* ADR-450 L4: el árbol se LEE del Libro TH con el estado de sus líneas
       (una tala anulada es historia). Sólo del MISMO negocio: el id de
       Trozado se busca con `tenantId` en el WHERE. */
    const arbol = t.lothTrozadoId
      ? ((await ForestLothDB.arbolesDeTrozados(auth.tenantId, [t.lothTrozadoId])).get(t.lothTrozadoId) ?? null)
      : null;
    const recibida =
      t.recibidaD1Cm != null || t.recibidaD2Cm != null || t.recibidaLargoM != null || t.recibidaVolumenM3 != null
        ? {
            d1Cm: num(t.recibidaD1Cm),
            d2Cm: num(t.recibidaD2Cm),
            largoM: num(t.recibidaLargoM),
            volumenM3: num(t.recibidaVolumenM3),
          }
        : null;

    return NextResponse.json({
      troza: {
        id: t.id,
        orden: t.orden,
        codificacion: t.codificacion,
        codigoPlanta: t.codigoPlanta,
        parcela: t.parcela,
        especieComun: t.especieComun,
        especieCientifica: t.especieCientifica,
        dimensiones: t.dimensiones,
        d1Cm: num(t.d1Cm),
        d2Cm: num(t.d2Cm),
        diametroCm: num(t.diametroCm),
        largoM: num(t.largoM),
        volumenM3: num(t.volumenM3),
        noRecepcionada: t.noRecepcionada,
        fechaRecepcion: t.fechaRecepcion,
        recepcionObs: t.recepcionObs,
        descarte: t.descarte,
        observaciones: t.observaciones,
        fechaRetrozo: t.fechaRetrozo,
        fechaConsumo: t.fechaConsumo,
        fechaDespacho: t.fechaDespacho,
        /* Cubicación Oxapampa (2026-09-26): el pt comercial, congelado al guardar. */
        oxD1Pulg: num(t.oxD1Pulg),
        oxD2Pulg: num(t.oxD2Pulg),
        oxLargoPies: num(t.oxLargoPies),
        oxPt: num(t.oxPt),
        oxMedidoEn: t.oxMedidoEn,
        oxMedidoPor: t.oxMedidoPor,
        d1d2MedidoEnPlanta: t.d1d2MedidoEnPlanta,
        /* ADR-450: el árbol (copia para el acta) y lo medido en planta al
           recibirla; `recibida: null` = llegó como dice la guía. */
        lothTrozadoId: t.lothTrozadoId,
        arbolCodigo: t.arbolCodigo,
        recibida,
      },
      /* ADR-450 L4: «Del bosque». `null` = la troza no vino del Libro TH (o
         no se supo su línea de Trozado); con `arbolCodigo` igual se nombra. */
      arbol,
      ingreso: {
        id: t.entry.id,
        libroNro: t.entry.libroNro,
        constanciaSniffs: t.entry.serforNumeroRegistro,
        gtfNumber: t.entry.gtfNumber,
        proveedor: t.entry.providerName,
        entryDate: t.entry.entryDate,
        fechaRecepcion: t.entry.fechaRecepcion,
        status: t.entry.status,
        /* Título habilitante (6) y resolución (8): es lo que ampara la madera y
           lo primero que pide una fiscalización. */
        permiso: t.entry.originCode,
        resolucion: t.entry.originSourceNumber,
        volumenM3: num(t.entry.volumeM3),
        /* Fotos de la carga de su guía (ADR-434). Las privadas viajan como
           `priv:<path>` y se ven por `/fotos/ver`, que pide sesión del mismo
           negocio: acá no se firma nada. */
        fotos: normalizarFotos(t.entry.photos),
      },
      madre: t.trozaOrigen
        ? { ...t.trozaOrigen, volumenM3: num(t.trozaOrigen.volumenM3) }
        : null,
      retrozos: t.retrozos.map((r) => ({
        id: r.id,
        codificacion: r.codificacion,
        codigoPlanta: r.codigoPlanta,
        volumenM3: num(r.volumenM3),
        largoM: num(r.largoM),
        d1Cm: num(r.d1Cm),
        d2Cm: num(r.d2Cm),
        descarte: r.descarte,
        usada: Boolean(r.consumidaEnId || r.despachadaEnId),
      })),
      lote: t.loteAserrio,
      /* El lote MIXTO donde está apartada (ADR-441), sólo si sigue abierto: es
         lo que el escáner mira para decir «ya está en otro mixto» (LM1) y lo
         que apaga «Armar lote» en la tarjeta (LM4). */
      loteMixto: mixtoVivo(t.loteMixto) && t.loteMixto ? { id: t.loteMixto.id, code: t.loteMixto.code } : null,
      corrida: t.consumidaEn
        ? {
            id: t.consumidaEn.id,
            lineNo: t.consumidaEn.lineNo,
            entryDate: t.consumidaEn.entryDate,
            vigente: vigenteDe(t.consumidaEn),
            producto: t.consumidaEn.productType,
            presentacion: t.consumidaEn.presentacion,
            cantidad: num(t.consumidaEn.quantity),
            unidad: t.consumidaEn.unit,
            rendimientoPct: num(t.consumidaEn.rendimientoPct),
            linea: t.consumidaEn.lineaProduccion,
            volumenEntradaM3: num(t.consumidaEn.volumeInputM3),
          }
        : null,
      despacho: t.despachadaEn
        ? {
            id: t.despachadaEn.id,
            lineNo: t.despachadaEn.lineNo,
            entryDate: t.despachadaEn.entryDate,
            vigente: vigenteDe(t.despachadaEn),
            docType: t.despachadaEn.docType,
            gtfNumber: t.despachadaEn.gtfNumber,
            cantidad: num(t.despachadaEn.quantity),
            unidad: t.despachadaEn.unit,
          }
        : null,
    });
  } catch (e) {
    return ctpErrorResponse(e, "forestal.trozas.ficha.GET", auth.tenantId);
  }
}
