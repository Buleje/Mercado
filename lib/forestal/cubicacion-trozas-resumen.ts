/**
 * cubicacion-trozas-resumen — agrupa el patio de trozas (rolliza) por
 * especie, tipo (categoría de diámetro) o largo, y el cruce especie × tipo.
 * Hermano de `cubicacion-resumen.ts` (aserrada), pero la unidad de venta acá
 * es el m³ (SERFOR) — el pie tablar se muestra sólo como EQUIVALENTE
 * (`PT_POR_M3`), no como dato propio de la troza.
 */
import { PT_POR_M3 } from "./cubicacion";
import { ORDEN_TIPO_TROZA, tipoDeTroza, type TrozaCubicada, type TipoTroza } from "./cubicacion-trozas";

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
  /** % del m³ total del lote, un decimal. */
  pctM3: number;
}

export interface ResumenTrozas {
  grupos: GrupoTrozas[];
  total: { trozas: number; m3: number; pt: number };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

function claveDe(t: TrozaCubicada, dim: DimensionTrozas): { clave: string; label: string } {
  if (dim === "especie") {
    const e = t.especie?.trim();
    return { clave: e ? e.toLowerCase() : "sin-especie", label: e || "Sin especie" };
  }
  if (dim === "tipo") {
    const tp = tipoDeTroza(t);
    return { clave: tp, label: tp };
  }
  // largo: agrupa por el valor exacto (1 decimal — así lo dicta/tipea el patio).
  const l = Math.round(t.largo * 10) / 10;
  return { clave: String(l), label: `${l.toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m` };
}

/** Agrupa el lote de trozas por la dimensión pedida, con % del m³ total. */
export function agruparTrozasPor(rows: TrozaCubicada[], dim: DimensionTrozas): ResumenTrozas {
  const mapa = new Map<string, GrupoTrozas>();
  for (const t of rows) {
    const { clave, label } = claveDe(t, dim);
    const g = mapa.get(clave) ?? { clave, label, trozas: 0, m3: 0, pt: 0, pctM3: 0 };
    g.trozas += 1;
    g.m3 = r4(g.m3 + t.m3);
    mapa.set(clave, g);
  }
  const totalM3 = r4(rows.reduce((a, t) => a + t.m3, 0));
  const grupos = [...mapa.values()];
  for (const g of grupos) {
    g.pctM3 = totalM3 > 0 ? Math.round((g.m3 / totalM3) * 1000) / 10 : 0;
    g.pt = r2(g.m3 * PT_POR_M3);
  }

  if (dim === "especie") grupos.sort((a, b) => a.label.localeCompare(b.label, "es"));
  else if (dim === "tipo") {
    grupos.sort((a, b) => ORDEN_TIPO_TROZA.indexOf(a.label as TipoTroza) - ORDEN_TIPO_TROZA.indexOf(b.label as TipoTroza));
  } else grupos.sort((a, b) => Number(a.clave) - Number(b.clave));

  return { grupos, total: { trozas: rows.length, m3: totalM3, pt: r2(totalM3 * PT_POR_M3) } };
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
export function resumenTrozasPorEspecie(rows: TrozaCubicada[]): BloqueEspecieTrozas[] {
  const porEspecie = new Map<string, TrozaCubicada[]>();
  for (const t of rows) {
    const e = t.especie?.trim() || "Sin especie";
    const lista = porEspecie.get(e);
    if (lista) lista.push(t);
    else porEspecie.set(e, [t]);
  }
  const bloques = [...porEspecie.entries()].map(([especie, rs]) => {
    const g = agruparTrozasPor(rs, "tipo");
    return { especie, tipos: g.grupos, total: g.total };
  });
  bloques.sort((a, b) => b.total.m3 - a.total.m3 || a.especie.localeCompare(b.especie, "es"));
  return bloques;
}

/** CSV del agrupado (BOM + coma decimal como el resto de exports del módulo). */
export function resumenTrozasACsv(resumen: ResumenTrozas, dim: DimensionTrozas): string {
  const head = [ETIQUETA_DIMENSION_TROZAS[dim].replace("Por ", ""), "Trozas", "m3", "PT", "%m3"];
  const lineas = [head.join(",")];
  for (const g of resumen.grupos) lineas.push([g.label, g.trozas, g.m3.toFixed(4), g.pt.toFixed(2), g.pctM3.toFixed(1)].join(","));
  lineas.push(["TOTAL", resumen.total.trozas, resumen.total.m3.toFixed(4), resumen.total.pt.toFixed(2), "100.0"].join(","));
  return "﻿" + lineas.join("\n");
}
