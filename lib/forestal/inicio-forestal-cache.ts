import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { leerInicioForestal, type OpcionesInicioForestal } from "./inicio-forestal-server";
import type { InicioForestal } from "./inicio-forestal";

/**
 * El resumen forestal del Inicio con el mismo caché que el resto del Inicio
 * (`AnalyticsDB.getDashboardAggregates`: 60 s). Es un tablero de lectura: un
 * minuto de atraso no cambia ninguna decisión y el libro de verdad se mira en
 * su pantalla, que lee fresco.
 *
 * Si alguna pieza obligatoria falla, el error sube y Next NO guarda la falla.
 */
export async function inicioForestalCacheado(
  tenantId: string,
  opciones: OpcionesInicioForestal,
): Promise<InicioForestal> {
  "use cache";
  cacheLife({ revalidate: 60, stale: 30, expire: 300 });
  cacheTag(`tenant:${tenantId}:forestal-inicio`);
  return leerInicioForestal(tenantId, opciones);
}
