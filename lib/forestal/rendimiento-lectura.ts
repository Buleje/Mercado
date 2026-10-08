import "server-only";
/**
 * rendimiento-lectura — junta lo que pide `GET /api/admin/forestal/ctp/rendimiento`
 * (contrato K4 (a), 08-10). Sólo lectura, y nada se guarda: compone
 * `ForestCtpDB.list` (corridas), `ForestLoteAserrioDB.list` (fin de proceso
 * del lote), `costoDeLinea`, los paquetes de la corrida y la plata de cada
 * guía consumida. Los totales salen de `armarRendimientoAserradero` (puro).
 *
 * Vive fuera de la ruta para poder cruzarlo contra un tenant real con `tsx`
 * (un `route.ts` sólo puede exportar los verbos HTTP).
 */
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { ForestLoteAserrioDB } from "@/lib/db/forest-lote-aserrio.db";
import { ForestCtpConsumoDB } from "@/lib/db/forest-ctp-consumo.db";
import { ForestCtpCierreDB } from "@/lib/db/forest-ctp-cierre.db";
import { closedPeriodOf } from "@/lib/forestal/ctp-cierre-types";
import { GuiaPlataDB } from "@/lib/db/guia-plata.db";
import {
  armarRendimientoAserradero,
  TOPE_GUIAS_PLATA,
  TOPE_PLATA_CORRIDAS,
  type CorridaRendimiento,
  type RendimientoAserraderoDTO,
} from "./rendimiento-especie";
import {
  entradaDePlata,
  rendimientoEnPlata,
  salidaDePlata,
  type GuiaParaPlata,
  type RendimientoPlata,
} from "./rendimiento-plata";

/** De a cuántas lecturas en paralelo, para no acaparar el pool. */
const TANDA = 5;

async function enTandas<T, R>(items: readonly T[], fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += TANDA) out.push(...(await Promise.all(items.slice(i, i + TANDA).map(fn))));
  return out;
}

const num = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

async function plataDeCorridas(
  tenantId: string,
  corridas: readonly CorridaRendimiento[],
): Promise<{ porCorrida: Map<string, RendimientoPlata>; guiasSinLeer: number }> {
  const leidas = await enTandas(corridas, async (c) => {
    const [entry, costo, consumos] = await Promise.all([
      ForestCtpDB.getById(tenantId, c.id),
      ForestCtpConsumoDB.costoDeLinea(tenantId, c.id),
      ForestCtpConsumoDB.listByEntry(tenantId, c.id),
    ]);
    return { c, entry, costo, consumos };
  });

  const todas = [...new Set(leidas.flatMap((l) => l.consumos.map((x) => x.woodEntry.gtfNumber).filter((g): g is string => !!g)))];
  /* Las que quedan fuera NO entran al mapa: `entradaDePlata` las nombra «no leídas», no «falta el flete». */
  const gtfs = todas.slice(0, TOPE_GUIAS_PLATA);
  const guias = new Map<string, GuiaParaPlata | null>();
  await enTandas(gtfs, async (gtf) => {
    const dto = await GuiaPlataDB.leer(tenantId, gtf).catch((err: unknown) => {
      logger.error("[ctp.rendimiento] no se pudo leer la plata de la guía", { tenantId, gtf, error: String(err) });
      return null;
    });
    guias.set(
      gtf,
      dto && dto.tipo === "compra"
        ? {
            lineas: dto.lineas.map((l) => ({
              id: l.id,
              volumeM3: l.volumeM3,
              ptSellado: l.costoDetalle?.ptUsado ?? null,
              fuenteSellada: l.costoDetalle?.fuentePt ?? null,
              ptPago: { pt: l.ptPago.pt, fuente: l.ptPago.fuente },
            })),
            volumenM3: dto.lineas.reduce((a, l) => a + l.volumeM3, 0),
            fleteGastos: dto.costoPuesto.fletesSinMonto > 0 ? null : dto.costoPuesto.fletes + dto.costoPuesto.gastos,
          }
        : null,
    );
  });

  const out = new Map<string, RendimientoPlata>();
  for (const { c, entry, costo, consumos } of leidas) {
    const entrada = entradaDePlata({
      m3: c.m3Entrada,
      consumos: consumos.map((x) => ({ woodEntryId: x.woodEntry.id, gtfNumber: x.woodEntry.gtfNumber, volumeM3: Number(x.volumeM3) || 0 })),
      guias,
      costoMadera: costo.costoMateriaPrima,
      motivoMadera: costo.motivo ?? null,
      /* Lo declarado que ninguna guía respalda: con eso, costo y PT pagado quedan en null (revisión 1dc55fcad). */
      sinAtribuirM3: costo.sinAtribuirM3,
      /* La moneda vale sólo con costo: sin él, `moneda` es la de la línea, no la de la madera. */
      monedaMadera: costo.costoMateriaPrima != null ? costo.moneda : null,
      /* ADR-485: el faltante nombra la guía sin costo en vez de «el costo de la madera». */
      guiasSinCosto: costo.guiasSinCosto,
    });
    const salida = salidaDePlata({
      m3: c.m3Salida,
      paquetes: (entry?.paquetes ?? []).map((p) => ({ volumenM3: Number(p.volumenM3) || 0, pieTablar: p.pieTablar, precioVentaPt: p.precioVentaPt })),
      costoProceso: costo.costoProceso,
    });
    out.set(c.id, rendimientoEnPlata(entrada, salida, { parcial: c.parcial }));
  }
  return { porCorrida: out, guiasSinLeer: todas.length - gtfs.length };
}

