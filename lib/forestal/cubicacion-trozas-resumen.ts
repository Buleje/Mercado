/**
 * cubicacion-trozas-resumen — agrupa el patio de trozas (rolliza) por
 * especie, tipo (categoría de diámetro) o largo, y el cruce especie × tipo.
 * Hermano de `cubicacion-resumen.ts` (aserrada). En el lote Smalian la unidad
 * es el m³ (SERFOR) y el pie tablar se muestra sólo como EQUIVALENTE
 * (`PT_POR_M3`). En el lote Oxapampina (`formula = "oxapampina"`) el dato es el
 * PT propio de cada troza: `m3` va en 0 y `pctM3` es la participación en PT.
 */
import { PT_POR_M3 } from "./cubicacion";
import { ORDEN_TIPO_TROZA, type TrozaCubicada, type TipoTroza } from "./cubicacion-trozas";
import { tipoDeTrozaSegun, volumenDe, type FormulaTrozas } from "./cubicacion-trozas-formula";

export type DimensionTrozas = "especie" | "tipo" | "largo";
export const DIMENSIONES_TROZAS: readonly DimensionTrozas[] = ["especie", "tipo", "largo"];
export const ETIQUETA_DIMENSION_TROZAS: Record<DimensionTrozas, string> = {
  especie: "Por especie",
  tipo: "Por tipo (diámetro)",
  largo: "Por largo",
};

export interface GrupoTrozas {
  clave: string;
  label: string;
  trozas: number;
  m3: number;
  /** Equivalente en pie tablar (`m3 * PT_POR_M3`) — referencia, no dato propio de la troza. */
  pt: number;
  /** % del volumen total del lote (m³ en Smalian, PT en Oxapampina), un decimal. */
  pctM3: number;
}

export interface ResumenTrozas {
  grupos: GrupoTrozas[];
  total: { trozas: number; m3: number; pt: number };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

function claveDe(t: TrozaCubicada, dim: DimensionTrozas, formula: FormulaTrozas): { clave: string; label: string } {
  if (dim === "especie") {
    const e = t.especie?.trim();
    return { clave: e ? e.toLowerCase() : "sin-especie", label: e || "Sin especie" };
  }
  if (dim === "tipo") {
    const tp = tipoDeTrozaSegun(t, formula);
    return { clave: tp, label: tp };
  }
  // largo: agrupa por el valor exacto (1 decimal — así lo dicta/tipea el patio).
  const l = Math.round(t.largo * 10) / 10;
  const unidad = formula === "oxapampina" ? "pies" : "m";
  return { clave: String(l), label: `${l.toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${unidad}` };
}

/** Agrupa el lote de trozas por la dimensión pedida, con % del volumen total. */
export function agruparTrozasPor(rows: TrozaCubicada[], dim: DimensionTrozas, formula: FormulaTrozas = "smalian"): ResumenTrozas {
  const ox = formula === "oxapampina";
  const mapa = new Map<string, GrupoTrozas>();
  for (const t of rows) {
    const { clave, label } = claveDe(t, dim, formula);
    const g = mapa.get(clave) ?? { clave, label, trozas: 0, m3: 0, pt: 0, pctM3: 0 };
    g.trozas += 1;
    if (ox) g.pt = r2(g.pt + volumenDe(t, formula));
    else g.m3 = r4(g.m3 + t.m3);
    mapa.set(clave, g);
  }
  const totalM3 = ox ? 0 : r4(rows.reduce((a, t) => a + t.m3, 0));
  const totalPt = ox ? r2(rows.reduce((a, t) => a + volumenDe(t, formula), 0)) : r2(totalM3 * PT_POR_M3);
  const grupos = [...mapa.values()];
  for (const g of grupos) {
    if (ox) g.pctM3 = totalPt > 0 ? Math.round((g.pt / totalPt) * 1000) / 10 : 0;
    else {
      g.pctM3 = totalM3 > 0 ? Math.round((g.m3 / totalM3) * 1000) / 10 : 0;
      g.pt = r2(g.m3 * PT_POR_M3);
    }
  }

  if (dim === "especie") grupos.sort((a, b) => a.label.localeCompare(b.label, "es"));
  else if (dim === "tipo") {
    grupos.sort((a, b) => ORDEN_TIPO_TROZA.indexOf(a.label as TipoTroza) - ORDEN_TIPO_TROZA.indexOf(b.label as TipoTroza));
  } else grupos.sort((a, b) => Number(a.clave) - Number(b.clave));

  return { grupos, total: { trozas: rows.length, m3: totalM3, pt: totalPt } };
}

export interface BloqueEspecieTrozas {
  especie: string;
  /** Desglose por categoría de diámetro dentro de la especie. */
  tipos: GrupoTrozas[];
  total: { trozas: number; m3: number; pt: number };
}

/**
 * Reporte cruzado especie × tipo: una entrada por especie con su desglose
 * por categoría de diámetro — mismo patrón que `resumenPorEspecie` de la
 * aserrada (`cubicacion-resumen.ts`), para leer "el Cedro: cuánto delgado,
 * cuánto grueso…" sin mezclar especies distintas.
 */
export function resumenTrozasPorEspecie(rows: TrozaCubicada[], formula: FormulaTrozas = "smalian"): BloqueEspecieTrozas[] {
  const porEspecie = new Map<string, TrozaCubicada[]>();
  for (const t of rows) {
    const e = t.especie?.trim() || "Sin especie";
    const lista = porEspecie.get(e);
    if (lista) lista.push(t);
    else porEspecie.set(e, [t]);
  }
  const bloques = [...porEspecie.entries()].map(([especie, rs]) => {
    const g = agruparTrozasPor(rs, "tipo", formula);
    return { especie, tipos: g.grupos, total: g.total };
  });
  const vol = (b: BloqueEspecieTrozas) => (formula === "oxapampina" ? b.total.pt : b.total.m3);
  bloques.sort((a, b) => vol(b) - vol(a) || a.especie.localeCompare(b.especie, "es"));
  return bloques;
}

/** CSV del agrupado (BOM + coma decimal como el resto de exports del módulo).
 *  En Oxapampina, sin m³: Trozas · PT · %PT. */
export function resumenTrozasACsv(resumen: ResumenTrozas, dim: DimensionTrozas, formula: FormulaTrozas = "smalian"): string {
  const nombre = ETIQUETA_DIMENSION_TROZAS[dim].replace("Por ", "");
  if (formula === "oxapampina") {
    const filas = [[nombre, "Trozas", "PT", "%PT"].join(",")];
    for (const g of resumen.grupos) filas.push([g.label, g.trozas, g.pt.toFixed(2), g.pctM3.toFixed(1)].join(","));
    filas.push(["TOTAL", resumen.total.trozas, resumen.total.pt.toFixed(2), "100.0"].join(","));
    return "\uFEFF" + filas.join("\n");
  }
  const head = [nombre, "Trozas", "m3", "PT", "%m3"];
  const lineas = [head.join(",")];
  for (const g of resumen.grupos) lineas.push([g.label, g.trozas, g.m3.toFixed(4), g.pt.toFixed(2), g.pctM3.toFixed(1)].join(","));
  lineas.push(["TOTAL", resumen.total.trozas, resumen.total.m3.toFixed(4), resumen.total.pt.toFixed(2), "100.0"].join(","));
  return "﻿" + lineas.join("\n");
}
