/**
 * «Sin marcar» en UNA tabla (Brandon, 2026-10-19: «en Sin marcar tipo tiene que
 * unirse, es decir en una tabla estarán ahí las medidas en una sola, y en esa
 * tabla estará una columna de permiso; pero el anexo 4 se pondrá de todo en uno
 * solo»).
 *
 * Antes había una tabla por bloque dentro de cada permiso. Ahora: todas las
 * líneas sin tildar juntas, ordenadas por su código (el bloque de donde vienen),
 * cada una con su permiso. Los totales son los mismos de antes: salen de
 * `porDistribuir`, en milésimos enteros, y la suma de los permisos los da
 * exactos.
 */

import type { AsignacionMedida } from "./cubicacion-reparto";
import { compararCodigos } from "./reparto-codigos";
import { sumarLineas, type LineaDelReparto, type PorDistribuir, type TotalesLinea } from "./reparto-por-distribuir";

export interface FilaSinMarcar extends LineaDelReparto {
  /** «1-03»; `null` mientras el registro de códigos no cargó. */
  codigo: string | null;
  /** Cómo se dice el permiso en pantalla. */
  permisoLabel: string;
}

export interface TablaSinMarcar {
  filas: FilaSinMarcar[];
  totales: TotalesLinea;
  porPermiso: { label: string; lineas: number; totales: TotalesLinea }[];
}

export const SIN_PERMISO = "Sin permiso declarado";

export function tablaSinMarcar(pd: PorDistribuir, codigoDe: (clave: string) => string | null | undefined): TablaSinMarcar {
  const filas = pd.lineas
    .map((l, i) => ({ ...l, codigo: codigoDe(l.clave) ?? null, permisoLabel: l.permiso ?? SIN_PERMISO, i }))
    .sort((a, b) => compararCodigos(a.codigo, b.codigo) || a.i - b.i)
    .map(({ i: _i, ...f }) => f);
  return {
    filas,
    totales: sumarLineas(pd.lineas),
    porPermiso: pd.porPermiso.map((p) => ({ label: p.label, lineas: p.lineas, totales: p.totales })),
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Un campo de CSV: con comillas si trae coma, comilla o salto. */
const campo = (v: string | number): string => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * El detalle de lo sin marcar, medida por medida, con su permiso y su código:
 * todo en un solo archivo y cada fila dice de qué permiso es. Cifras sin
 * separador de miles (se pegan en Excel), m³ con sus 3 decimales.
 */
export function csvSinMarcar(t: TablaSinMarcar): string {
  const cab = ["Código", "Permiso", "Bloque", "Especie", "Día", "Tipo", "Medida", "Piezas", "m³", "Pie tablar"];
  const cuerpo: string[] = [];
  for (const f of t.filas) {
    const base = [f.codigo ?? "", f.permisoLabel, f.etiqueta, f.especie || "Sin especie", f.dias > 1 ? f.dia : "", f.grupo.label];
    const medidas: Pick<AsignacionMedida, "medida" | "piezas" | "m3" | "pieTablar">[] = f.grupo.medidas.filter((m) => m.piezas > 0);
    if (medidas.length === 0) {
      cuerpo.push([...base, "", f.grupo.piezas, f.grupo.m3.toFixed(3), r2(f.grupo.pieTablar)].map(campo).join(","));
      continue;
    }
    for (const m of medidas) cuerpo.push([...base, m.medida, m.piezas, m.m3.toFixed(3), r2(m.pieTablar)].map(campo).join(","));
  }
  const total = ["Total", "", "", "", "", "", "", t.totales.piezas, t.totales.m3.toFixed(3), r2(t.totales.pt)].map(campo).join(",");
  return "﻿" + [cab.join(","), ...cuerpo, total].join("\n");
}
