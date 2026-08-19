/**
 * cubicacion-resumen — agrupa el lote cubicado por distintas dimensiones para
 * leerlo y liquidarlo de varias formas: por especie, por largo, por sección
 * (espesor×ancho, que es como se pide la madera), por medida completa, etc.
 *
 * PURO y client-safe: recibe las piezas y devuelve los grupos con sus totales
 * y el porcentaje sobre el total del lote. No toca el DOM.
 */

import type { PiezaCubicada, Unidad } from "./cubicacion";
import { tipoDePieza } from "./cubicacion-tipo";

/** Cómo se puede agrupar el lote. El orden es el de los chips en la UI. */
export const DIMENSIONES_RESUMEN = [
  "especie", "tipo", "largo", "seccion", "medida", "espesor", "ancho",
] as const;
export type DimensionResumen = (typeof DIMENSIONES_RESUMEN)[number];

export const ETIQUETA_DIMENSION: Record<DimensionResumen, string> = {
  especie: "Por especie",
  tipo: "Por tipo",
  largo: "Por largo",
  seccion: "Por sección (esp × anc)",
  medida: "Por medida",
  espesor: "Por espesor",
  ancho: "Por ancho",
};

export interface GrupoResumen {
  /** Identidad estable del grupo (clave del Map). */
  clave: string;
  /** Texto que se muestra ("Tornillo", "10 pies", "2×8 pulg"). */
  label: string;
  cantidad: number;
  pieTablar: number;
  m3: number;
  valor: number;
  /** Porcentaje del pie tablar del grupo sobre el total del lote (0–100). */
  pctPt: number;
}

export interface ResumenLote {
  grupos: GrupoResumen[];
  total: { cantidad: number; pieTablar: number; m3: number; valor: number };
}

/**
 * Precio por pie tablar. Un número aplica a todo el lote; una función resuelve
 * el precio por pieza (para precio por especie: Tornillo ≠ Cedro ≠ Caoba).
 */
export type PrecioPt = number | ((r: PiezaCubicada) => number);

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Abrevia la unidad como se lee en el patio. */
const uCorta = (u: Unidad): string => (u === "pulg" ? '"' : u === "pies" ? " pies" : ` ${u}`);

/**
 * Clave + etiqueta de una pieza según la dimensión elegida.
 *
 * Exportada para que la distribución de rolliza agrupe con EXACTAMENTE el mismo
 * criterio que los resúmenes: si cada uno arma sus grupos por su cuenta, las
 * dos pantallas muestran el mismo lote partido de dos formas distintas.
 */
export function claveYLabel(r: PiezaCubicada, dim: DimensionResumen): { clave: string; label: string } {
  switch (dim) {
    case "especie": {
      const e = r.especie?.trim() || "Sin especie";
      return { clave: e.toLowerCase(), label: e };
    }
    case "tipo": {
      const t = tipoDePieza(r);
      return { clave: t, label: t };
    }
    case "largo":
      return { clave: `${r.largo}${r.uLargo}`, label: `${r.largo}${uCorta(r.uLargo)}` };
    case "espesor":
      return { clave: `${r.espesor}${r.uEspesor}`, label: `${r.espesor}${uCorta(r.uEspesor)}` };
    case "ancho":
      return { clave: `${r.ancho}${r.uAncho}`, label: `${r.ancho}${uCorta(r.uAncho)}` };
    case "seccion":
      return {
        clave: `${r.espesor}${r.uEspesor}x${r.ancho}${r.uAncho}`,
        label: `${r.espesor}×${r.ancho}${uCorta(r.uEspesor)}`,
      };
    case "medida":
      return {
        clave: `${r.espesor}${r.uEspesor}x${r.ancho}${r.uAncho}x${r.largo}${r.uLargo}${r.especie ?? ""}`,
        label: `${r.espesor}×${r.ancho}×${r.largo}${r.especie ? ` · ${r.especie}` : ""}`,
      };
  }
}

