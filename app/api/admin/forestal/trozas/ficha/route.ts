import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";

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
      },
      ingreso: {
        id: t.entry.id,
        libroNro: t.entry.libroNro,
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
