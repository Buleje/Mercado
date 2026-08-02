/**
 * Lo que la planta pregunta de un lote: cuánto se armó, cuánto salió y cuánto
 * queda — en m³ y en pie tablar.
 *
 * Vive acá y no dentro del módulo porque el mismo cálculo lo va a querer el
 * export y el detalle: si cada uno sumara por su cuenta, la tarjeta de arriba y
 * la tabla de abajo podrían decir cifras distintas del mismo lote.
 *
 * El PT sale de `PT_POR_M3` (423.78), la MISMA constante del cubicador: la
 * conversión no se re-escribe por ahí, o dos pantallas convierten distinto.
 */

import { PT_POR_M3 } from "./cubicacion";
import type { MetaEspecie } from "./ctp-cadena-lote";

export interface LoteMedible {
  unit: string;
  /** Suma de las corridas que arman el lote. */
  totalCantidad: number;
  /** Lo que ya salió en despachos vivos. */
  despachado: number;
  /** `totalCantidad − despachado`, nunca negativo. */
  disponible: number;
  status?: string;
}

export interface ResumenLotes {
  /** Cuántos lotes entraron en la suma (los que miden en m³). */
  lotesEnM3: number;
  /** Lotes en otra unidad (kg, unidad, pt): NO se suman a los m³. */
  lotesOtraUnidad: number;
  armadoM3: number;
  despachadoM3: number;
  disponibleM3: number;
  armadoPt: number;
  despachadoPt: number;
  disponiblePt: number;
  /** despachado / armado, en PORCENTAJE. `null` si todavía no se armó nada. */
  avancePct: number | null;
}

const r4 = (n: number) => Number(n.toFixed(4));
const r1 = (n: number) => Number(n.toFixed(1));

/** m³ → pie tablar. Un valor no finito devuelve 0, no `NaN` en pantalla. */
export function enPieTablar(m3: number): number {
  return Number.isFinite(m3) ? r1(m3 * PT_POR_M3) : 0;
}

/**
 * Suma SÓLO los lotes que miden en m³.
 *
 * Un lote en kg y otro en m³ no se suman: el total sería un número sin unidad
 * que parece exacto. Los otros se cuentan aparte para poder decir "hay 3 lotes
 * más en otra unidad" en vez de esconderlos.
 *
 * Los anulados no cuentan: ese lote dejó de existir como acuerdo comercial.
 */
export function resumenLotes(lotes: ReadonlyArray<LoteMedible>): ResumenLotes {
  const vivos = lotes.filter((l) => l.status !== "anulado");
  const enM3 = vivos.filter((l) => l.unit === "m3");

  const armadoM3 = r4(enM3.reduce((a, l) => a + (Number(l.totalCantidad) || 0), 0));
  const despachadoM3 = r4(enM3.reduce((a, l) => a + (Number(l.despachado) || 0), 0));
  const disponibleM3 = r4(enM3.reduce((a, l) => a + (Number(l.disponible) || 0), 0));

  return {
    lotesEnM3: enM3.length,
    lotesOtraUnidad: vivos.length - enM3.length,
    armadoM3,
    despachadoM3,
    disponibleM3,
    armadoPt: enPieTablar(armadoM3),
    despachadoPt: enPieTablar(despachadoM3),
    disponiblePt: enPieTablar(disponibleM3),
    avancePct: armadoM3 > 0 ? Number(((despachadoM3 / armadoM3) * 100).toFixed(1)) : null,
  };
}

/**
 * Recorte de una página, con la página CLAMPEADA al rango que existe.
 *
 * Vive acá y no dentro de la tabla porque es donde se cometen los off-by-one, y
 * probarlo en el navegador exige tener más lotes que el tamaño de página — con
 * diez lotes y diez por página no hay segunda página que cruzar.
 *
 * Clampear en vez de devolver vacío: si el filtro achica la lista mientras se
 * está en la página 4, mostrar una tabla vacía se lee como "no hay resultados"
 * cuando en realidad hay, sólo que más arriba.
 */
