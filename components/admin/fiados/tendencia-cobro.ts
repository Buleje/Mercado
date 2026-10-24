/**
 * Cuentas de «Me deben › Cobrado › Tendencia de cobro» (M38, 17-10). Sin React:
 * se prueban con vitest.
 *
 * Los meses llegan del servidor (`/api/analytics/fiado-analytics`, clave
 * «YYYY-MM» en UTC): lo cobrado son las cuotas pagadas ese mes y lo fiado,
 * los fiados creados ese mes. El neto es la resta de esas dos cifras.
 */

export type MesCobro = { mes: string; cobrados: number; nuevos: number; neto: number };

export type ComparativoCobro =
  | { tipo: "sin-anterior" }
  /** El mes pasado no cobraste nada: un «+0 %» o un «+∞ %» mentiría. */
  | { tipo: "sin-base"; mesAnterior: string }
  | { tipo: "pct"; mesAnterior: string; pct: number; diferencia: number };

/** Lo cobrado en `mes` contra el mes anterior de la serie. */
export function comparativoDeCobro(serie: MesCobro[], mes: string): ComparativoCobro {
  const i = serie.findIndex((m) => m.mes === mes);
  if (i <= 0) return { tipo: "sin-anterior" };
  const actual = serie[i];
  const previo = serie[i - 1];
  if (previo.cobrados <= 0) return { tipo: "sin-base", mesAnterior: previo.mes };
  const diferencia = actual.cobrados - previo.cobrados;
  return { tipo: "pct", mesAnterior: previo.mes, pct: (diferencia / previo.cobrados) * 100, diferencia };
}

/** Clave «YYYY-MM» de un momento, en el mismo calendario que la serie del servidor (UTC). */
export function claveMes(iso: string): string {
  return iso.slice(0, 7);
}
