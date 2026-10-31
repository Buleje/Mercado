/**
 * Quién mueve puntos de un cliente A MANO (sin compra detrás), 11-10.
 *
 * Sumar puntos a mano es plata: cada 100 puntos son un descuento en la caja.
 * Antes `PATCH /api/loyalty/[phone]` llamaba `requireAdmin(req)` sin roles
 * (cualquier rol del panel, cajero y almacenero incluidos) y
 * `POST /api/marketplace/loyalty` dejaba al cajero el `earn`: un cajero podía
 * sumarle puntos a un conocido y cobrárselos como descuento.
 *
 *  · Sumar a mano → sólo admin, dueño y encargado (el management tier que
 *    `requireAdmin` deja pasar siempre).
 *  · Canjear (restar) → en `PATCH /api/loyalty/[phone]` también gestión (su
 *    única pantalla es Campañas › Puntos); el canje en mostrador va por el
 *    pedido/venta (`lib/pricing/canje-puntos.ts`), no por estas rutas.
 *  · `POST /api/loyalty/auto-earn` se borró el mismo día: aceptaba al cajero y
 *    creía el `orderTotal` que mandaba el navegador (5.000 puntos con un total
 *    inventado). Los puntos por compra los acredita el servidor al entregar el
 *    pedido (`app/api/orders/[id]/route.ts` → `lib/loyalty/auto-earn.ts`).
 */
import type { AdminRole } from "@/lib/session";

/** Pasar a `requireAdmin`: con "admin" entra el management tier (admin, owner, manager) y nadie más. */
export const ROLES_AJUSTE_PUNTOS: readonly AdminRole[] = ["admin"];

const SUMAN_A_MANO: readonly string[] = ["admin", "owner", "manager"];

export function puedeSumarPuntosAMano(rol: string): boolean {
  return SUMAN_A_MANO.includes(rol);
}

export const MENSAJE_SOLO_DUENO = "Sólo el dueño o el encargado suman puntos a mano.";
