/**
 * El resumen por especie de una guía importada al Libro TH (Brandon 02-10-2026:
 * «un bloque de resumen por especie, eso falta»). De la LISTA de trozas sale
 * cuántas trozas, cuántos m³ y qué parte del volumen es cada especie; al lado va
 * lo que la guía DECLARA en su cuadro de productos (37), para ver de un vistazo
 * si los dos cuadran.
 *
 * Puro y sin React: lo usan la vista previa de «Importar guías despachadas» y el
 * modal «Datos» de una guía ya importada. Las especies se juntan con
 * `claveEspecie`, la misma vara del balance del plan: «Tornillo» y «TORNILLO
 * (Cedrelinga…)» son la misma.
 */

import { claveEspecie } from "./loth-constants";
import type { ProductoGtf } from "./serfor-gtf";

/**
 * 10 litros. La guía declara con tres decimales y redondea pieza por pieza: una
 * vara de punto flotante daría «no cuadra» por un 0,001 (regla
 * `verificacion-de-verdad` §4 — la tolerancia sale de cómo se mide la madera).
 */
export const TOLERANCIA_ESPECIE_M3 = 0.01;

export interface PiezaParaResumen {
  comun: string | null;
  cientifico: string | null;
  m3: number | null;
}

export interface FilaEspecie {
  clave: string;
  comun: string;
  cientifico: string | null;
  trozas: number;
  m3: number;
  /** Parte del volumen de la lista, de 0 a 100. */
  pct: number;
  /** m³ del cuadro (37) para esta especie: `null` si la guía no publica el cuadro. */
  declaradoM3: number | null;
  /** Lista − declarado, sólo cuando pasa la tolerancia; si cuadra, `null`. */
  diferenciaM3: number | null;
}

export interface ResumenEspecies {
  filas: FilaEspecie[];
  trozas: number;
  m3: number;
  /** Σ del cuadro (37); `null` si la guía no lo publica con volumen. */
  declaradoM3: number | null;
  /** Hay al menos una especie cuya lista no coincide con lo declarado. */
  descuadra: boolean;
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const txt = (v: string | null | undefined) => (v ?? "").trim();

export function resumenPorEspecie(
  piezas: readonly PiezaParaResumen[],
  productos: readonly ProductoGtf[] | null | undefined,
): ResumenEspecies {
  type Acum = { comun: string; cientifico: string; trozas: number; m3: number; declarado: number };
  const grupos = new Map<string, Acum>();
  const grupo = (comun: string, cientifico: string) => {
    const clave = claveEspecie(comun || cientifico) || "(sin especie)";
    let g = grupos.get(clave);
    if (!g) {
      g = {
        comun: comun || cientifico || "Sin especie",
        cientifico: "",
        trozas: 0,
        m3: 0,
        declarado: 0,
      };
      grupos.set(clave, g);
    }
    if (!g.cientifico && cientifico && cientifico !== g.comun) g.cientifico = cientifico;
    return g;
  };

  for (const p of piezas) {
    const g = grupo(txt(p.comun), txt(p.cientifico));
    g.trozas += 1;
    g.m3 += Number(p.m3) || 0;
  }
  const conVolumen = (productos ?? []).filter(
    (p) => p.volumen != null && Number.isFinite(p.volumen),
  );
  const conCuadro = conVolumen.length > 0;
  for (const p of conVolumen) grupo(txt(p.comun), txt(p.cientifico)).declarado += p.volumen ?? 0;

  const m3 = r4([...grupos.values()].reduce((a, g) => a + g.m3, 0));
  const filas: FilaEspecie[] = [...grupos.entries()].map(([clave, g]) => {
    const dif = g.m3 - g.declarado;
    return {
      clave,
      comun: g.comun,
      cientifico: g.cientifico || null,
      trozas: g.trozas,
      m3: r4(g.m3),
      pct: m3 > 0 ? (100 * g.m3) / m3 : 0,
      declaradoM3: conCuadro ? r4(g.declarado) : null,
      diferenciaM3: conCuadro && Math.abs(dif) > TOLERANCIA_ESPECIE_M3 ? r4(dif) : null,
    };
  });
  filas.sort(
    (a, b) =>
      b.m3 - a.m3 ||
      (b.declaradoM3 ?? 0) - (a.declaradoM3 ?? 0) ||
      a.comun.localeCompare(b.comun, "es"),
  );

  return {
    filas,
    trozas: piezas.length,
    m3,
    declaradoM3: conCuadro ? r4(conVolumen.reduce((a, p) => a + (p.volumen ?? 0), 0)) : null,
    descuadra: filas.some((f) => f.diferenciaM3 != null),
  };
}
