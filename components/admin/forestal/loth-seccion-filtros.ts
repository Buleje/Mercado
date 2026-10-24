/**
 * El autofiltro de Excel de cada columna de una sección del Libro TH (Brandon
 * 07-10: «en los encabezados poner los filtros estilo Excel… y quitar los
 * filtros que están sueltos»).
 *
 * Reemplaza a la barra suelta de la sección, sin perder ninguno de sus filtros:
 *   · «Período»  → el rango de la columna Fecha;
 *   · «Especie»  → la lista de la columna Especie;
 *   · «Estado»   → la lista de la columna Observaciones (registrada, anulada,
 *                  fuera de plazo, corregida…);
 *   · el buscador «Código, especie o GTF» → la búsqueda de la columna de
 *     código (la del árbol también encuentra sus trozas) y la de la GTF.
 *
 * Filtra en el cliente: la sección llega ENTERA (el libro se lee completo para
 * los indicadores), así que el filtro mira todas sus líneas y no sólo la
 * página que se ve.
 */

import type { ColumnaFiltro } from "@/components/admin/shared/filtros-columna";
import { claveEspecie, estaFueraDePlazo, type LothEntryDTO } from "@/lib/forestal/loth-constants";
import { especieDeLinea, medidasDeLinea, volumenDeLinea } from "@/lib/forestal/loth-despacho-medidas";

/** «m3» → «m³»: la unidad como se lee en la tabla y en su filtro. */
export function etiquetaUnidad(u: string | null): string {
  return u === "m3" ? "m³" : u === "kg" ? "Kg" : u === "unidad" ? "Unidad" : (u ?? "—");
}

const ddmm = (v: number | string) =>
  typeof v === "string" && v.length >= 10 ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : String(v);
const numero = (v: string | null) => (v == null || v === "" ? null : Number(v));

export const ESTADO_LINEA = {
  registrada: "Registrada",
  anulada: "Anulada",
  fueraDePlazo: "Fuera de plazo",
  corregida: "Corregida",
  corrige: "Corrige a otra",
  descartada: "Descartada",
} as const;

/** Lo que dice la columna Observaciones de una línea, como valores de su filtro. */
export function estadosDeLinea(e: LothEntryDTO, corregidaPor: ReadonlyMap<number, number>): string[] {
  const anulada = e.status === "anulado";
  const out: string[] = [anulada ? ESTADO_LINEA.anulada : ESTADO_LINEA.registrada];
  if (!anulada && estaFueraDePlazo(e.entryDate, e.createdAt)) out.push(ESTADO_LINEA.fueraDePlazo);
  if (corregidaPor.has(e.lineNo)) out.push(ESTADO_LINEA.corregida);
  if (e.correctsLineNo != null) out.push(ESTADO_LINEA.corrige);
  if (e.discarded) out.push(ESTADO_LINEA.descartada);
  return out;
}

/** El permiso y el titular de una línea, como se leen en la tabla y en sus filtros. */
export interface PermisoDeLinea {
  permiso: string;
  titular: string;
}
export const SIN_PLAN: PermisoDeLinea = { permiso: "Sin plan", titular: "Sin plan" };
const PLAN_DE_BAJA: PermisoDeLinea = { permiso: "Plan dado de baja", titular: "Plan dado de baja" };

/** De `planId` al permiso y titular del plan; sin plan, «Sin plan»; un plan que ya no está, «dado de baja». */
export function permisoDeLinea(planId: string | null | undefined, planes: ReadonlyMap<string, PermisoDeLinea>): PermisoDeLinea {
  if (!planId) return SIN_PLAN;
  return planes.get(planId) ?? PLAN_DE_BAJA;
}

