/**
 * Las cifras del censo que se leen en DOS lugares —las tarjetas de arriba y el
 * pie de la tabla— salen de acá (08-10, «al nivel de las Secciones»): con un
 * filtro de columna puesto, «Volumen estimado» y el total del pie son el MISMO
 * número porque son la misma cuenta sobre los mismos árboles.
 *
 * PURO: sin React. Sólo presentación: suma el `volumenEstimadoM3` que declaró
 * el regente, árbol por árbol, sin recalcular nada.
 */

import { claveEspecie } from "@/lib/forestal/loth-constants";
import { CATEGORIA_LABEL } from "@/lib/forestal/loth-poa";
import type { ValorFaceta } from "@/lib/admin/filtros-columna";
import type { FilaDesglose } from "./CtpKpi";
import type { ArbolCenso } from "./loth-censo-arbol";

export interface CifrasDelCenso {
  arboles: number;
  /** Suma de «Vol. m³» (4 decimales, como el libro). Los árboles sin volumen no suman. */
  volumenM3: number;
  enPie: number;
  /** Árboles cuya especie el plan no autoriza (tala potencialmente ilegal). */
  fueraDelPlan: number;
  /** Esas especies, escritas como en el censo: tocar la tarjeta filtra la columna Especie por ellas. */
  especiesFuera: string[];
  cites: number;
  /** El reparto por especie (m³ declarados). */
  porEspecie: FilaDesglose[];
  /** El reparto por categoría POA (árboles), nombrado como el filtro de la columna. */
  porCategoria: FilaDesglose[];
}

const n = (v: string | null | undefined) => (v == null || v === "" ? 0 : Number(v) || 0);

export function cifrasDelCenso(
  arboles: readonly ArbolCenso[],
  categorias: ReadonlyMap<string, keyof typeof CATEGORIA_LABEL>,
  fueraDelPlan: (especie: string) => boolean,
): CifrasDelCenso {
  let volumenM3 = 0;
  let enPie = 0;
  let fuera = 0;
  let cites = 0;
  /* Por `claveEspecie`: «Tornillo» y «TORNILLO» son una, como en el filtro. */
  const especies = new Map<string, FilaDesglose>();
  const especiesFuera = new Map<string, string>();
  const porCategoria = new Map<string, FilaDesglose>();
  for (const t of arboles) {
    volumenM3 = Math.round((volumenM3 + n(t.volumenEstimadoM3)) * 10000) / 10000;
    if (t.estado === "en_pie") enPie += 1;
    if (t.cites) cites += 1;
    const nombre = t.speciesCommon?.trim() || "Sin especie";
    const k = claveEspecie(nombre);
    const fila = especies.get(k) ?? { value: nombre, count: 0, volumeM3: 0 };
    fila.count += 1;
    fila.volumeM3 = Math.round(((fila.volumeM3 ?? 0) + n(t.volumenEstimadoM3)) * 10000) / 10000;
    especies.set(k, fila);
    if (fueraDelPlan(t.speciesCommon)) {
      fuera += 1;
      if (!especiesFuera.has(k)) especiesFuera.set(k, t.speciesCommon);
    }
    const cat = categorias.get(t.id);
    if (cat) {
      const label = CATEGORIA_LABEL[cat];
      const c = porCategoria.get(label) ?? { value: label, count: 0 };
      c.count += 1;
      porCategoria.set(label, c);
    }
  }
  return {
    arboles: arboles.length,
    volumenM3,
    enPie,
    fueraDelPlan: fuera,
    especiesFuera: [...especiesFuera.values()],
    cites,
    porEspecie: [...especies.values()],
    porCategoria: [...porCategoria.values()],
  };
}

/** ¿La columna tiene puestos exactamente esos valores (en cualquier orden)? El anillo de la tarjeta que filtra por varios. */
export function filtraJusto(actual: ValorFaceta | undefined, valores: readonly string[]): boolean {
  if (!Array.isArray(actual) || actual.length !== valores.length || valores.length === 0) return false;
  const puestos = new Set(actual);
  return valores.every((v) => puestos.has(v));
}

/** Tocar la tarjeta: pone esos valores en la columna, o los saca si ya eran ésos (segundo toque = deshacer). */
export function alternarJusto(actual: ValorFaceta | undefined, valores: readonly string[]): string[] | undefined {
  return filtraJusto(actual, valores) ? undefined : [...valores];
}
