/**
 * El autofiltro de Excel de cada columna de la tabla de trozas del Control del
 * permiso (Brandon 07-10: «en general ponerlo en todas las tablas del Libro»).
 *
 * Sale de `COLUMNAS_TABLERO` (la misma lista que dibuja, ordena y exporta), así
 * que una columna nueva trae su filtro sin tocar acá: los códigos se buscan por
 * fragmento, lo que se elige de una lista corta (especie, estado, placa…) es una
 * lista, y las medidas, días y fechas son rangos.
 *
 * El desplegable «Todas las especies» que vivía suelto al lado del buscador es
 * ahora el filtro de la columna Especie; el de Estado comparte su estado con las
 * cifras de «Estado de las trozas» (un solo estado, dos maneras de tocarlo).
 */

import type { ColumnaFiltro } from "@/components/admin/shared/filtros-columna";
import { COLUMNAS_TABLERO, type ColumnaKey, type ColumnaTablero } from "@/lib/forestal/loth-tablero-columnas";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import type { TrozaTablero } from "@/lib/forestal/loth-tablero-trozas";

/** Las de texto que se BUSCAN (un código se tipea, no se elige de una lista de 80). */
const DE_BUSQUEDA = new Set<ColumnaKey>(["code", "arbol", "gtf", "codDespacho"]);
const UNIDAD: Partial<Record<ColumnaTablero["tipo"], string>> = { m3: "m³", metros: "m", dias: "d" };
const PASO: Partial<Record<ColumnaTablero["tipo"], number>> = { m3: 0.001, metros: 0.01, dias: 1, numero: 1 };

const ddmm = (v: number | string) =>
  typeof v === "string" && v.length >= 10 ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : String(v);

/** Id del filtro de la columna extra «Permiso» (con «Todos»). */
export const FILTRO_PERMISO = "permiso";

function filtroDe(c: ColumnaTablero, visible: boolean): ColumnaFiltro<TrozaTablero> {
  const base = { id: c.key, label: c.label, visible };
  if (c.tipo === "fecha") {
    return { ...base, tipo: "fecha", numero: (f) => (c.valor(f) as string | null)?.slice(0, 10) ?? null, formatearValor: ddmm };
  }
  if (c.tipo !== "texto") {
    return { ...base, tipo: "rango", numero: (f) => c.valor(f) as number | null, unidad: UNIDAD[c.tipo], paso: PASO[c.tipo] };
  }
  const texto = (f: TrozaTablero) => {
    const v = c.valor(f);
    return v == null || v === "" ? null : String(v);
  };
  if (DE_BUSQUEDA.has(c.key)) return { ...base, tipo: "texto", valor: texto };
  return {
    ...base,
    tipo: "multi",
    valor: (f) => texto(f) ?? "Sin dato",
    ...(c.key === "especie" || c.key === "cientifico" ? { clave: claveEspecie } : {}),
  };
}

/**
 * El filtro de cada columna. Las que el usuario apagó en «Columnas» siguen
 * filtrando (su control migra al plegable): un filtro nunca queda huérfano.
 */
export function filtrosTablero(
  visibles: readonly ColumnaKey[],
  permisoDe?: (planId: string | null) => string,
): ColumnaFiltro<TrozaTablero>[] {
  const cols = COLUMNAS_TABLERO.map((c) => filtroDe(c, visibles.includes(c.key)));
  if (!permisoDe) return cols;
  return [...cols, { id: FILTRO_PERMISO, label: "Permiso", tipo: "multi", valor: (f) => permisoDe(f.planId) }];
}