export function paginar<T>(
  items: ReadonlyArray<T>,
  pagina: number,
  porPagina: number,
): { visibles: T[]; pagina: number; paginas: number; desde: number; hasta: number } {
  const tam = Math.max(1, Math.floor(porPagina) || 1);
  const paginas = Math.max(1, Math.ceil(items.length / tam));
  const actual = Math.min(Math.max(1, Math.floor(pagina) || 1), paginas);
  const desde = (actual - 1) * tam;
  const visibles = items.slice(desde, desde + tam);
  return {
    visibles,
    pagina: actual,
    paginas,
    // 1-indexado y humano: "1–10 de 47". Con la lista vacía, 0–0.
    desde: items.length === 0 ? 0 : desde + 1,
    hasta: Math.min(desde + tam, items.length),
  };
}

/**
 * La meta de rendimiento del lote: una sola fila a partir de las de cada especie.
 *
 * OJO con qué mide: es el rendimiento de las corridas ENTERAS que arman el lote,
 * no de la fracción que el lote se lleva. El consumo se atribuye a la corrida
 * completa (I2), así que cruzarlo contra una parte de lo producido daría un
 * rendimiento inventado — el mismo criterio que `calcularMetaEspecies`. La UI
 * tiene que decirlo o el número se lee como "rendimiento de este lote".
 *
 * `null` cuando no hay consumo atribuido: sin trozas no hay meta que exigir, y
 * un 0% afirmaría que la corrida no rindió nada.
 */
export interface MetaLote {
  trozasM3: number;
  metaM3: number;
  metaPt: number;
  producidoM3: number;
  producidoPt: number;
  /** meta − producido. Positivo = falta producir. */
  saldoM3: number;
  saldoPt: number;
  rendimientoPct: number | null;
  /** Alguna especie produjo en una unidad que no convierte: el saldo es parcial. */
  unidadesMezcladas: boolean;
  /** Cuántas especies entraron en la cuenta (para poder decir "2 especies"). */
  especies: number;
}

export function metaDeLote(metas: ReadonlyArray<MetaEspecie>): MetaLote | null {
  if (metas.length === 0) return null;
  const suma = (f: (m: MetaEspecie) => number) => r4(metas.reduce((a, m) => a + f(m), 0));

  const trozasM3 = suma((m) => m.trozasM3);
  if (trozasM3 <= 0) return null;

  const metaM3 = suma((m) => m.metaM3);
  const producidoM3 = suma((m) => m.producidoM3);
  return {
    trozasM3,
    metaM3,
    metaPt: enPieTablar(metaM3),
    producidoM3,
    producidoPt: enPieTablar(producidoM3),
    saldoM3: r4(metaM3 - producidoM3),
    saldoPt: enPieTablar(r4(metaM3 - producidoM3)),
    rendimientoPct: Number(((producidoM3 / trozasM3) * 100).toFixed(1)),
    unidadesMezcladas: metas.some((m) => m.unidadesMezcladas),
    especies: metas.length,
  };
}

/**
 * En qué punto está la salida de UN lote, para pintar la barra de avance.
 *
 * `completo` no se deriva de `disponible === 0` sino del estado: un lote puede
 * estar en 0 disponible porque todavía no se le cargó ninguna corrida.
 */
export function avanceDeLote(l: LoteMedible): {
  pct: number;
  completo: boolean;
  sinArmar: boolean;
} {
  const armado = Number(l.totalCantidad) || 0;
  if (armado <= 0) return { pct: 0, completo: false, sinArmar: true };
  const pct = Math.min(100, Math.max(0, ((Number(l.despachado) || 0) / armado) * 100));
  return { pct: Number(pct.toFixed(1)), completo: pct >= 99.95, sinArmar: false };
}
