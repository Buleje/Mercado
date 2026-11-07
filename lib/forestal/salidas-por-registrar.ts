/**
 * salidas-por-registrar — fuente ÚNICA de «el Anexo 04 de esta GTF ya salió y
 * su salida todavía no está en el Libro» (ADR-519, aviso de plazo). Puro: lo
 * leen el Recorrido del permiso, la campana y la sección Despacho del Libro.
 *
 * Qué anexo está pendiente NO se decide acá: es `clasificarAnexos` (el mismo
 * código de la pastilla «guías sin registrar» y del modal que las registra), con
 * los vínculos verificados como `bandejaConfiable` (`anexosConfiables`).
 *
 * El plazo NO se calcula acá: `venceElRegistro` busca el último día en que el
 * predicado de `ctp-compliance.ts` (`estaFueraDePlazo`, 2 días HÁBILES, RDE
 * D000025-2023) todavía dice «en plazo». Badge, panel y Excel comparten ese
 * predicado; no hay otra cuenta de días.
 */

import { estaFueraDePlazo } from "./ctp-compliance";
import { clasificarAnexos, type AnexoParaDespacho } from "./anexo-a-despacho";
import { mismoNumeroGtf } from "./gtf-talonario";

export interface SalidaPorRegistrar {
  anexoId: string;
  numero: string;
  gtfNumber: string;
  /** Último día en plazo, AAAA-MM-DD. */
  venceEl: string;
  /** `venceEl` ya pasó (según `hoy`). */
  fueraDePlazo: boolean;
}

/**
 * El último día en plazo de registro de una línea fechada `fecha`: el mayor día
 * en que `estaFueraDePlazo` todavía dice que no. 2 hábiles caben en 9 días
 * corridos aun con feriado de fin de semana largo.
 */
export function venceElRegistro(fecha: Date | string): string {
  /* La actividad cuenta desde la medianoche UTC de su día (la convención de
     `diasHabilesDeRegistro`), aunque el Libro la guarde a mediodía. */
  const f = new Date(typeof fecha === "string" && fecha.length === 10 ? `${fecha}T12:00:00.000Z` : fecha);
  const dia = (n: number) => new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate() + n));
  const base = dia(0);
  let ultimo = base;
  for (let n = 1; n <= 9; n++) {
    /* Registrar al último segundo del día n. */
    if (estaFueraDePlazo({ entryDate: base, createdAt: new Date(dia(n + 1).getTime() - 1) })) break;
    ultimo = dia(n);
  }
  return ultimo.toISOString().slice(0, 10);
}

/** Una línea de Despacho vigente (registrada, no anulada ni borrada). */
export interface DespachoVivo {
  id: string;
  gtfNumber: string | null;
}

/**
 * La bandeja con sus vínculos verificados (seguridad S3, espejo puro de
 * `bandejaConfiable` en `forest-ctp-guia-desde-anexo.db.ts`): `ctpEntryId` sólo
 * vale si ese despacho vivo lleva la MISMA guía. `vivos` = los despachos vivos
 * que citan los anexos (`ctpEntryId` y `despachoIds`).
 */
export function anexosConfiables(
  cruda: readonly AnexoParaDespacho[],
  vivos: readonly DespachoVivo[],
): { lista: AnexoParaDespacho[]; vigentes: Set<string> } {
  const porId = new Map(vivos.map((v) => [v.id, v]));
  const lista = cruda.map((a) => {
    if (!a.ctpEntryId) return a;
    const d = porId.get(a.ctpEntryId);
    return d && mismoNumeroGtf(d.gtfNumber, a.gtf) ? a : { ...a, ctpEntryId: undefined };
  });
  return { lista, vigentes: new Set(porId.keys()) };
}

/** Los ids de despacho que citan los anexos: lo que hay que leer para saber cuáles siguen vivos. */
export const idsDeDespachosCitados = (anexos: readonly AnexoParaDespacho[]): string[] => [
  ...new Set(anexos.flatMap((a) => [...(a.despachoIds ?? []), ...(a.ctpEntryId ? [a.ctpEntryId] : [])])),
];

/**
 * Las guías cuyo Anexo 04 salió y su salida no está en el Libro: exactamente
 * `clasificarAnexos(...).pendientes`. El que antes vence, primero. `hoy` = `limaDateKey()`.
 */
export function salidasPorRegistrar(
  anexos: readonly AnexoParaDespacho[],
  vivos: readonly DespachoVivo[],
  hoy: string,
): SalidaPorRegistrar[] {
  const { lista, vigentes } = anexosConfiables(anexos, vivos);
  return clasificarAnexos(lista, vigentes)
    .pendientes.map((a) => {
      const venceEl = venceElRegistro(a.fecha);
      return { anexoId: a.id, numero: a.numero, gtfNumber: a.gtf.trim(), venceEl, fueraDePlazo: venceEl < hoy };
    })
    .sort((x, y) => x.venceEl.localeCompare(y.venceEl) || x.gtfNumber.localeCompare(y.gtfNumber));
}

/** «jueves 29-10» (date-only: formateado en UTC, nunca en la zona del equipo). */
export function diaDeVencimiento(iso: string): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  const semana = d.toLocaleDateString("es-PE", { weekday: "long", timeZone: "UTC" });
  return `${semana} ${iso.slice(8, 10)}-${iso.slice(5, 7)}`;
}

/** Texto de la campana, en la voz de Brandon. */
export function textoDeSalida(s: SalidaPorRegistrar, hoy: string): { title: string; description: string } {
  if (s.fueraDePlazo) {
    return {
      title: `Fuera de plazo: la salida de la GTF ${s.gtfNumber}`,
      description: `Debía registrarse hasta el ${diaDeVencimiento(s.venceEl)}. Regístrala ya en el Libro.`,
    };
  }
  return {
    title: `Registrar hoy la salida de la GTF ${s.gtfNumber}`,
    description: s.venceEl === hoy ? "Vence hoy." : `Vence el ${diaDeVencimiento(s.venceEl)}.`,
  };
}

/** La cola del aviso del Libro: «la primera vence el jueves 29-10». */
export function cuandoVence(primera: SalidaPorRegistrar, hoy: string): string {
  if (primera.fueraDePlazo) return `la primera venció el ${diaDeVencimiento(primera.venceEl)}`;
  return primera.venceEl === hoy ? "la primera vence hoy" : `la primera vence el ${diaDeVencimiento(primera.venceEl)}`;
}
