/**
 * Los papeles que salen de un pedido, con el pedido ya puesto (17-10):
 *
 *   Emitir comprobante  /admin?tab=facturacion&vista=facturas&emitir=<id>
 *                       (`EInvoiceTab` lo abre con el pedido elegido)
 *   Guía de remisión    /admin?tab=guias-remision&guia=<id>
 *                       (`GuiasRemisionVista`: la ventana de 5 etapas precargada)
 *
 * Antes, desde el pedido sólo había «Hacer guía» sin el pedido (había que
 * buscarlo de nuevo allá) y ningún camino a emitir. Cada uno aparece si el rol
 * lo puede hacer (`permisos-pedidos.ts`: la guía es del almacenero, el
 * comprobante del cajero) y nunca para un pedido cancelado.
 */
import { FileText, Truck } from "@buleje/design-system/icons";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import type { DbOrder } from "@/lib/jsondb";
import type { PermisosPedidos } from "./permisos-pedidos";

export const enlaceEmitir = (id: string) =>
  `/admin?tab=facturacion&vista=facturas&emitir=${encodeURIComponent(id)}`;

export const enlaceGuia = (id: string) =>
  `/admin?tab=guias-remision&guia=${encodeURIComponent(id)}`;

export function accesosDelPedido(
  order: Pick<DbOrder, "id" | "status">,
  permisos: Pick<PermisosPedidos, "comprobante" | "guia">,
): MenuAccion[] {
  if (order.status === "cancelado") return [];
  const n = `#${order.id.slice(-6)}`;
  return [
    ...(permisos.comprobante
      ? [
          {
            id: "emitir",
            label: "Emitir comprobante",
            hint: `Boleta o factura del pedido ${n}`,
            icon: FileText,
            seccion: "Papeles",
            onSelect: () => void irAEnlace(enlaceEmitir(order.id)),
          },
        ]
      : []),
    ...(permisos.guia
      ? [
          {
            id: "guia",
            label: "Guía de remisión",
            hint: `Con el cliente y los productos de ${n}`,
            icon: Truck,
            seccion: "Papeles",
            onSelect: () => void irAEnlace(enlaceGuia(order.id)),
          },
        ]
      : []),
  ];
}
