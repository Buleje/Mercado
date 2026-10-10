"use client";

/**
 * Una tarjeta del tablero de Pedidos: quién, cuánto, cuánto lleva en este paso
 * y UNA acción para pasarlo al siguiente.
 *
 * 10-10 (Brandon: «la información central bien vista»): a 1280 px con el menú
 * lateral, cada columna mide ~230 px y la tarjeta de antes (casilla + inicial
 * de 40 px + nombre + total) dejaba ~20 px al nombre: «Fra T…», «B L». Se
 * fueron la casilla (elegir varios es tarea de la Lista), la inicial y el
 * chip «TIENDA» de cada tarjeta (sólo se marca lo que viene del marketplace).
 * El «+2h sin avanzar» fijo pasó a decir el tiempo real («177 días sin
 * avanzar»). Las acciones de al lado (cobrar la deuda, entregado sin
 * reparto) van en «⋯»; rechazar un Yape sigue a la vista, junto a Confirmar.
 */
import { memo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Bike,
  Boxes,
  Check,
  ChefHat,
  Clock,
  MapPin,
  MoreHorizontal,
  X as XIcon,
} from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { button } from "@/components/ui-system/button-variants";
import { haversineKm, parseGps } from "@/lib/admin-helpers";
import { formatCurrency } from "@/lib/format";
import type { DbOrder, OrderStatus } from "@/lib/jsondb";
import { cn } from "@/lib/utils";
import ManualDeliveryModal from "../ManualDeliveryModal";
import { msEnEstado, nivelDeEspera, textoDeEspera } from "../tiempo-en-estado";
import { nombreDelPago } from "../types";

export interface TarjetaPedidoProps {
  order: DbOrder;
  storeLat: number | null;
  storeLon: number | null;
  nowMs: number;
  driverColor: (name: string) => string;
  onSelect: () => void;
  onUpdateStatus: (status: OrderStatus) => void;
  onVerifyYape: () => void;
  onRejectYape: () => void;
  onMarkDeudaPaid: () => void;
  /** Entrega sin reparto con su motivo (va al historial del pedido). Sin él, sólo cambia el estado. */
  onManualDelivery?: (reason: string) => void;
}

type Pedido = DbOrder & { deliveryDriver?: string; source?: string };

/** Los callbacks son lambdas nuevas en cada render de la columna: se miran sólo los datos. */
function mismosDatos(a: TarjetaPedidoProps, b: TarjetaPedidoProps): boolean {
  return (
    a.order.id === b.order.id &&
    a.order.status === b.order.status &&
    a.order.updatedAt === b.order.updatedAt &&
    a.order.total === b.order.total &&
    a.order.deuda === b.order.deuda &&
    a.nowMs === b.nowMs &&
    a.storeLat === b.storeLat &&
    a.storeLon === b.storeLon
  );
}

const SIGUIENTE: Partial<
  Record<OrderStatus, { label: string; icon: typeof Check; a: OrderStatus }>
> = {
  pendiente: { label: "Confirmar", icon: Check, a: "confirmado" },
  confirmado: { label: "Preparando", icon: ChefHat, a: "preparando" },
  preparando: { label: "En camino", icon: ArrowRight, a: "en_camino" },
  en_camino: { label: "Entregado", icon: Check, a: "entregado" },
};

const ESPERA: Record<ReturnType<typeof nivelDeEspera>, string> = {
  "al-dia": "text-[var(--text-secondary)]",
  aviso: "text-[var(--data-warning-ink)]",
  tarde: "text-[var(--data-error-ink)]",
};

const ETIQUETA =
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-sm font-semibold";