/** El filtro de cada columna de las secciones, por la `key` de su `ColDef`. */
const POR_COLUMNA: Record<string, Omit<ColumnaFiltro<LothEntryDTO>, "id">> = {
  // El código del árbol también trae sus trozas: buscar «113» en Trozado da las trozas del árbol 113.
  tree: { label: "Cód. árbol", tipo: "texto", valor: (e) => e.treeCode },
  troza: { label: "Cód. troza", tipo: "texto", valor: (e) => [e.trozaCode, e.treeCode].filter((x): x is string => !!x) },
  // Especie y medidas: las de la línea o, en Despacho, las del trozado de su troza (08-10).
  esp: { label: "Especie", tipo: "multi", valor: (e) => especieDeLinea(e) || "Sin especie", clave: claveEspecie },
  dM: { label: "Ø may", tipo: "rango", numero: (e) => numero(medidasDeLinea(e).d1), unidad: "m", paso: 0.01 },
  dm: { label: "Ø men", tipo: "rango", numero: (e) => numero(medidasDeLinea(e).d2), unidad: "m", paso: 0.01 },
  L: { label: "Long.", tipo: "rango", numero: (e) => numero(medidasDeLinea(e).largo), unidad: "m", paso: 0.01 },
  vol: { label: "Vol. m³", tipo: "rango", numero: (e) => numero(volumenDeLinea(e)), unidad: "m³", paso: 0.001 },
  desp: { label: "Cód. despacho", tipo: "texto", valor: (e) => e.despachoCode },
  gtf: { label: "N° GTF", tipo: "texto", valor: (e) => e.gtfNumber },
  ci: { label: "Destino de la troza", tipo: "multi", valor: (e) => (e.consumoInterno ? "Consumo interno" : "Aserrío") },
  prod: { label: "Producto", tipo: "multi", valor: (e) => e.productType?.trim() || "Sin producto" },
  qty: { label: "Cantidad", tipo: "rango", numero: (e) => numero(e.quantity), paso: 0.0001 },
  unit: { label: "Unidad", tipo: "multi", valor: (e) => etiquetaUnidad(e.unit) },
  pcs: { label: "Piezas", tipo: "rango", numero: (e) => e.pieces, paso: 1 },
};

/** Cómo se llama el filtro de una columna (el menú «Columnas» lo usa para la que no tiene título, «ci»). */
export function etiquetaDeFiltro(key: string): string | undefined {
  return POR_COLUMNA[key]?.label;
}

/**
 * Las columnas con filtro de una sección: N°, Fecha, las de la sección (en el
 * orden de `keys`) y Observaciones (el estado de la línea). Con `{ key, label }`
 * el filtro se llama como la columna (Despacho dice «D1» donde Trozado dice «Ø may»).
 */
export function filtrosDeSeccion(
  keys: readonly (string | { key: string; label?: string })[],
  corregidaPor: ReadonlyMap<number, number>,
  /** Con la columna «permiso» (varios planes a la vista): sus dos filtros, Permiso y Titular. */
  planes: ReadonlyMap<string, PermisoDeLinea> = new Map(),
): ColumnaFiltro<LothEntryDTO>[] {
  const dePermiso: ColumnaFiltro<LothEntryDTO>[] = [
    { id: "permiso", label: "Permiso", tipo: "multi", valor: (e) => permisoDeLinea(e.planId, planes).permiso },
    { id: "titular", label: "Titular", tipo: "multi", valor: (e) => permisoDeLinea(e.planId, planes).titular },
  ];
  return [
    { id: "lineNo", label: "N°", tipo: "rango", numero: (e) => e.lineNo, paso: 1 },
    { id: "fecha", label: "Fecha", tipo: "fecha", numero: (e) => e.entryDate?.slice(0, 10) ?? null, formatearValor: ddmm },
    ...keys.flatMap((c) => {
      const k = typeof c === "string" ? c : c.key;
      const label = (typeof c === "string" ? "" : c.label) || POR_COLUMNA[k]?.label;
      return k === "permiso" ? dePermiso : POR_COLUMNA[k] && label ? [{ id: k, ...POR_COLUMNA[k], label }] : [];
    }),
    { id: "obs", label: "Estado", tipo: "multi", valor: (e) => estadosDeLinea(e, corregidaPor) },
  ];
}
