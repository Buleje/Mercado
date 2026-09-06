/**
 * loth-trace-ui — lo que comparten la tarjeta, la tabla y la barra de filtros
 * de la vista «Por árbol»: cómo se pinta un veredicto, cómo se escribe una
 * fecha del libro y qué órdenes/filtros existen.
 *
 * Vive fuera de los componentes para que el color de una merma grave sea el
 * mismo en la tarjeta y en la fila de la tabla — que es justamente el problema
 * que tenía esta pantalla cuando cada mitad publicaba su propia versión.
 */

import type { TraceOperation } from "@/lib/forestal/loth-trace";
import type { TraceFila } from "@/lib/forestal/loth-trace-tabla";
import type { VeredictoMerma } from "@/lib/forestal/loth-trace-umbrales";

/** Tonos de un veredicto de merma. El `-700` necesita su `dark:` o se apaga. */
export const TONO_MERMA: Record<VeredictoMerma, { texto: string; barra: string; chip: string }> = {
  ok: {
    texto: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
    barra: "bg-[var(--data-success-500)]",
    chip: "border-[var(--data-success-500)] bg-[var(--data-success-500)]/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  },
  aviso: {
    texto: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
    barra: "bg-[var(--data-warning-500)]",
    chip: "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  },
  grave: {
    texto: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
    barra: "bg-[var(--data-error-500)]",
    chip: "border-[var(--data-error-500)] bg-[var(--data-error-500)]/10 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  },
};

/** El color del rendimiento es el complemento del veredicto de su merma: un
 *  solo criterio para el número, la barra y el chip. */
export const tonoDe = (v: VeredictoMerma | null) => TONO_MERMA[v ?? "ok"];

/**
 * Fecha del libro en corto. `timeZone: "UTC"` no es opcional: las fechas son
 * date-only y en Lima (UTC−5) formatearlas en local muestra el día anterior.
 */
export function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: "UTC" });
}

