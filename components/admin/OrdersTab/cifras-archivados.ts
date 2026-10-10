/**
 * Las cifras de Archivados, sin React: de los entregados y cancelados que se
 * ven (ya filtrados por cliente y fechas) cuántos se entregaron, cuánto
 * suman, el ticket promedio y cuántos se cayeron.
 *
 * Son vista previa: el total de cada pedido viene del servidor y acá sólo se
 * suma lo que está en pantalla. Se prueba en `__tests__/cifras-archivados.test.ts`.
 */
import type { DbOrder } from "@/lib/jsondb";

export interface CifrasArchivados {
  entregados: number;
  /** Suma de los entregados. */
  vendido: number;
  /** `vendido / entregados`; `null` si no hay entregados (un «S/ 0» de relleno se lee como dato). */
  ticket: number | null;
  cancelados: number;
  /** Suma de lo que traían los cancelados: lo que no se concretó. */
  perdido: number;
  /** % de cancelados sobre todos los que se ven, entero; `null` sin pedidos. */
  tasaCancelados: number | null;
}

export function cifrasDeArchivados(pedidos: readonly Pick<DbOrder, "status" | "total">[]): CifrasArchivados {
  let entregados = 0;
  let vendido = 0;
  let cancelados = 0;
  let perdido = 0;
  for (const o of pedidos) {
    const total = Number(o.total) || 0;
    if (o.status === "entregado") {
      entregados += 1;
      vendido += total;
    } else if (o.status === "cancelado") {
      cancelados += 1;
      perdido += total;
    }
  }
  const n = entregados + cancelados;
  return {
    entregados,
    vendido,
    ticket: entregados > 0 ? vendido / entregados : null,
    cancelados,
    perdido,
    tasaCancelados: n > 0 ? Math.round((cancelados / n) * 100) : null,
  };
}
