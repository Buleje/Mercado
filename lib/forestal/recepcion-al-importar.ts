/**
 * La llegada al patio de las guías que entran por un archivo (importador del
 * libro / inventario de patio) y el aviso de las que siguen sin fecha de
 * recepción.
 *
 * La fecha de recepción es un dato legal: el día que la madera bajó del
 * camión. Nunca se inventa. Por eso el importador NO la pone solo: la pone
 * quien marca «¿Estas trozas ya están en el patio?», con la fecha de cada guía
 * del archivo o una común que elige. Lo que entra sin ella queda en el aviso
 * «Sin recepcionar» y se recibe después con la recepción en bloque.
 *
 * Puro: lo usan la ruta del importador y la consulta del aviso.
 */

import { isDateClosed, type CtpCierrePeriodo } from "./ctp-cierre-types";
import { diaDelLibro, problemaDeLlegada, type FechaDelLibro } from "./fecha-de-llegada";
import { faltaRecibirMadera } from "./recepcion-guias";

/** El cuerpo del importador: presente = la casilla está marcada. */
export interface RecepcionAlImportar {
  /** `AAAA-MM-DD` común a todas las guías; `null`/ausente = la fecha de cada guía en el archivo. */
  fecha?: string | null;
}

export const SIN_FECHA_EN_EL_ARCHIVO =
  "el archivo no trae la fecha de esta guía: pon una fecha para todas o recíbela después desde «Sin recepcionar» en Trozas";

/**
 * El día de llegada de una guía importada, o por qué no se puede poner.
 *
 * - Manda la fecha común si la hay; si no, la de la guía en el archivo.
 * - Nunca futura ni anterior a la guía (la misma regla que la recepción a mano,
 *   `problemaDeLlegada`). El servidor la vuelve a revisar al recibir con todo
 *   lo que sabe de la guía (vencimiento, mes cerrado, sierra).
 */
export function diaDeRecepcionAlImportar(p: {
  comun: string | null | undefined;
  delArchivo: FechaDelLibro;
  hoy: string;
}): { dia: string; problema: null } | { dia: null; problema: string } {
  const guia = diaDelLibro(p.delArchivo);
  const dia = p.comun ? p.comun : guia;
  if (!dia) return { dia: null, problema: SIN_FECHA_EN_EL_ARCHIVO };
  const problema = problemaDeLlegada(dia, guia, p.hoy);
  if (problema) return { dia: null, problema: problema.charAt(0).toLowerCase() + problema.slice(1).replace(/\.$/, "") };
  return { dia, problema: null };
}

/** `DD/MM` de un día `AAAA-MM-DD`. */
export const ddmmDe = (dia: string): string => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

// ── El aviso «Sin recepcionar» ──────────────────────────────────────────────

/** Un asiento vivo al que le falta algo de la llegada (o cuyas trozas la esperan). */
export interface AsientoSinRecibir {
  gtfNumber: string;
  gtfSeries: string | null;
  status: string;
  entryDate: Date | string;
  fechaRecepcion: Date | string | null;
  volumeM3: number;
  trozasCount: number;
  trozasDecididas: number;
}

export interface GuiaSinRecibir {
  gtf: string;
  serie: string | null;
  /** `AAAA-MM-DD` del asiento más viejo de la guía. */
  fecha: string;
  m3: number;
  /** Trozas que todavía no tienen fecha ni «no llegó». */
  trozas: number;
}

export interface GuiasSinRecibir {
  guias: number;
  m3: number;
  trozas: number;
  /** Guías de un mes cerrado: no se tocan (se reabre el mes primero), así que no van al aviso. */
  enMesCerrado: number;
  /** Los N° para abrir la recepción en bloque, la más vieja primero (tope `TOPE_GUIAS_DEL_AVISO`). */
  gtfs: string[];
  detalle: GuiaSinRecibir[];
}

/** La recepción en bloque lee cada guía por separado: más de esto no se abre de una vez. */
export const TOPE_GUIAS_DEL_AVISO = 40;

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Junta los asientos por guía (serie + N°) y deja las que la recepción en
 * bloque todavía puede recibir: con algún asiento sin fecha o trozas sin
 * decidir (`faltaRecibirMadera`, el mismo criterio del bloque) y fuera de un
 * mes cerrado.
 */
export function resumirGuiasSinRecibir(
  asientos: readonly AsientoSinRecibir[],
  cierres: readonly CtpCierrePeriodo[],
): GuiasSinRecibir {
  const porGuia = new Map<string, AsientoSinRecibir[]>();
  for (const a of asientos) {
    const clave = `${(a.gtfSeries ?? "").trim()}|${a.gtfNumber.trim()}`;
    porGuia.set(clave, [...(porGuia.get(clave) ?? []), a]);
  }
  const cerrados = [...cierres];
  const detalle: GuiaSinRecibir[] = [];
  let enMesCerrado = 0;
  for (const lineas of porGuia.values()) {
    const vivas = lineas.filter((l) => l.status !== "anulado" && l.status !== "rechazado");
    if (vivas.length === 0) continue;
    const trozasCount = vivas.reduce((s, l) => s + l.trozasCount, 0);
    const trozasDecididas = vivas.reduce((s, l) => s + l.trozasDecididas, 0);
    if (!faltaRecibirMadera({ status: "pendiente", lineas: vivas, trozasCount, trozasDecididas })) continue;
    /* El mes del libro lo da el asiento (`assertPeriodoAbierto` mira `entryDate`). */
    if (vivas.some((l) => isDateClosed(cerrados, new Date(l.entryDate)))) {
      enMesCerrado += 1;
      continue;
    }
    const fechas = vivas.map((l) => diaDelLibro(l.entryDate)).filter((d): d is string => d != null).sort();
    detalle.push({
      gtf: vivas[0].gtfNumber.trim(),
      serie: vivas[0].gtfSeries?.trim() || null,
      fecha: fechas[0] ?? "",
      m3: r3(vivas.filter((l) => !l.fechaRecepcion).reduce((s, l) => s + l.volumeM3, 0)),
      trozas: trozasCount - trozasDecididas,
    });
  }
  detalle.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.gtf.localeCompare(b.gtf));
  return {
    guias: detalle.length,
    m3: r3(detalle.reduce((s, g) => s + g.m3, 0)),
    trozas: detalle.reduce((s, g) => s + g.trozas, 0),
    enMesCerrado,
    gtfs: [...new Set(detalle.map((g) => g.gtf))].slice(0, TOPE_GUIAS_DEL_AVISO),
    detalle: detalle.slice(0, TOPE_GUIAS_DEL_AVISO),
  };
}