/** Fecha larga, para el detalle y el pasaporte. */
export function fmtFechaLarga(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

/** «3 días» / «1 día» / «el mismo día» / «—». */
export function fmtDias(d: number | null | undefined): string {
  if (d == null) return "—";
  if (d === 0) return "el mismo día";
  return d === 1 ? "1 día" : `${d} días`;
}

/** El recorrido en palabras. «0 días de la tala a la salida» no es castellano. */
export function fmtRecorrido(d: number | null | undefined): string {
  if (d == null) return "todavía sin salida";
  if (d === 0) return "salió el mismo día de la tala";
  return `${fmtDias(d)} de la tala a la salida`;
}

/** Plural sin el «1 trozas» que decía la pantalla vieja. */
export const plural = (n: number, singular: string, plural_: string) => `${n} ${n === 1 ? singular : plural_}`;

// ─── filtros y orden ─────────────────────────────────────────────────────────

export type TraceFiltro = "todas" | "completa" | "alertas" | "cites" | "patio" | "plazo" | "merma" | "en_pie" | "gtf_fantasma" | "sin_troza";
export type TraceOrden = "volumen" | "merma" | "rendimiento" | "codigo" | "etapas" | "fecha" | "precision";
export type TraceModo = "tarjetas" | "tabla";

export const ORDEN_LABEL: Record<TraceOrden, string> = {
  volumen: "Mayor volumen",
  merma: "Mayor merma",
  rendimiento: "Mayor rendimiento",
  precision: "Peor precisión de censo",
  etapas: "Más avanzada",
  fecha: "Más reciente",
  codigo: "Código",
};

const cmpNum = (a: number | null, b: number | null) => (b ?? -Infinity) - (a ?? -Infinity);

/** Ordenadores sobre la fila fusionada (sirven para tarjetas y tabla). */
export const ORDENADORES: Record<TraceOrden, (a: TraceFila, b: TraceFila) => number> = {
  volumen: (a, b) => cmpNum(a.taladoM3, b.taladoM3),
  merma: (a, b) => cmpNum(a.mermaPct, b.mermaPct),
  rendimiento: (a, b) => cmpNum(a.rendimientoPct, b.rendimientoPct),
  // «Peor precisión» = la más lejos de 100, en cualquier dirección.
  precision: (a, b) => cmpNum(desvio(a.precisionCensoPct), desvio(b.precisionCensoPct)),
  etapas: (a, b) => b.etapas - a.etapas,
  fecha: (a, b) => (b.op?.lastDate ?? "").localeCompare(a.op?.lastDate ?? ""),
  codigo: (a, b) => a.tree.localeCompare(b.tree, "es", { numeric: true }),
};

const desvio = (pct: number | null): number | null => (pct == null ? null : Math.abs(pct - 100));

/** ¿La fila pasa el filtro elegido? */
export function pasaFiltro(f: TraceFila, filtro: TraceFiltro): boolean {
  switch (filtro) {
    case "todas":
      return true;
    case "completa":
      return f.op?.chain === "completa";
    case "alertas":
      return f.nivel != null;
    case "cites":
      return f.cites;
    case "patio":
      return (f.op?.trozasEnPatio ?? 0) > 0;
    case "plazo":
      return f.tardias > 0;
    case "merma":
      return f.mermaVeredicto === "aviso" || f.mermaVeredicto === "grave";
    case "en_pie":
      return f.enPie;
    case "gtf_fantasma":
      return (f.op?.gtfsFantasma.length ?? 0) > 0;
    case "sin_troza":
      return (f.op?.productoSinTroza ?? 0) > 0;
  }
}

/** Búsqueda inversa sobre la fila: árbol, especie, troza, GTF. */
export function filaMatches(f: TraceFila, query: string): { matched: boolean; hint: string | null } {
  const q = query.trim().toLowerCase();
  if (!q) return { matched: true, hint: null };
  if (f.tree.toLowerCase().includes(q)) return { matched: true, hint: null };
  if ((f.especie ?? "").toLowerCase().includes(q)) return { matched: true, hint: null };
  if ((f.op?.scientific ?? "").toLowerCase().includes(q)) return { matched: true, hint: null };
  const troza = f.op?.trozado.find((t) => t.trozaCode?.toLowerCase().includes(q));
  if (troza) return { matched: true, hint: `coincide la troza ${troza.trozaCode}` };
  const gtf = f.gtfs.find((g) => g.toLowerCase().includes(q));
  if (gtf) return { matched: true, hint: `coincide la GTF ${gtf}` };
  return { matched: false, hint: null };
}

/** ¿Alguna línea del árbol cae dentro del rango de fechas elegido? */
export function enRango(f: TraceFila, desde: string, hasta: string): boolean {
  if (!desde && !hasta) return true;
  const first = f.op?.firstDate?.slice(0, 10) ?? f.ficha?.fechaTala?.slice(0, 10) ?? null;
  const last = f.op?.lastDate?.slice(0, 10) ?? first;
  if (!first || !last) return false; // un árbol en pie no tiene fechas que filtrar
  if (desde && last < desde) return false;
  if (hasta && first > hasta) return false;
  return true;
}

/** Callbacks de navegación: la pantalla deja de ser un callejón sin salida. */
export interface TraceNav {
  /** Abre la cadena de custodia de un código (árbol o troza). */
  onVerCadena?: (code: string) => void;
  /** Lleva a la vista GTF con esa guía enfocada. */
  onVerGtf?: (gtf: string) => void;
  /** Lleva al mapa del libro centrado en ese árbol. */
  onVerMapa?: (tree: string) => void;
}

/** Etapas del recorrido con su nombre corto y las líneas que las respaldan. */
export function etapasDe(op: TraceOperation) {
  return [
    { n: 1, label: "Tala", rows: op.tala, fecha: op.etapaFechas[0] },
    { n: 2, label: "Trozado", rows: op.trozado, fecha: op.etapaFechas[1] },
    { n: 3, label: "Desp. troza", rows: op.despachoTroza, fecha: op.etapaFechas[2] },
    { n: 4, label: "Consumo", rows: op.consumo, fecha: op.etapaFechas[3] },
    { n: 5, label: "Producto", rows: op.producto, fecha: op.etapaFechas[4] },
    { n: 6, label: "Desp. PT", rows: op.despachoPT, fecha: op.etapaFechas[5] },
  ];
}