function distancia(order: DbOrder, lat: number | null, lon: number | null): string | null {
  if (lat === null || lon === null) return null;
  const gps = parseGps(order.customer.location);
  if (!gps) return null;
  const km = haversineKm(lat, lon, gps.lat, gps.lon);
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export const TarjetaPedido = memo(function TarjetaPedido(props: TarjetaPedidoProps) {
  const {
    order,
    storeLat,
    storeLon,
    nowMs,
    driverColor,
    onSelect,
    onUpdateStatus,
    onVerifyYape,
    onRejectYape,
    onMarkDeudaPaid,
    onManualDelivery,
  } = props;
  const pedido = order as Pedido;
  const [manualOpen, setManualOpen] = useState(false);
  const ms = msEnEstado(order, nowMs);
  const nivel = nivelDeEspera(ms);
  const espera = textoDeEspera(ms);
  const km = distancia(order, storeLat, storeLon);
  const pago = nombreDelPago(order.paymentMethod);
  const conDeuda = order.paymentMethod === "efectivo" && order.deuda === true;
  const yapePorVerificar = order.status === "pendiente" && order.paymentMethod === "yape";
  const siguiente = SIGUIENTE[order.status];

  const confirmarManual = (reason: string) => {
    setManualOpen(false);
    if (onManualDelivery) onManualDelivery(reason);
    else onUpdateStatus("entregado");
  };

  const otras: MenuAccion[] = [
    ...(conDeuda
      ? [
          {
            id: "cobrado",
            label: "Marcar cobrado",
            hint: "El cliente ya pagó lo que debía",
            icon: Banknote,
            onSelect: onMarkDeudaPaid,
          },
        ]
      : []),
    ...(order.status === "confirmado" || order.status === "preparando"
      ? [
          {
            id: "manual",
            label: "Entregado sin reparto",
            hint: "Lo recogió en la tienda o lo llevaste tú",
            icon: Check,
            onSelect: () => setManualOpen(true),
          },
        ]
      : []),
  ];

  return (
    <article className="space-y-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3 transition-colors hover:border-[var(--accent)]/50">
      <button
        type="button"
        onClick={onSelect}
        aria-label={`Ver detalle del pedido de ${order.customer.name}`}
        className="block min-h-12 w-full min-w-0 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0 text-sm font-bold leading-tight text-[var(--text-primary)] line-clamp-2">
            {order.customer.name}
          </span>
          <span className="shrink-0 text-base font-extrabold leading-tight tabular-nums text-[var(--text-primary)]">
            {formatCurrency(Number(order.total))}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-sm text-[var(--text-secondary)]">
          <span className="font-mono">#{order.id.slice(-6)}</span>
          {` · ${order.items.length} ${order.items.length === 1 ? "ítem" : "ítems"}`}
          {pago && ` · ${pago}`}
        </span>
      </button>

      <p className={cn("flex items-center gap-1.5 text-sm font-semibold", ESPERA[nivel])}>
        {nivel === "al-dia" ? (
          <Clock className="h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        )}
        {nivel === "al-dia"
          ? espera === "recién"
            ? "Recién llegó a este paso"
            : `${espera} en este paso`
          : `${espera} sin avanzar`}
      </p>

      {(conDeuda || km || pedido.deliveryDriver || pedido.source === "marketplace") && (
        <div className="flex flex-wrap items-center gap-1.5">
          {conDeuda && (
            <span
              className={cn(
                ETIQUETA,
                "border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/10 text-[var(--data-error-ink)]",
              )}
            >
              Con deuda
            </span>
          )}
          {pedido.source === "marketplace" && (
            <span
              className={cn(ETIQUETA, "border-[var(--rule-base)] text-[var(--text-secondary)]")}
            >
              <Boxes className="h-3.5 w-3.5" aria-hidden /> Marketplace
            </span>
          )}
          {km && (
            <span
              className={cn(ETIQUETA, "border-[var(--rule-base)] text-[var(--text-secondary)]")}
            >
              <MapPin className="h-3.5 w-3.5" aria-hidden /> {km}
            </span>
          )}
          {pedido.deliveryDriver && (
            <span
              className={cn(ETIQUETA, "border-transparent text-white")}
              style={{ backgroundColor: driverColor(pedido.deliveryDriver) }}
            >
              <Bike className="h-3.5 w-3.5" aria-hidden /> {pedido.deliveryDriver}
            </span>
          )}
        </div>
      )}

      {siguiente && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={yapePorVerificar ? onVerifyYape : () => onUpdateStatus(siguiente.a)}
            className={button({
              variant: "primary",
              className: "min-w-0 flex-1 gap-1.5 rounded-xl px-3",
            })}
          >
            <siguiente.icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">
              {yapePorVerificar ? "Confirmar Yape" : siguiente.label}
            </span>
          </button>
          {yapePorVerificar && (
            <button
              type="button"
              onClick={onRejectYape}
              title="Rechazar Yape"
              aria-label="Rechazar Yape (pago falso)"
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/10 text-[var(--data-error-ink)] transition-colors hover:bg-[var(--data-error-500)]/20"
            >
              <XIcon className="h-4 w-4" aria-hidden />
            </button>
          )}
          {otras.length > 0 && (
            <ActionMenu
              label="Más acciones del pedido"
              icon={MoreHorizontal}
              actions={otras}
              soloIcono
              size="md"
              className="w-12 shrink-0"
            />
          )}
        </div>
      )}

      <ManualDeliveryModal
        open={manualOpen}
        customerName={order.customer.name}
        onConfirm={confirmarManual}
        onCancel={() => setManualOpen(false)}
      />
    </article>
  );
}, mismosDatos);
