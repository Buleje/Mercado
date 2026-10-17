/**
 * El autofiltro de Excel de cada columna de la vista «Por árbol» (Brandon
 * 07-10: «en general ponerlo en todas las tablas del Libro… y quitar los
 * filtros que están sueltos»).
 *
 * Reemplaza a la fila suelta de filtros sin perder ninguno:
 *   · el buscador «Árbol, especie, troza o N° de GTF» → la búsqueda de la
 *     columna Árbol, que también mira sus trozas, sus GTF y el científico;
 *   · «Estado» (el desplegable y las pastillas) → la lista de la columna
 *     Observaciones: un árbol puede estar en varios estados a la vez;
 *   · «Especie» → la lista de la columna Especie;
 *   · «Fechas» → el rango de la columna Última (la fecha de su último
 *     movimiento, como la lee Excel).
 *
 * Especie y Última siguen acotando también el «Avance del permiso» y «Qué falta
 * hacer», como hacían los filtros sueltos: son el alcance de la vista. El
 * estado y los números sólo recortan la lista (ADR-400: los indicadores
 * describen lo registrado).
 */

import type { ColumnaFiltro, FacetasEstado, Rango } from "@/lib/admin/filtros-columna";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import type { TraceFila } from "@/lib/forestal/loth-trace-tabla";
import { FILTROS_ESTADO, pasaFiltro, type TraceFiltro } from "./loth-trace-ui";

const ddmm = (v: number | string) =>
  typeof v === "string" && v.length >= 10 ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : String(v);

/** Los estados que se filtran (todos menos «Todos los árboles»), por su nombre. */
export const ESTADOS_TRACE = FILTROS_ESTADO.filter((e) => e.key !== "todas");
const LABEL_ESTADO = new Map(ESTADOS_TRACE.map((e) => [e.key, e.label]));
export const labelDeEstado = (k: TraceFiltro) => LABEL_ESTADO.get(k) ?? k;

/** Id de los filtros con nombre propio (el resto, el de su columna). */
export const ID_ARBOL = "tree";
export const ID_ESPECIE = "especie";
export const ID_ULTIMA = "ultima";
export const ID_ESTADO = "obs";

/** Lo que encuentra la búsqueda de la columna Árbol: el código, la especie, el científico, sus trozas y sus GTF. */
function valoresDeArbol(f: TraceFila): string[] {
  return [f.tree, f.especie, f.op?.scientific, ...(f.op?.trozado.map((t) => t.trozaCode) ?? []), ...f.gtfs].filter(
    (x): x is string => !!x,
  );
}

/** Minúsculas sin tildes, como la búsqueda de `useFiltrosTabla`. */
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** ¿La búsqueda de la columna Árbol encuentra este árbol? (misma regla que el autofiltro). */
export function coincideArbol(f: TraceFila, q: string): boolean {
  const n = norm(q.trim());
  return !n || valoresDeArbol(f).some((v) => norm(v).includes(n));
}

/** Lo que sólo sabe la operación: un árbol en pie no tiene trozado ni rendimiento («—», no 0). */
const deOp = (v: (f: TraceFila) => number | null) => (f: TraceFila) => (f.op ? v(f) : null);

export const FILTROS_TRACE: readonly ColumnaFiltro<TraceFila>[] = [
  {
    id: ID_ARBOL,
    label: "Árbol",
    tipo: "texto",
    valor: valoresDeArbol,
  },
  { id: ID_ESPECIE, label: "Especie", tipo: "multi", valor: (f) => f.especie?.trim() || "Sin especie", clave: claveEspecie },
  { id: "censo", label: "Censo m³", tipo: "rango", numero: (f) => f.censoM3, unidad: "m³", paso: 0.001 },
  { id: "talado", label: "Talado m³", tipo: "rango", numero: (f) => f.taladoM3, unidad: "m³", paso: 0.001 },
  { id: "precision", label: "Precisión", tipo: "rango", numero: (f) => f.precisionCensoPct, unidad: "%", paso: 1 },
  { id: "trozado", label: "Trozado m³", tipo: "rango", numero: deOp((f) => f.trozadoM3), unidad: "m³", paso: 0.001 },
  { id: "rend", label: "Rend.", tipo: "rango", numero: (f) => f.rendimientoPct, unidad: "%", paso: 1 },
  { id: "merma", label: "Merma", tipo: "rango", numero: (f) => f.mermaM3, unidad: "m³", paso: 0.001 },
  { id: "movilizado", label: "Salió m³", tipo: "rango", numero: deOp((f) => f.movilizadoM3), unidad: "m³", paso: 0.001 },
  { id: "etapas", label: "Etapas", tipo: "rango", numero: deOp((f) => f.etapas), paso: 1 },
  { id: ID_ULTIMA, label: "Última", tipo: "fecha", numero: (f) => f.op?.lastDate?.slice(0, 10) ?? null, formatearValor: ddmm },
  {
    id: ID_ESTADO,
    label: "Estado",
    tipo: "multi",
    valor: (f) => ESTADOS_TRACE.filter((e) => pasaFiltro(f, e.key)).map((e) => e.label),
  },
];

/** Las columnas que acotan TODA la vista (avance y pendientes), no sólo la lista. */
export const FILTROS_ALCANCE = FILTROS_TRACE.filter((c) => c.id === ID_ESPECIE || c.id === ID_ULTIMA);

/** Las facetas sin la de una columna: para contar cada estado sin aplicarse a sí mismo. */
export function facetasSin(facetas: FacetasEstado, id: string): FacetasEstado {
  if (!(id in facetas)) return facetas;
  const resto = { ...facetas };
  delete resto[id];
  return resto;
}

/** Los estados elegidos en la columna Observaciones, como claves. */
export function estadosElegidos(facetas: FacetasEstado): TraceFiltro[] {
  const v = facetas[ID_ESTADO];
  if (!Array.isArray(v)) return [];
  return ESTADOS_TRACE.filter((e) => v.includes(e.label)).map((e) => e.key);
}

/** El rango de fechas elegido en «Última» (para el rótulo del alcance). */
export function rangoUltima(facetas: FacetasEstado): { desde: string; hasta: string } {
  const v = facetas[ID_ULTIMA] as Rango<string> | undefined;
  return { desde: v?.min ?? "", hasta: v?.max ?? "" };
}
