/**
 * loth-seccion — leer una sección del libro como se lee un libro contable:
 * por período, ordenado y con la suma al pie (el filtro de cada columna vive en
 * `components/admin/forestal/loth-seccion-filtros`).
 *
 * Lo que faltaba en la vista de secciones y esto resuelve:
 *  · el libro se lleva y se cierra **por mes**, y no había forma de mirar un mes;
 *  · una tabla de un libro sin totales obliga a sumar a mano;
 *  · la subsanación SERFOR permite CORREGIR una línea (no sólo anularla), y el
 *    vínculo `correctsLineNo` ya existía en el dato sin que nadie lo mostrara.
 *
 * PURO y client-safe.
 */

import type { LothEntryDTO, LothSection } from "./loth-constants";
import { especieDeLinea, medidasDeLinea, volumenDeLinea } from "./loth-despacho-medidas";

const n = (v: string | null | undefined): number => (v == null ? 0 : Number(v) || 0);

/** Período calendario de una línea, en clave ordenable `YYYY-MM`. */
export function periodoDe(entryDate: string | null | undefined): string | null {
  if (!entryDate) return null;
  const d = new Date(entryDate);
  if (Number.isNaN(d.getTime())) return null;
  // Día UTC: las fechas del libro son date-only y Lima es UTC−5.
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** «2026-07» → «julio 2026». */
export function periodoLabel(periodo: string): string {
  const [y, m] = periodo.split("-").map(Number);
  if (!y || !m) return periodo;
  // En español los meses van en minúscula; algunas versiones de ICU los
  // devuelven capitalizados, así que no se deja al azar del entorno.
  const nombre = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-PE", { month: "long", timeZone: "UTC" }).toLowerCase();
  return `${nombre} ${y}`;
}

export type OrdenCampo = "lineNo" | "fecha" | "codigo" | "especie" | "volumen";
export type OrdenDir = "asc" | "desc";

/**
 * Qué línea corrige a cuál. La corrección SERFOR no borra: asienta una línea
 * nueva que declara a quién enmienda, y la vieja queda visible marcada.
 */
export function mapaCorrecciones(entries: LothEntryDTO[]): {
  /** lineNo corregido → N° de la línea que lo corrige. */
  corregidaPor: Map<number, number>;
  /** lineNo de la línea correctora → N° que corrige. */
  corrige: Map<number, number>;
} {
  const corregidaPor = new Map<number, number>();
  const corrige = new Map<number, number>();
  for (const e of entries) {
    const target = e.correctsLineNo;
    if (target != null && e.status !== "anulado") {
      corregidaPor.set(target, e.lineNo);
      corrige.set(e.lineNo, target);
    }
  }
  return { corregidaPor, corrige };
}

const valorOrden = (e: LothEntryDTO, campo: OrdenCampo): string | number => {
  switch (campo) {
    case "lineNo":
      return e.lineNo;
    case "fecha":
      return e.entryDate ?? "";
    case "codigo":
      return e.trozaCode ?? e.treeCode ?? e.gtfNumber ?? "";
    case "especie":
      return especieDeLinea(e) ?? "";
    case "volumen":
      // El despacho no guarda medidas: ordena por las de su trozado.
      return n(volumenDeLinea(e)) || n(e.quantity);
  }
};

export function ordenarLineas(entries: LothEntryDTO[], campo: OrdenCampo, dir: OrdenDir): LothEntryDTO[] {
  const signo = dir === "asc" ? 1 : -1;
  return [...entries].sort((a, b) => {
    const va = valorOrden(a, campo);
    const vb = valorOrden(b, campo);
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * signo;
    return String(va).localeCompare(String(vb), "es", { numeric: true }) * signo;
  });
}

export interface TotalesSeccion {
  lineas: number;
  anuladas: number;
  volumenM3: number;
  cantidad: number;
  piezas: number;
  /** Unidades distintas presentes: si hay más de una, sumar la cantidad miente. */
  unidades: string[];
}

/**
 * Suma del pie. Las líneas anuladas **no** suman: siguen visibles porque el
 * libro no borra, pero un total que las incluya no cuadra con nada.
 */
export function totalesDe(entries: LothEntryDTO[]): TotalesSeccion {
  const vivas = entries.filter((e) => e.status !== "anulado");
  const unidades = [...new Set(vivas.map((e) => e.unit).filter((u): u is string => !!u))];
  return {
    lineas: vivas.length,
    anuladas: entries.length - vivas.length,
    volumenM3: Math.round(vivas.reduce((a, e) => a + n(volumenDeLinea(e)), 0) * 10000) / 10000,
    cantidad: Math.round(vivas.reduce((a, e) => a + n(e.quantity), 0) * 10000) / 10000,
    piezas: vivas.reduce((a, e) => a + (e.pieces ?? 0), 0),
    unidades,
  };
}

/** Qué columna de totales tiene sentido en cada sección. */
export function totalRelevante(section: LothSection): "volumen" | "cantidad" | "conteo" {
  // Despacho de trozas suma el m³ que sale, leído del trozado de cada troza (08-10).
  if (section === "tala" || section === "trozado" || section === "consumo_troza" || section === "despacho_troza") return "volumen";
  if (section === "producto_terminado" || section === "despacho_producto") return "cantidad";
  return "conteo";
}

/** CSV de lo que se está viendo (una fila por línea del libro). */
export function lineasToCsv(entries: LothEntryDTO[]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    "N°", "Fecha", "Sección", "Cód. árbol", "Cód. troza", "Especie", "Científico", "CITES",
    "Ø mayor", "Ø menor", "Longitud", "Volumen m³", "Producto", "Cantidad", "Unidad", "Piezas",
    "N° GTF", "Estado", "Corrige a", "Observaciones",
  ];
  /* Despacho de trozas: árbol, especie y medidas del trozado de su troza (la línea no las guarda). */
  const rows = entries.map((e) => [e, medidasDeLinea(e)] as const).map(([e, m]) => [
    e.lineNo, e.entryDate?.slice(0, 10) ?? "", e.section, m.arbol ?? "", e.trozaCode ?? "",
    m.especie ?? "", m.cientifico ?? "", m.cites ? "Sí" : "No",
    m.d1 ?? "", m.d2 ?? "", m.largo ?? "", m.m3 ?? "",
    e.productType ?? "", e.quantity ?? "", e.unit ?? "", e.pieces ?? "",
    e.gtfNumber ?? "", e.status, e.correctsLineNo ?? "",
    e.observations ?? "",
  ]);
  return [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}
