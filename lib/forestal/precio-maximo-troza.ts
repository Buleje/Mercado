/**
 * precio-maximo-troza — ¿cuánto puedo pagar como MÁXIMO por 1 m³ de rollo?
 * PURO y client-safe (sin Prisma ni React): la pantalla lo puede correr para
 * previsualizar mientras el usuario escribe; el número que vale lo da la ruta.
 *
 *   PT por m³      = rendimiento × 424          (56 % → 237,44 PT)
 *   venta bruta    = PT por m³ × S/ por PT      (237,44 × 5,90 = S/ 1.400,90)
 *   precio máximo  = venta bruta − aserrío − flete − venta bruta × margen %
 *
 * El rendimiento es el MEDIDO de la especie si hay corridas suficientes y el
 * número es creíble (40-75 %, la franja del libro); si no, el 56 % de la regla
 * (`RENDIMIENTO_META`, el mismo de `pieTablarRolloDe`). Siempre se dice cuál.
 * Sin precio de venta no se inventa: el máximo queda en null.
 */
import { PT_POR_M3 } from "./cubicacion";
import { RENDIMIENTO_META, RENDIMIENTO_PLAUSIBLE_MAX, RENDIMIENTO_PLAUSIBLE_MIN } from "./loctp-catalogos";
import type { CostoNoIngresado, FuenteRendimiento } from "./precio-troza-tipos";

/** Desde cuántas corridas terminadas el rendimiento medido manda sobre la regla. */
export const MIN_CORRIDAS_MEDIDO = 3;
/** La regla, en porcentaje (56). */
export const RENDIMIENTO_REGLA_PCT = Math.round(RENDIMIENTO_META * 1000) / 10;

const r1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface CorridaMedida {
  m3Entrada: number;
  m3Salida: number;
}

export interface RendimientoParaPrecio {
  pct: number;
  fuente: FuenteRendimiento;
  corridas: number;
  medidoPct: number | null;
  motivo: string;
}

/** El rendimiento con que se calcula el precio: el medido (ponderado por m³) o el de la regla. */
export function rendimientoParaPrecio(corridas: readonly CorridaMedida[]): RendimientoParaPrecio {
  /* Sin aserrado anotado no enseña (como `ponderado` de rendimiento-especie): 0 PT hundía el medido. */
  const validas = corridas.filter((c) => c.m3Entrada > 0 && c.m3Salida > 0);
  const entrada = validas.reduce((a, c) => a + c.m3Entrada, 0);
  const salida = validas.reduce((a, c) => a + c.m3Salida, 0);
  const medidoPct = entrada > 0 ? r1((salida / entrada) * 100) : null;
  const n = validas.length;
  const regla = (motivo: string): RendimientoParaPrecio => ({ pct: RENDIMIENTO_REGLA_PCT, fuente: "regla_56", corridas: n, medidoPct, motivo });
  if (medidoPct == null) return regla("Sin corridas terminadas: se usa la regla del 56 %");
  if (n < MIN_CORRIDAS_MEDIDO) {
    return regla(`${n} corrida${n === 1 ? "" : "s"} (medido ${medidoPct} %): pocas, se usa la regla del 56 %`);
  }
  if (medidoPct < RENDIMIENTO_PLAUSIBLE_MIN || medidoPct > RENDIMIENTO_PLAUSIBLE_MAX) {
    return regla(
      `Medido ${medidoPct} % en ${n} corridas, fuera de lo creíble (${RENDIMIENTO_PLAUSIBLE_MIN}-${RENDIMIENTO_PLAUSIBLE_MAX} %): se usa la regla del 56 %`,
    );
  }
  return { pct: medidoPct, fuente: "medido", corridas: n, medidoPct, motivo: `Medido en ${n} corridas terminadas` };
}

export interface EntradaPrecioMaximo {
  /** En PORCENTAJE (56), no fracción. */
  rendimientoPct: number;
  precioVentaPt: number | null;
  /** S/ por m³ de rollo; null = no se ingresó. */
  aserrioM3: number | null;
  fleteM3: number | null;
  /** % sobre la venta bruta; null = no se ingresó. */
  margenPct: number | null;
}

export interface DesglosePrecioMaximo {
  ptPorM3: number;
  ventaBrutaM3: number | null;
  aserrioM3: number;
  fleteM3: number;
  margenPct: number;
  margenM3: number | null;
  precioMaximoM3: number | null;
  costosNoIngresados: CostoNoIngresado[];
}

const positivo = (v: number | null): number | null => (v != null && Number.isFinite(v) && v >= 0 ? v : null);

export function precioMaximoTroza(e: EntradaPrecioMaximo): DesglosePrecioMaximo {
  const ptPorM3 = r2((e.rendimientoPct / 100) * PT_POR_M3);
  const precio = positivo(e.precioVentaPt);
  const aserrio = positivo(e.aserrioM3);
  const flete = positivo(e.fleteM3);
  const margen = positivo(e.margenPct);
  const costosNoIngresados: CostoNoIngresado[] = [];
  if (aserrio == null) costosNoIngresados.push("aserrio");
  if (flete == null) costosNoIngresados.push("flete");
  if (margen == null) costosNoIngresados.push("margen");

  /* Sin precio de venta (o en 0) no hay máximo: un 0 fingiría que la madera no vale nada. */
  const bruta = precio != null && precio > 0 ? ptPorM3 * precio : null;
  const margenM3 = bruta != null ? (bruta * (margen ?? 0)) / 100 : null;
  return {
    ptPorM3,
    ventaBrutaM3: bruta != null ? r2(bruta) : null,
    aserrioM3: r2(aserrio ?? 0),
    fleteM3: r2(flete ?? 0),
    margenPct: margen ?? 0,
    margenM3: margenM3 != null ? r2(margenM3) : null,
    precioMaximoM3: bruta != null && margenM3 != null ? r2(bruta - (aserrio ?? 0) - (flete ?? 0) - margenM3) : null,
    costosNoIngresados,
  };
}
