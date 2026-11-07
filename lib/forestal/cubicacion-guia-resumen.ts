/**
 * cubicacion-guia-resumen — lo que Guardadas dice de la GTF (Cubicador, 24-10).
 * PURO: (1) las guardadas SIN GTF, y (2) el rendimiento de cada comunidad contra
 * las guías de troza que nombran sus guardadas.
 *
 * Rendimiento = Σ m³ aserrado ÷ Σ m³ de troza. El aserrado sale del PT
 * (÷ 424) y sólo cuenta las especies que trae cada guía (`cruzarConGuia`, igual
 * que el detalle de una cubicación). Cada GTF distinta suma su troza UNA vez
 * por comunidad aunque dos guardadas la nombren. La guía de madera aserrada
 * (salida) no es troza: no entra. Es un derivado, no la corrida real.
 */
import { PT_POR_M3 } from "./cubicacion";
import type { CubicacionRegistro } from "./cubicacion-registro";
import { claveNumeroGtf } from "./gtf-talonario";
import { cruzarConGuia, type VolumenDeGuia } from "./cubicacion-rendimiento-guia";
import { juzgarRendimiento } from "./loctp-catalogos";

/** Sin N° de guía escrito. */
export const sinGtf = (c: Pick<CubicacionRegistro, "gtfNumber">): boolean => !c.gtfNumber?.trim();

export function resumenSinGuia(lista: readonly CubicacionRegistro[]): { ids: string[]; cantidad: number; pieTablar: number } {
  const sin = lista.filter(sinGtf);
  return {
    ids: sin.map((c) => c.id),
    cantidad: sin.length,
    pieTablar: Math.round(sin.reduce((a, c) => a + c.totales.pieTablar, 0) * 100) / 100,
  };
}

/** Los N° de guía distintos (por su clave canónica) de la lista, tal como están escritos. */
export function numerosDeGuia(lista: readonly CubicacionRegistro[]): string[] {
  const vistos = new Map<string, string>();
  for (const c of lista) {
    const n = c.gtfNumber?.trim();
    const k = claveNumeroGtf(n);
    if (n && k && !vistos.has(k)) vistos.set(k, n);
  }
  return [...vistos.values()].sort();
}

export interface RendimientoDeFicha {
  /** % (1 decimal) o `null` si ninguna guardada de la fila tiene guía de troza leída. */
  pct: number | null;
  veredicto: ReturnType<typeof juzgarRendimiento>;
  m3Troza: number;
  m3Aserrado: number;
  guias: number;
}

/**
 * `claves`: cubicación → fila (de `clasificar`). `guias`: por `claveNumeroGtf`,
 * sólo las leídas y vigentes (una guía que no está en el mapa no cuenta).
 */
export function rendimientoPorFicha(
  lista: readonly CubicacionRegistro[],
  claves: ReadonlyMap<string, { clave: string }>,
  guias: ReadonlyMap<string, VolumenDeGuia>,
): Map<string, RendimientoDeFicha> {
  const acum = new Map<string, { troza: Map<string, number>; pt: number }>();
  for (const c of lista) {
    const fila = claves.get(c.id)?.clave;
    const kg = claveNumeroGtf(c.gtfNumber);
    const guia = kg ? guias.get(kg) : undefined;
    if (!fila || !kg || !guia || guia.tipo !== "trozas") continue;
    const a = acum.get(fila) ?? { troza: new Map<string, number>(), pt: 0 };
    a.troza.set(kg, guia.m3Total);
    a.pt += cruzarConGuia(guia, c.piezas, c.especie).total.pt;
    acum.set(fila, a);
  }
  const res = new Map<string, RendimientoDeFicha>();
  for (const [fila, a] of acum) {
    const m3Troza = [...a.troza.values()].reduce((s, v) => s + v, 0);
    const m3Aserrado = a.pt / PT_POR_M3;
    const pct = m3Troza > 0 ? Math.round((m3Aserrado / m3Troza) * 1000) / 10 : null;
    res.set(fila, { pct, veredicto: juzgarRendimiento(pct), m3Troza: Math.round(m3Troza * 1000) / 1000, m3Aserrado: Math.round(m3Aserrado * 1000) / 1000, guias: a.troza.size });
  }
  return res;
}
