"use client";

import { Check, Clock, Package, Truck, Home, MessageCircle, Phone } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { IconBadge } from "@buleje/design-system";

/**
 * OrderTrackingTimeline — timeline visual del pedido post-pago.
 *
 * 5 etapas: Confirmado → Preparando → Despachado → En camino → Entregado.
 * Cada etapa tiene timestamp opcional. Etapa activa pulsa. ETA visible arriba.
 *
 * @example
 * <OrderTrackingTimeline
 *   currentStatus="en_camino"
 *   etaMinutes={18}
 *   orderId="BUL-1234"
 *   driverName="Carlos M."
 *   driverPhone="929340532"
 *   events={[
 *     { status: "confirmado", at: "14:05" },
 *     { status: "preparando", at: "14:08" },
 *     { status: "despachado", at: "14:22" },
 *   ]}
 * />
 */

export type OrderStatus =
  | "confirmado"
  | "preparando"
  | "despachado"
  | "en_camino"
  | "entregado"
  | "cancelado";

export interface TimelineEvent {
  status: OrderStatus;
  at: string;
}

interface Props {
  currentStatus: OrderStatus;
  etaMinutes?: number;
  orderId: string;
  driverName?: string;
  driverPhone?: string;
  events?: TimelineEvent[];
  className?: string;
}

const STEPS: Array<{ status: OrderStatus; label: string; Icon: typeof Clock }> = [
  { status: "confirmado", label: "Confirmado", Icon: Check },
  { status: "preparando", label: "Preparando", Icon: Package },
  { status: "despachado", label: "Despachado", Icon: Clock },
  { status: "en_camino", label: "En camino", Icon: Truck },
  { status: "entregado", label: "Entregado", Icon: Home },
];

export function OrderTrackingTimeline({
  currentStatus,
  etaMinutes,
  orderId,
  driverName,
  driverPhone,
  events = [],
  className,
}: Props) {
  const currentIdx = STEPS.findIndex((s) => s.status === currentStatus);
  const eventMap = new Map(events.map((e) => [e.status, e.at]));

  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden",
        className,
      )}
    >
      {/* Header con ETA */}
      <div className="p-5 sm:p-6 border-b border-[var(--rule-soft)]">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
          Pedido #{orderId.slice(-6).toUpperCase()}
        </p>
        {etaMinutes != null && currentStatus !== "entregado" && currentStatus !== "cancelado" ? (
          <div className="flex items-baseline gap-2">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Llega en
            </span>
            <span className="text-4xl sm:text-5xl font-extrabold tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)]">
              {etaMinutes}
            </span>
            <span className="text-lg font-bold text-[var(--text-secondary)]">min</span>
          </div>
        ) : currentStatus === "entregado" ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--data-success-500)] text-white">
              <Check className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <span className="text-2xl font-extrabold tracking-[var(--ls-tight)] text-[var(--text-primary)]">
              Entregado
            </span>
          </div>
        ) : null}
      </div>

      {/* Timeline */}
      <div className="p-5 sm:p-6">
        <ol className="relative space-y-5">
          {/* Vertical connector line */}
          <span
            className="absolute left-3.5 top-5 w-px bg-[var(--rule-base)]"
            style={{ bottom: "20px" }}
            aria-hidden
          />
          {STEPS.map((step, i) => {
            const isActive = i === currentIdx;
            const isDone = i < currentIdx;
            const isFuture = i > currentIdx;
            const SIcon = step.Icon;
            const timestamp = eventMap.get(step.status);

            return (
              <li key={step.status} className="relative flex items-start gap-3 pl-0">
                <span
                  className={cn(
                    "relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 z-10",
                    isDone && "bg-[var(--text-primary)] border-[var(--text-primary)] text-[var(--surface-canvas)]",
                    isActive &&
                      "bg-[var(--accent)] border-[var(--accent)] text-white",
                    isFuture && "bg-[var(--surface-raised)] border-[var(--rule-base)] text-[var(--text-tertiary)]",
                  )}
                  aria-hidden
                >
                  {isDone ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  ) : (
                    <SIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                  )}
                  {isActive && (
                    <span className="absolute inset-0 rounded-full bg-[var(--accent)] opacity-40 animate-ping" />
                  )}
                </span>
                <div className="flex-1 min-w-0 pb-1">
                  <p
                    className={cn(
                      "text-sm font-extrabold tracking-tight",
                      isActive && "text-[var(--text-primary)]",
                      isDone && "text-[var(--text-primary)]",
                      isFuture && "text-[var(--text-tertiary)]",
                    )}
                  >
                    {step.label}
                  </p>
                  {timestamp && (
                    <p className="text-xs text-[var(--text-tertiary)] font-semibold tabular-nums mt-0.5">
                      {timestamp}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Driver info (solo si en_camino) */}
      {currentStatus === "en_camino" && driverName && (
        <div className="p-5 sm:p-6 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
            Tu repartidor
          </p>
          <div className="flex items-center gap-3">
            <IconBadge size="step">
              {driverName.split(" ").map((n) => n[0]).slice(0, 2).join("")}
            </IconBadge>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-extrabold text-[var(--text-primary)]">{driverName}</p>
              {driverPhone && (
                <p className="text-xs text-[var(--text-tertiary)] tabular-nums">{driverPhone}</p>
              )}
            </div>
            {driverPhone && (
              <div className="flex gap-2">
                <a
                  href={`tel:+51${driverPhone}`}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-raised)] border border-[var(--rule-base)] hover:border-[var(--rule-strong)] transition-colors"
                  aria-label="Llamar al repartidor"
                >
                  <Phone className="h-4 w-4 text-[var(--text-primary)]" strokeWidth={1.75} />
                </a>
                <a
                  href={`https://wa.me/51${driverPhone}?text=${encodeURIComponent(`Hola, soy del pedido #${orderId.slice(-6).toUpperCase()}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366] hover:bg-[#1ebe5a] transition-colors"
                  aria-label="WhatsApp al repartidor"
                >
                  <MessageCircle className="h-4 w-4 text-white" strokeWidth={1.75} />
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
