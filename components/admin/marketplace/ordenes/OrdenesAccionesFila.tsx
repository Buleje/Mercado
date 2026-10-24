"use client";

import { useRef } from "react";
import { CheckCircle2, Eye, MessageCircle, MoreHorizontal, RefreshCw, XCircle, ArrowRight } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import type { MarketplaceOrder, OrderTargetStatus } from "@/components/admin/marketplace/hooks/use-marketplace-orders";
import { ACCION_DE_ESTADO, BOTON_DE_ESTADO, SIGUIENTES, idCorto, pasoSiguiente } from "@/components/admin/marketplace/ordenes/ordenes-util";
import { cn } from "@/lib/utils";

/**
 * El paso siguiente del pedido a la vista (48 px: Confirmar, Preparar, Enviar,
 * Entregado) y el resto en «⋯»: detalle, WhatsApp, los otros estados y
 * cancelar. Antes eran tres íconos de 32 px y un desplegable propio por fila.
 */
export function OrdenesAccionesFila({
  orden,
  actualizando,
  onEstado,
  onDetalle,
  onWhatsApp,
}: {
  orden: MarketplaceOrder;
  actualizando: boolean;
  onEstado: (estado: OrderTargetStatus) => void;
  onDetalle: () => void;
  onWhatsApp: () => void;
}) {
  /* El menú cierra sin devolver el foco a su botón: el detalle que se abre
     guardaba «body» y, al cerrarlo, el teclado volvía al inicio de la página. */
  const ref = useRef<HTMLDivElement>(null);
  const enfocarMenu = () => ref.current?.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus({ preventScroll: true });
  const siguiente = pasoSiguiente(orden.status);
  const otros = (SIGUIENTES[orden.status] ?? []).filter((s) => s !== siguiente);

  const base: MenuAccion[] = [
    { id: "detalle", label: "Ver el pedido", hint: "Productos, descuentos y datos de entrega", icon: Eye, onSelect: onDetalle },
    ...(orden.customerPhone
      ? [{ id: "whatsapp", label: "Escribir por WhatsApp", hint: "Con el estado y el total del pedido", icon: MessageCircle, onSelect: onWhatsApp }]
      : []),
    ...otros.map<MenuAccion>((s) => ({
      id: `estado-${s}`,
      label: ACCION_DE_ESTADO[s],
      icon: s === "cancelado" ? XCircle : CheckCircle2,
      tone: s === "cancelado" ? "danger" : "default",
      seccion: "Estado",
      onSelect: () => onEstado(s),
    })),
  ];
  const acciones = base.map((a) => ({ ...a, onSelect: () => { enfocarMenu(); a.onSelect(); } }));

  return (
    <div ref={ref} className="flex items-center justify-end gap-1" data-no-row-click>
      {siguiente && (
        <button
          type="button"
          onClick={() => onEstado(siguiente)}
          disabled={actualizando}
          title={`${ACCION_DE_ESTADO[siguiente]} el pedido #${idCorto(orden.id)}`}
          className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--accent-dark)] bg-transparent px-3 text-sm font-semibold text-[var(--accent-ink)] transition-colors hover:bg-primary/10 disabled:opacity-60 dark:text-[var(--accent)]"
        >
          {actualizando ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
          {BOTON_DE_ESTADO[siguiente]}
        </button>
      )}
      <ActionMenu
        label={`Más acciones del pedido #${idCorto(orden.id)}`}
        title="Ver el pedido, WhatsApp, otros estados y cancelar"
        icon={MoreHorizontal}
        actions={acciones}
        soloIcono
        size="md"
        className={cn("w-12 shrink-0", "border-transparent! bg-transparent! hover:bg-[var(--surface-sunken)]!")}
      />
    </div>
  );
}
