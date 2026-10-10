"use client";

/**
 * La cabecera del detalle del pedido y su «siguiente paso», en dos filas.
 *
 * 10-10 (Brandon: compactar y sin repetir): se fueron la inicial de 44 px, el
 * rótulo «PEDIDO · #id» y el «TOTAL» de 10 px (el número va en la línea del
 * estado; el total, sin rótulo, a la derecha). El «Siguiente paso» era un
 * bloque de tres renglones —rótulo, «Pendiente de confirmar» (que repetía el
 * chip del estado) y un consejo— más los botones abajo: ahora es una fila con
 * los botones y el consejo en el ⓘ.
 */
import type { ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { Check, X } from "@buleje/design-system/icons";
import { ControlesDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import type { VentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { formatDate } from "@/lib/admin-helpers";
import { formatCurrency } from "@/lib/format";
import type { DbOrder } from "@/lib/jsondb";
import { cn } from "@/lib/utils";
import { textoDeEspera } from "../tiempo-en-estado";
import { STATUS_COLORS, STATUS_LABELS, nombreDelPago } from "../types";

function haceCuanto(fecha: string): string {
  const texto = textoDeEspera(Math.max(0, Date.now() - new Date(fecha).getTime()));
  return texto === "recién" ? "recién" : `hace ${texto}`;
}

export function DetalleCabecera({
  order,
  ventana,
  onClose,
}: {
  order: DbOrder;
  ventana: VentanaDeModal;
  onClose: () => void;
}) {
  const pago = nombreDelPago(order.paymentMethod);
  return (
    <header
      {...ventana.asaProps}
      className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)] px-5 py-3"
    >
      <div className="min-w-0">
        <CardTitle
          as="h2"
          className="font-display truncate text-base font-semibold tracking-tight text-[var(--text-primary)] sm:text-lg"
        >
          <EnlacePanel
            cosa="cliente"
            id={order.customer.phone}
            apariencia="heredada"
            title="Abrir su ficha de cliente"
          >
            {order.customer.name}
          </EnlacePanel>
        </CardTitle>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-[var(--text-secondary)]">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-sm font-bold",
              STATUS_COLORS[order.status],
            )}
          >
            {STATUS_LABELS[order.status]}
          </span>
          <span className="font-mono">#{order.id.slice(-8)}</span>
          <span aria-hidden>·</span>
          <span title={formatDate(order.createdAt)}>{haceCuanto(order.createdAt)}</span>
          {pago && (
            <>
              <span aria-hidden>·</span>
              <span className="font-semibold">{pago}</span>
            </>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <p className="mr-2 text-xl font-extrabold leading-none tabular-nums text-[var(--text-primary)]">
          <span className="sr-only">Total </span>
          {formatCurrency(Number(order.total))}
        </p>
        <ControlesDeVentana ventana={ventana} />
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          aria-label="Cerrar panel"
        >
          <X className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>
      </div>
    </header>
  );
}

interface Paso {
  ayuda: string;
  principal: { label: string; onClick: () => void };
  segunda?: { label: string; onClick: () => void; tono: "ok" | "peligro" };
}

interface PasoProps {
  order: DbOrder;
  onVerifyYape: (id: string) => void;
  onRejectYape: (id: string) => void;
  onPatchOrder: (id: string, patch: Partial<DbOrder>) => void;
  onEntregaManual: () => void;
}

function pasoDe({
  order,
  onVerifyYape,
  onRejectYape,
  onPatchOrder,
  onEntregaManual,
}: PasoProps): Paso | null {
  const a = (status: DbOrder["status"]) => () => onPatchOrder(order.id, { status });
  /* Entrega sin reparto (FIX 2026-05-07): pide método y nota; queda en el historial del pedido. */
  const manual = { label: "Entregado sin reparto", onClick: onEntregaManual, tono: "ok" as const };
  switch (order.status) {
    case "pendiente":
      return order.paymentMethod === "yape"
        ? {
            ayuda: `Mira el comprobante en «Pago»${order.yapeOperationNumber ? ` (Nº Op. ${order.yapeOperationNumber})` : ""} antes de confirmar.`,
            principal: { label: "Confirmar Yape", onClick: () => onVerifyYape(order.id) },
            segunda: {
              label: "Yape falso",
              onClick: () => onRejectYape(order.id),
              tono: "peligro",
            },
          }
        : {
            ayuda: "Confírmalo cuando esté listo para preparar.",
            principal: { label: "Confirmar pedido", onClick: a("confirmado") },
          };
    case "confirmado":
      return {
        ayuda: "Márcalo cuando empieces a armar el pedido.",
        principal: { label: "Empezar preparación", onClick: a("preparando") },
        segunda: manual,
      };
    case "preparando":
      return {
        ayuda: "Asigna un motorizado en «Despacho» y avanza cuando salga.",
        principal: { label: "Marcar en camino", onClick: a("en_camino") },
        segunda: manual,
      };
    case "en_camino":
      return {
        ayuda: "Confírmalo cuando el cliente lo reciba.",
        principal: { label: "Marcar entregado", onClick: a("entregado") },
      };
    default:
      return null;
  }
}

/** La fila del siguiente paso: el botón que lo da y, si hay, el de al lado. */
export function DetallePasoSiguiente(props: PasoProps): ReactNode {
  const paso = pasoDe(props);
  if (!paso) return null;
  return (
    <section
      aria-label="Siguiente paso"
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-5 py-2"
    >
      <button
        type="button"
        onClick={paso.principal.onClick}
        className={button({ variant: "primary", className: "gap-1.5 rounded-xl px-4" })}
      >
        <Check className="h-4 w-4" aria-hidden />
        {paso.principal.label}
      </button>
      {paso.segunda && (
        <button
          type="button"
          onClick={paso.segunda.onClick}
          className={cn(
            "inline-flex h-12 items-center gap-1.5 rounded-xl border bg-[var(--surface-raised)] px-4 text-sm font-semibold transition-colors",
            paso.segunda.tono === "ok"
              ? "border-[var(--data-success-500)]/40 text-[var(--data-success-ink)] hover:bg-[var(--data-success-500)]/5"
              : "border-[var(--data-error-500)]/40 text-[var(--data-error-ink)] hover:bg-[var(--data-error-500)]/5",
          )}
        >
          {paso.segunda.tono === "ok" ? (
            <Check className="h-4 w-4" aria-hidden />
          ) : (
            <X className="h-4 w-4" aria-hidden />
          )}
          {paso.segunda.label}
        </button>
      )}
      <InfoTip title="Siguiente paso" what={paso.ayuda} />
    </section>
  );
}
