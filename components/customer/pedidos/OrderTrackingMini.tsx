"use client";

/**
 * OrderTrackingMini — Widget compacto para la lista /cuenta/pedidos.
 *
 * Se muestra solo cuando el pedido está en `shipping` o `preparing` (activo).
 * Muestra mini timeline horizontal + ETA + CTA al tracking completo.
 */
import Link from "next/link";
import { ArrowRight, Truck, ChefHat, Check, MapPin } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export type MiniStatus = "confirmed" | "preparing" | "shipping" | "nearby" | "delivered";

interface Props {
  orderId: string;
  status: MiniStatus;
  etaMinutes?: number;
  storeName?: string;
  className?: string;
}

const STEP_ORDER: MiniStatus[] = ["confirmed", "preparing", "shipping", "nearby", "delivered"];

const STEP_META: Record<
  MiniStatus,
  { label: string; Icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }
> = {
  confirmed: { label: "Confirmado", Icon: Check },
  preparing: { label: "Preparando", Icon: ChefHat },
  shipping: { label: "En camino", Icon: Truck },
  nearby: { label: "Cerca", Icon: MapPin },
  delivered: { label: "Entregado", Icon: Check },
};

export function OrderTrackingMini({
  orderId,
  status,
  etaMinutes,
  storeName,
  className,
}: Props) {
  // Mostrar solo para pedidos activos
  if (status !== "shipping" && status !== "preparing" && status !== "nearby") {
    return null;
  }

  const currentIdx = STEP_ORDER.indexOf(status);

  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 flex flex-col gap-3 hover:border-gray-200 dark:hover:border-[var(--rule-base)]/80 transition-colors",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-muted">
              {storeName ? storeName : "Pedido"}
            </span>
            {etaMinutes != null && (
              <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold text-primary uppercase tracking-[var(--ls-wider)]">
                <Truck className="h-3 w-3" strokeWidth={2} />
                Llega en {etaMinutes} min
              </span>
            )}
          </div>
          <p className="text-sm font-extrabold text-[var(--text-primary)] tracking-tight mt-0.5">
            {STEP_META[status].label}
          </p>
        </div>
        <Link
          href={`/cuenta/pedidos/${encodeURIComponent(orderId)}/seguimiento`}
          className="inline-flex items-center gap-1.5 h-9 rounded-lg bg-foreground text-white dark:text-background px-3 text-[length:var(--ts-2xs)] font-bold hover:opacity-90 transition-opacity shrink-0"
        >
          Ver seguimiento
          <ArrowRight className="h-3 w-3" strokeWidth={2} />
        </Link>
      </div>

      {/* Mini timeline horizontal */}
      <ol className="flex items-center gap-1.5" aria-label={`Estado: ${STEP_META[status].label}`}>
        {STEP_ORDER.map((step, i) => {
          const isDone = i < currentIdx;
          const isCurrent = i === currentIdx;
          const isFuture = i > currentIdx;
          const { Icon } = STEP_META[step];
          return (
            <li key={step} className="flex items-center gap-1.5 flex-1 min-w-0">
              <span
                className={cn(
                  "relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  isDone && "bg-foreground border-foreground text-white dark:text-background",
                  isCurrent && "bg-primary border-primary text-white",
                  isFuture &&
                    "bg-[var(--surface-raised)] border-[var(--rule-base)] text-muted",
                )}
                aria-hidden
              >
                {isDone ? (
                  <Check className="h-2.5 w-2.5" strokeWidth={2.8} />
                ) : (
                  <Icon className="h-2.5 w-2.5" strokeWidth={2} />
                )}
                {isCurrent && (
                  <span className="absolute inset-0 rounded-full bg-primary opacity-40 animate-ping" />
                )}
              </span>
              {i < STEP_ORDER.length - 1 && (
                <span
                  className={cn(
                    "h-0.5 flex-1 rounded-full transition-colors",
                    i < currentIdx
                      ? "bg-foreground"
                      : i === currentIdx
                        ? "bg-primary/30"
                        : "bg-[var(--rule-soft)] dark:bg-card-border",
                  )}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
