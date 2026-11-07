/**
 * El pie del detalle del pedido: rechazar y los papeles del pedido (comanda,
 * guía, nota de crédito, comprobante). Salió de `OrdersDetailPanel.tsx` (10-10).
 *
 * 17-10: la guía abre con el pedido puesto (`&guia=<id>`: antes había que
 * buscarlo de nuevo allá) y «Emitir comprobante» abre Emitir con el pedido
 * elegido. Cinco papeles sueltos no entraban en una fila (la ventana mide
 * 672 px a 1280: 727 px de botones), así que a la vista quedan Rechazar, la
 * Comanda y Emitir; guía, nota de crédito y la boleta para imprimir van en
 * «Papeles». Cada papel se ve si el rol lo puede hacer (`../permisos-pedidos.ts`);
 * rechazar, sólo si puede mover el pedido.
 */
import { FileMinus, FileStack, FileText, Printer, Receipt, Truck, X } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { button } from "@/components/ui-system/button-variants";
import type { DbOrder } from "@/lib/jsondb";
import { enlaceEmitir, enlaceGuia } from "../accesos-pedido";
import { usePermisosPedidos } from "../permisos-pedidos";
import { printComanda } from "./imprimir-comanda";

/** Mismo aspecto para los papeles del pedido: son del mismo peso. */
const PAPEL =
  "inline-flex h-12 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-ink)] hover:no-underline dark:hover:text-[var(--accent)]";

export function DetallePie({
  order,
  onRechazar,
}: {
  order: DbOrder;
  onRechazar: (id: string) => void;
}) {
  const permisos = usePermisosPedidos();
  const enMarcha = order.status !== "cancelado" && order.status !== "entregado";
  const cancelado = order.status === "cancelado";
  const n = `#${order.id.slice(-6)}`;
  const papeles: MenuAccion[] = [
    ...(permisos.guia && !cancelado
      ? [
          {
            id: "guia",
            label: "Guía de remisión",
            hint: `Con el cliente y los productos de ${n}`,
            icon: Truck,
            onSelect: () => void irAEnlace(enlaceGuia(order.id)),
          },
        ]
      : []),
    ...(permisos.notaCredito
      ? [
          {
            id: "nota-credito",
            label: "Nota de crédito",
            hint: `Abre Notas de crédito para la del pedido ${n}`,
            icon: FileMinus,
            onSelect: () => void irAEnlace("/admin?tab=notas-credito"),
          },
        ]
      : []),
    ...(permisos.comprobante
      ? [
          {
            id: "boleta",
            label: "Boleta para imprimir",
            hint: "La de siempre, en otra pestaña",
            icon: Receipt,
            onSelect: () => {
              window.open(`/api/invoices/${order.id}`, "_blank", "noopener,noreferrer");
            },
          },
        ]
      : []),
  ];
  return (
    <footer className="flex shrink-0 flex-wrap items-center gap-1.5 bg-[var(--surface-raised)] px-5 py-2 sm:px-6">
      {enMarcha && permisos.mover && (
        <button
          type="button"
          onClick={() => onRechazar(order.id)}
          className="inline-flex h-12 items-center gap-1.5 rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/5 px-2.5 text-sm font-semibold text-[var(--data-error-ink)] transition-colors hover:bg-[var(--data-error-500)]/10"
        >
          <X className="h-4 w-4" aria-hidden />
          Rechazar
        </button>
      )}
      <button
        type="button"
        onClick={() => printComanda(order)}
        title="Imprimir la comanda para la cocina o el almacén"
        className={PAPEL}
      >
        <Printer className="h-4 w-4" aria-hidden />
        Comanda
      </button>
      {/* Los otros papeles llevan a su pantalla (plan «panel unificado»
          2026-10-09); desde el 17-10, con el pedido puesto. */}
      {papeles.length > 0 && (
        <ActionMenu
          label="Papeles"
          title={`Guía, nota de crédito o boleta del pedido ${n}`}
          icon={FileStack}
          actions={papeles}
        />
      )}
      {permisos.comprobante && !cancelado && (
        <EnlacePanel
          href={enlaceEmitir(order.id)}
          apariencia="heredada"
          title={`Boleta o factura del pedido ${n}, con el pedido elegido`}
          className={button({ variant: "primary", className: "ml-auto gap-1.5 rounded-xl px-4 hover:no-underline" })}
        >
          <FileText className="h-4 w-4" aria-hidden />
          Emitir comprobante
        </EnlacePanel>
      )}
    </footer>
  );
}
