/**
 * loth-seccion — leer una sección del libro como se lee un libro contable:
 * por período, ordenado, filtrado, y con la suma al pie.
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

/** Los períodos presentes, del más nuevo al más viejo, con su conteo. */
export function periodosDe(entries: LothEntryDTO[]): { periodo: string; label: string; count: number }[] {
  const acc = new Map<string, number>();
  for (const e of entries) {
    const p = periodoDe(e.entryDate);
    if (p) acc.set(p, (acc.get(p) ?? 0) + 1);
  }
  return [...acc.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([periodo, count]) => ({ periodo, label: periodoLabel(periodo), count }));
}

export type EstadoFiltro = "todas" | "registrado" | "anulado" | "fuera_plazo" | "corregidas";
export type OrdenCampo = "lineNo" | "fecha" | "codigo" | "especie" | "volumen";
export type OrdenDir = "asc" | "desc";

export interface FiltroSeccion {
  periodo: string; // "" = todos
  estado: EstadoFiltro;
  especie: string; // "" = todas
}

export const FILTRO_VACIO: FiltroSeccion = { periodo: "", estado: "todas", especie: "" };

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

/** ¿Esta línea quedó fuera del plazo de registro? (delegado, no re-implementado) */
type PredicadoPlazo = (entryDate: string, createdAt: string | null | undefined) => boolean;

export function filtrarLineas(
  entries: LothEntryDTO[],
  filtro: FiltroSeccion,
  fueraDePlazo: PredicadoPlazo,
  corregidaPor?: Map<number, number>,
): LothEntryDTO[] {
  return entries.filter((e) => {
    if (filtro.periodo && periodoDe(e.entryDate) !== filtro.periodo) return false;
    if (filtro.especie && e.speciesCommon !== filtro.especie) return false;
    switch (filtro.estado) {
      case "registrado":
        return e.status === "registrado";
      case "anulado":
        return e.status === "anulado";
      case "fuera_plazo":
        return e.status === "registrado" && fueraDePlazo(e.entryDate, e.createdAt);
      case "corregidas":
        return corregidaPor ? corregidaPor.has(e.lineNo) : false;
      default:
        return true;
    }
  });
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
      return e.speciesCommon ?? "";
    case "volumen":
      return n(e.volumeM3) || n(e.quantity);
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
    volumenM3: Math.round(vivas.reduce((a, e) => a + n(e.volumeM3), 0) * 10000) / 10000,
    cantidad: Math.round(vivas.reduce((a, e) => a + n(e.quantity), 0) * 10000) / 10000,
    piezas: vivas.reduce((a, e) => a + (e.pieces ?? 0), 0),
    unidades,
  };
}

/** Qué columna de totales tiene sentido en cada sección. */
export function totalRelevante(section: LothSection): "volumen" | "cantidad" | "conteo" {
  if (section === "tala" || section === "trozado" || section === "consumo_troza") return "volumen";
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
  const rows = entries.map((e) => [
    e.lineNo, e.entryDate?.slice(0, 10) ?? "", e.section, e.treeCode ?? "", e.trozaCode ?? "",
    e.speciesCommon ?? "", e.speciesScientific ?? "", e.cites ? "Sí" : "No",
    e.diamMayorM ?? "", e.diamMenorM ?? "", e.lengthM ?? "", e.volumeM3 ?? "",
    e.productType ?? "", e.quantity ?? "", e.unit ?? "", e.pieces ?? "",
    e.gtfNumber ?? "", e.status, e.correctsLineNo ?? "",
    e.observations ?? "",
  ]);
  return [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}
