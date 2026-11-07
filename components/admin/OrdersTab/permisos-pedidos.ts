/**
 * Qué puede hacer con un pedido quien está logueado — espejo de las rutas
 * (17-10, tras `4cfd43e9f`): el almacenero sólo LEE pedidos y recibía un 403
 * al mover, cancelar, cobrar, anotar o borrar; el cajero, al borrar.
 *
 * No es el gate de seguridad (eso es `requireAdmin` en cada ruta): es para no
 * mostrar un botón que va a terminar en «No tienes permiso». Si cambia una
 * lista de roles en la ruta, cambia acá:
 *
 *   mover       PATCH /api/orders/[id] y POST /api/orders/bulk-status
 *               → cajero, tienda_owner (+ gestión: requireAdmin la deja pasar siempre)
 *   borrar      DELETE /api/orders/[id] → sólo gestión
 *   comprobante /api/admin/sunat/generate-invoice y /api/invoices/[orderId] → cajero
 *   guia        /api/guias-remision → almacenero
 *   notaCredito /api/notas-credito → sólo gestión
 *
 * Sin rol todavía (`/api/auth/me` no contestó) se muestra todo: el servidor
 * decide igual y así un dueño no ve los botones parpadear deshabilitados.
 */
import { createContext, useContext } from "react";
import type { AdminRole } from "@/lib/session";

/** admin, owner y manager: `requireAdmin` los deja pasar en toda ruta del panel. */
const GESTION: readonly AdminRole[] = ["admin", "owner", "manager"];

export interface PermisosPedidos {
  /** Cambiar estado, cancelar, cobrar, asignar repartidor, anotar (todo PATCH). */
  mover: boolean;
  borrar: boolean;
  /** Emitir boleta o factura y la boleta para imprimir. */
  comprobante: boolean;
  guia: boolean;
  notaCredito: boolean;
  /** Por qué no puede mover (null si puede): una línea para la pantalla. */
  explicacion: string | null;
}

export const TODOS_LOS_PERMISOS: PermisosPedidos = {
  mover: true,
  borrar: true,
  comprobante: true,
  guia: true,
  notaCredito: true,
  explicacion: null,
};

const entre = (rol: AdminRole, extra: readonly AdminRole[]) =>
  GESTION.includes(rol) || extra.includes(rol);

export function permisosDePedidos(rol: AdminRole | null): PermisosPedidos {
  if (!rol) return TODOS_LOS_PERMISOS;
  const mover = entre(rol, ["cajero", "tienda_owner"]);
  return {
    mover,
    borrar: entre(rol, []),
    comprobante: entre(rol, ["cajero"]),
    guia: entre(rol, ["almacenero"]),
    notaCredito: entre(rol, []),
    explicacion: mover
      ? null
      : "Con tu rol ves los pedidos, pero no los mueves: confirmar, cobrar, cancelar o anotar lo hace caja o el encargado.",
  };
}

/**
 * Lo pone `OrdersTab` arriba de todo; lo leen la tarjeta, el detalle y su pie
 * sin pasar la prop por cinco niveles. Fuera de Pedidos (sin proveedor) vale
 * todo, como antes.
 */
export const PermisosPedidosContext = createContext<PermisosPedidos>(TODOS_LOS_PERMISOS);

export function usePermisosPedidos(): PermisosPedidos {
  return useContext(PermisosPedidosContext);
}
