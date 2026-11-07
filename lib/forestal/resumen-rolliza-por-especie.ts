/**
 * Resumen de la Rolliza en patio ANTES de importarla (Brandon 19-10): por
 * especie, cuántas trozas, cuántos m³ y cuántos pt aserrables.
 *
 * pt aserrables = m³ × 56 % × 424. El 56 % es el rendimiento de referencia
 * SERFOR para aserrada (RDE D000259-2024) y 424 los pt por m³ de la plaza: es
 * una ESTIMACIÓN de lo que rendiría en tablas, no el volumen de la troza.
 *
 * Cuenta lo mismo que el envío: filas sin problemas y «En stock» (`estaEnStock`).
 */

import type { FilaParseada } from "./ctp-formatos-serfor";
import { estaEnStock, especieComunDe } from "./ctp-serfor-a-libro";
import { PT_POR_M3 } from "./cubicacion";
import { RENDIMIENTO_REF_ASERRADA } from "./ctp-rendimiento";
import { claveEspecie } from "./loth-constants";

export interface FilaResumenEspecie {
  especie: string;
  trozas: number;
  m3: number;
  ptAserrable: number;
}

export interface ResumenRolliza {
  filas: FilaResumenEspecie[];
  total: { trozas: number; m3: number; ptAserrable: number };
  /** Filas listas que el importador descarta por no estar en stock. */
  fueraDeStock: number;
}

/** m³ → diezmilésimas enteras (Decimal 12,4): sumar enteros no deriva. */
const aDiezmilesimas = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n * 10_000) : 0;
};

export const ptAserrableDe = (m3Diezmilesimas: number): number =>
  Math.round(((m3Diezmilesimas / 10_000) * RENDIMIENTO_REF_ASERRADA * PT_POR_M3) / 100);

export function resumirRollizaPorEspecie(filas: readonly FilaParseada[]): ResumenRolliza {
  const grupos = new Map<string, { grafias: Map<string, number>; trozas: number; dm: number }>();
  let fueraDeStock = 0;

  for (const f of filas) {
    if (f.problemas.length > 0) continue;
    if (!estaEnStock(f)) {
      fueraDeStock += 1;
      continue;
    }
    const nombre = especieComunDe(f.datos.especie);
    const clave = claveEspecie(nombre) || "sin especie";
    const g = grupos.get(clave) ?? { grafias: new Map(), trozas: 0, dm: 0 };
    g.grafias.set(nombre, (g.grafias.get(nombre) ?? 0) + 1);
    g.trozas += 1;
    g.dm += aDiezmilesimas(f.datos.volumenM3);
    grupos.set(clave, g);
  }

  const lista = [...grupos.values()].map((g) => ({
    /* La grafía más común del archivo; en empate, la primera que apareció. */
    especie: [...g.grafias.entries()].sort((a, b) => b[1] - a[1])[0][0],
    trozas: g.trozas,
    dm: g.dm,
  }));
  lista.sort((a, b) => b.dm - a.dm || a.especie.localeCompare(b.especie, "es"));

  const dmTotal = lista.reduce((s, e) => s + e.dm, 0);
  return {
    filas: lista.map((e) => ({
      especie: e.especie,
      trozas: e.trozas,
      m3: e.dm / 10_000,
      ptAserrable: ptAserrableDe(e.dm),
    })),
    total: {
      trozas: lista.reduce((s, e) => s + e.trozas, 0),
      m3: dmTotal / 10_000,
      ptAserrable: ptAserrableDe(dmTotal),
    },
    fueraDeStock,
  };
}
