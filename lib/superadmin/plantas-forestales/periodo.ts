/**
 * El período de «Plantas forestales» (17-10): por omisión el trimestre que
 * termina este mes, en días de Lima.
 *
 * Los bordes se pasan a instantes con la hora de Lima (-05:00), que es lo que
 * manda el libro de la planta: su navegador está en Lima y `resolveCtpPeriod`
 * arma el rango con la hora local. Con bordes en UTC el superadmin leería otro
 * período que la planta y los números no coincidirían.
 */
import { limaDateKey } from "@/lib/utils";
import type { PeriodoPlanta } from "./tipos";

const dia = (d: Date): string => d.toISOString().slice(0, 10);

/** Del día 1 de hace dos meses al último día del mes de `hoy` (AAAA-MM-DD de Lima). */
export function periodoPorDefecto(hoy: string = limaDateKey()): PeriodoPlanta {
  const [a, m] = hoy.split("-").map(Number);
  return {
    desde: dia(new Date(Date.UTC(a, m - 3, 1))),
    hasta: dia(new Date(Date.UTC(a, m, 0))),
  };
}

export type PeriodoResuelto = { ok: true; periodo: PeriodoPlanta } | { ok: false; error: string };

/** Un año (bisiesto incluido): más que eso es leer el libro entero de cada planta. */
export const MAX_DIAS_PERIODO = 366;

/** AAAA-MM-DD que existe en el calendario (`2026-99-99` o `2026-02-31` no). */
export function esDiaReal(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [a, m, d] = s.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/**
 * Completa lo que falte con el trimestre por omisión y rechaza una fecha que
 * no existe, un rango al revés y uno de más de {@link MAX_DIAS_PERIODO} días
 * (security 17-10: `2026-99-99` respondía 200 con todo gris).
 */
export function resolverPeriodo(
  q: { desde?: string; hasta?: string },
  hoy: string = limaDateKey(),
): PeriodoResuelto {
  const def = periodoPorDefecto(hoy);
  const desde = q.desde ?? def.desde;
  const hasta = q.hasta ?? def.hasta;
  if (!esDiaReal(desde) || !esDiaReal(hasta)) return { ok: false, error: "Esa fecha no existe: usa AAAA-MM-DD" };
  if (desde > hasta) return { ok: false, error: "La fecha «desde» es posterior a «hasta»" };
  const dias = (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000 + 1;
  if (dias > MAX_DIAS_PERIODO) return { ok: false, error: `El período puede ser de hasta ${MAX_DIAS_PERIODO} días` };
  return { ok: true, periodo: { desde, hasta } };
}

/** Los instantes que reciben las clases del libro: de 00:00 a 23:59:59.999 de Lima. */
export function rangoDelPeriodo(p: PeriodoPlanta): { fromDate: Date; toDate: Date } {
  return {
    fromDate: new Date(`${p.desde}T00:00:00.000-05:00`),
    toDate: new Date(`${p.hasta}T23:59:59.999-05:00`),
  };
}

/** Días enteros entre un instante y ahora (`null` si no hay instante). */
export function diasDesde(iso: string | null, ahora: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((ahora.getTime() - t) / 86_400_000));
}