/**
 * Agrupa las piezas por la dimensión pedida. Los grupos salen ordenados por
 * pie tablar descendente (lo que más pesa en el lote, arriba); el porcentaje
 * es sobre el pie tablar total.
 */
export function agruparPor(rows: PiezaCubicada[], dim: DimensionResumen, precio: PrecioPt = 0): ResumenLote {
  const precioDe = typeof precio === "function" ? precio : () => precio;
  const map = new Map<string, GrupoResumen>();
  let totalPt = 0, totalM3 = 0, totalCant = 0, totalValor = 0;

  for (const r of rows) {
    const { clave, label } = claveYLabel(r, dim);
    const g = map.get(clave) ?? { clave, label, cantidad: 0, pieTablar: 0, m3: 0, valor: 0, pctPt: 0 };
    const valorPieza = r.pieTablar * precioDe(r);
    g.cantidad += r.cantidad;
    g.pieTablar += r.pieTablar;
    g.m3 += r.m3;
    g.valor += valorPieza;
    map.set(clave, g);
    totalPt += r.pieTablar;
    totalM3 += r.m3;
    totalCant += r.cantidad;
    totalValor += valorPieza;
  }

  const grupos = [...map.values()].map((g) => ({
    ...g,
    pieTablar: r2(g.pieTablar),
    m3: r4(g.m3),
    valor: r2(g.valor),
    pctPt: totalPt > 0 ? Math.round((g.pieTablar / totalPt) * 1000) / 10 : 0,
  }));
  grupos.sort((a, b) => b.pieTablar - a.pieTablar || a.label.localeCompare(b.label));

  return {
    grupos,
    total: { cantidad: totalCant, pieTablar: r2(totalPt), m3: r4(totalM3), valor: r2(totalValor) },
  };
}

export interface BloqueEspecie {
  especie: string;
  /** Desglose por tipo comercial dentro de la especie (ordenado por PT). */
  tipos: GrupoResumen[];
  total: { cantidad: number; pieTablar: number; m3: number; valor: number };
}

/**
 * Reporte cruzado especie × tipo: una entrada por especie con su desglose por
 * tipo comercial. Para leer "el Tornillo: cuánto comercial, cuánta paquetería…".
 * Reusa agruparPor("tipo") sobre las filas de cada especie.
 */
export function resumenPorEspecie(rows: PiezaCubicada[], precio: PrecioPt = 0): BloqueEspecie[] {
  const porEspecie = new Map<string, PiezaCubicada[]>();
  for (const r of rows) {
    const e = r.especie?.trim() || "Sin especie";
    const lista = porEspecie.get(e);
    if (lista) lista.push(r);
    else porEspecie.set(e, [r]);
  }
  const bloques = [...porEspecie.entries()].map(([especie, rs]) => {
    const g = agruparPor(rs, "tipo", precio);
    return { especie, tipos: g.grupos, total: g.total };
  });
  bloques.sort((a, b) => b.total.pieTablar - a.total.pieTablar || a.especie.localeCompare(b.especie));
  return bloques;
}

/** CSV del resumen agrupado (para el contador o el cliente). */
export function resumenACsv(resumen: ResumenLote, dim: DimensionResumen, conValor: boolean): string {
  const cab = [ETIQUETA_DIMENSION[dim].replace("Por ", ""), "Piezas", "PieTablar", "m3", "%", ...(conValor ? ["ValorS/"] : [])];
  const filas = resumen.grupos.map((g) =>
    [g.label, g.cantidad, g.pieTablar.toFixed(2), g.m3.toFixed(4), g.pctPt.toFixed(1), ...(conValor ? [g.valor.toFixed(2)] : [])].join(","));
  const total = ["TOTAL", resumen.total.cantidad, resumen.total.pieTablar.toFixed(2), resumen.total.m3.toFixed(4), "100.0", ...(conValor ? [resumen.total.valor.toFixed(2)] : [])].join(",");
  return "﻿" + [cab.join(","), ...filas, total].join("\n");
}
