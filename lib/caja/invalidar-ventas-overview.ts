/**
 * Invalida el Tablero de Ventas del tenant tras tocar la caja.
 *
 * `VentasOverviewDB.get` (`"use cache"`, ~2 min) guarda el saldo de la caja
 * abierta bajo el tag `ventas-overview-${tenantId}`. Sin esto, anotar un
 * ingreso/egreso o cambiar su medio dejaba el tablero con el saldo de antes
 * hasta 2 minutos.
 *
 * Por qué `revalidateTag` y no `invalidate(key)` de `lib/cache`: ése sólo vacía
 * el almacén en memoria del proceso; el `"use cache"` de Next vive en otro
 * lado y sólo se purga por tag. `{ expire: 0 }` = vence YA (el próximo GET del
 * tablero lee la base); con `"max"` serviría el dato viejo una vez más.
 *
 * Fuera de un request de Next (tests unitarios, scripts) `revalidateTag` lanza
 * «static generation store missing»: ahí no hay cache que purgar, y una
 * invalidación nunca debe romper la escritura de caja que ya se confirmó.
 */
import { revalidateTag } from "next/cache";

export const tagVentasOverview = (tenantId: string): string => `ventas-overview-${tenantId}`;

export function invalidarVentasOverview(tenantId: string): void {
  if (!tenantId) return;
  try {
    revalidateTag(tagVentasOverview(tenantId), { expire: 0 });
  } catch {
    /* fuera de contexto de request — no hay cache de Next que invalidar */
  }
}