/**
 * El rendimiento del tenant. `plata: false` (radar, Cuadro 3, roles sin
 * plata) salta la parte cara: sólo corridas y su estado.
 */
export async function leerRendimientoAserradero(tenantId: string, opts: { plata: boolean }): Promise<RendimientoAserraderoDTO> {
  if (!tenantId) throw new Error("tenantId is required");
  const hoy = limaDateKey();
  const [{ entries }, lotes, cierres] = await Promise.all([
    ForestCtpDB.list(tenantId, { section: "produccion" }),
    ForestLoteAserrioDB.list(tenantId, { limite: 500 }),
    ForestCtpCierreDB.list(tenantId),
  ]);

  /* Corrida → su lote: la que lo cerró y las que se comieron piezas suyas (ADR-365). */
  const lotePorCorrida = new Map<string, { code: string; fin: string | null; cerrado: boolean }>();
  for (const l of lotes) {
    const info = { code: l.code, fin: l.finProceso ? limaDateKey(l.finProceso) : null, cerrado: l.status === "cerrado" };
    for (const id of [l.produccionEntryId, ...l.corridas.map((c) => c.id)]) if (id && !lotePorCorrida.has(id)) lotePorCorrida.set(id, info);
  }

  const corridas: CorridaRendimiento[] = entries.map((e) => {
    const lote = lotePorCorrida.get(e.id) ?? null;
    const enM3 = (e.unit ?? "m3") === "m3";
    const atribuida = num((e as { mpAtribuidaM3?: unknown }).mpAtribuidaM3) ?? 0;
    return {
      id: e.id,
      lineNo: e.lineNo,
      fecha: e.entryDate.toISOString().slice(0, 10),
      especie: e.speciesCommon?.trim() || "Sin especie",
      lote: lote?.code ?? null,
      /* El denominador del rendimiento del libro: lo declarado; sin eso, lo atribuido. */
      m3Entrada: num(e.volumeInputM3) ?? atribuida,
      m3Salida: enM3 ? num(e.quantity) ?? 0 : 0,
      unidad: e.unit ?? "m3",
      rendimientoPct: num(e.rendimientoPct),
      finProceso: lote?.fin ?? null,
      /* Un lote cerrado ya produjo todo aunque su programación diga otra fecha. */
      parcial: !!lote && !lote.cerrado && lote.fin != null && lote.fin > hoy,
      /* Lo declarado sin guía: habilita «Ligar con su compra» también sin plata (ADR-485). */
      m3SinAtribuir: Math.max(
        0,
        Math.round(((num(e.volumeInputM3) ?? 0) - atribuida - (num((e as { mpReprocesoM3?: unknown }).mpReprocesoM3) ?? 0)) * 10000) / 10000,
      ),
      /* Lo que la propuesta bloquea no ofrece «Ligar» (el costo congelado tras reabrir el mes lo dice la tarjeta). */
      ligable: e.aperturaDeclaradaAt == null && !closedPeriodOf(cierres, e.entryDate),
    };
  });

  /* La plata, sólo de las corridas más recientes: cada una son ~4 lecturas. */
  const recientes = [...corridas].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.lineNo - a.lineNo).slice(0, TOPE_PLATA_CORRIDAS);
  const plata = opts.plata ? await plataDeCorridas(tenantId, recientes) : null;
  const sinLeer = plata ? { corridas: corridas.length - recientes.length, guias: plata.guiasSinLeer } : null;
  return armarRendimientoAserradero(corridas, plata?.porCorrida ?? null, hoy, sinLeer && (sinLeer.corridas > 0 || sinLeer.guias > 0) ? sinLeer : null);
}
