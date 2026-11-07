/**
 * Arreglo de los resúmenes viejos del cron (PURO): hasta el 19-10 el cron de
 * `DailySummary` miraba la caja ABIERTA y guardaba esperado 0, contado vacío y
 * diferencia 0 en todos los días (1 496 filas de 13 negocios, desde el 07-04).
 * Se recalculan con el MISMO cuadre que usa hoy el cron (`cuadreDeCajas` +
 * `camposDeCajaDelResumen`): lo usa `scripts/recalcular-cierres-viejos.ts`.
 *
 * Un día sin cajas contadas queda como lo deja el cron (0 / vacío / 0): no hay
 * cambio. Un día que todavía no terminó (hoy en Lima) no se toca: sus cajas
 * siguen abiertas y lo completa el cron de mañana.
 */
import {
  camposDeCajaDelResumen,
  cuadreDeCajas,
  CUADRE_VACIO,
  diaDeCaja,
  type CajaCerradaDelDia,
  type CuadreDelDia,
} from "@/lib/caja/cierres-por-dia";

export interface CamposDeCaja {
  efectivoEsperado: number;
  efectivoContado: number | null;
  diferenciaCaja: number;
}

/** Una fila de `DailySummary` con sus campos de caja ya en número. */
export interface FilaDelResumen extends CamposDeCaja {
  id: string;
  tenantId: string;
  /** El día a medianoche UTC (así guarda `DailySummary.fecha`). */
  fecha: Date | string;
  creadoPor: string;
}

export interface CambioDelCierre {
  id: string;
  tenantId: string;
  /** `YYYY-MM-DD`, día de Lima. */
  dia: string;
  cajas: number;
  sinConteo: number;
  antes: CamposDeCaja;
  despues: CamposDeCaja;
}

/** Lo que dejó el cron viejo: sin cuadre. */
export const CAJA_SIN_CUADRE: CamposDeCaja = { efectivoEsperado: 0, efectivoContado: null, diferenciaCaja: 0 };

/** `DailySummary.fecha` es el día a medianoche UTC: su día es la fecha tal cual (`limaDateKey` daría el anterior). */
export function diaDelResumen(fecha: Date | string): string {
  return new Date(fecha).toISOString().slice(0, 10);
}

/** ¿Es una fila del cron viejo, sin cuadre? (lo único que este arreglo toca). */
export function esResumenViejoSinCuadre(f: Pick<FilaDelResumen, "creadoPor" | keyof CamposDeCaja>): boolean {
  return f.creadoPor === "cron" && f.efectivoEsperado === 0 && f.efectivoContado == null && f.diferenciaCaja === 0;
}

const iguales = (a: CamposDeCaja, b: CamposDeCaja) =>
  a.efectivoEsperado === b.efectivoEsperado && a.efectivoContado === b.efectivoContado && a.diferenciaCaja === b.diferenciaCaja;

/**
 * El cambio de UNA fila vieja con el cuadre de las cajas de su día, o null si
 * no hay nada que cambiar (no es del cron viejo, el día no terminó, o no hubo
 * cajas contadas: queda igual que como la deja el cron).
 * Ej.: main 28/09, 5 cajas (esperado 55, contado 0) → 55 / 0 / −55.
 */
export function cambioDelCierreViejo(fila: FilaDelResumen, cuadre: CuadreDelDia, hoy: string): CambioDelCierre | null {
  if (!esResumenViejoSinCuadre(fila)) return null;
  const dia = diaDelResumen(fila.fecha);
  if (dia >= hoy) return null;
  const antes: CamposDeCaja = {
    efectivoEsperado: fila.efectivoEsperado,
    efectivoContado: fila.efectivoContado,
    diferenciaCaja: fila.diferenciaCaja,
  };
  const despues = camposDeCajaDelResumen(cuadre);
  if (iguales(antes, despues)) return null;
  return { id: fila.id, tenantId: fila.tenantId, dia, cajas: cuadre.cajas, sinConteo: cuadre.sinConteo, antes, despues };
}

/** El cuadre de cada día de Lima de un grupo de cajas cerradas (el mismo de `cuadreDelDia`, día por día). */
export function cuadresPorDia(cajas: readonly CajaCerradaDelDia[]): Map<string, CuadreDelDia> {
  const porDia = new Map<string, CajaCerradaDelDia[]>();
  for (const c of cajas) {
    const dia = diaDeCaja(c);
    if (!dia) continue;
    porDia.set(dia, [...(porDia.get(dia) ?? []), c]);
  }
  return new Map([...porDia].map(([dia, del]) => [dia, cuadreDeCajas(del)]));
}

/** El cuadre del día, o el vacío si ese día no cerró ninguna caja. */
export function cuadreDe(cuadres: ReadonlyMap<string, CuadreDelDia>, dia: string): CuadreDelDia {
  return cuadres.get(dia) ?? CUADRE_VACIO;
}
