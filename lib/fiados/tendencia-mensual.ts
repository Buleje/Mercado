/**
 * Tendencia de 12 meses de Me deben (fiados nuevos y cobros por mes), con el
 * mes de LIMA.
 *
 * Antes se agrupaba con `toISOString().slice(0, 7)`: un fiado anotado el
 * miércoles 30/09 a las 21:00 de Pucallpa (02:00 UTC del 01/10) caía en octubre,
 * y el cobro de las últimas 5 horas de cada mes se iba al mes siguiente
 * (auditoría 15-10, carril ventas p2). Ahora la clave es el mes de Lima.
 *
 * PURO: la ruta trae las filas de la base y esto sólo las reparte.
 */
import { limaDateKey, startOfLimaMonth } from "@/lib/utils";

export interface MesDeTendencia {
  /** `YYYY-MM` del mes de Lima. */
  mes: string;
  cobrados: number;
  nuevos: number;
}

type Fecha = Date | string | number;

/** `YYYY-MM` del mes de Lima en que cae el instante. */
export function mesDeLima(valor: Fecha): string {
  return limaDateKey(valor).slice(0, 7);
}

/** Desde cuándo leer: el 1.º del mes de Lima de hace 11 meses (12 meses con el actual). */
export function inicioDeLaTendencia(ahora: Date): Date {
  return new Date(startOfLimaMonth(-11, ahora));
}

const redondear = (n: number) => Math.round(n * 100) / 100;

export function tendenciaMensualFiados(
  ahora: Date,
  nuevos: ReadonlyArray<{ total: unknown; createdAt: Fecha }>,
  cobros: ReadonlyArray<{ monto: unknown; pagadoEn: Fecha | null }>,
): MesDeTendencia[] {
  const meses: MesDeTendencia[] = [];
  for (let i = 11; i >= 0; i--) {
    meses.push({ mes: mesDeLima(startOfLimaMonth(-i, ahora)), cobrados: 0, nuevos: 0 });
  }
  const porMes = new Map(meses.map((m) => [m.mes, m]));
  for (const f of nuevos) {
    const m = porMes.get(mesDeLima(f.createdAt));
    if (m) m.nuevos += Number(f.total) || 0;
  }
  for (const c of cobros) {
    if (!c.pagadoEn) continue;
    const m = porMes.get(mesDeLima(c.pagadoEn));
    if (m) m.cobrados += Number(c.monto) || 0;
  }
  for (const m of meses) {
    m.cobrados = redondear(m.cobrados);
    m.nuevos = redondear(m.nuevos);
  }
  return meses;
}
