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

/** Completa lo que falte con el trimestre por omisión y rechaza un rango al revés. */
export function resolverPeriodo(
  q: { desde?: string; hasta?: string },
  hoy: string = limaDateKey(),
): PeriodoResuelto {
  const def = periodoPorDefecto(hoy);
  const desde = q.desde ?? def.desde;
  const hasta = q.hasta ?? def.hasta;
  if (desde > hasta) return { ok: false, error: "La fecha «desde» es posterior a «hasta»" };
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
