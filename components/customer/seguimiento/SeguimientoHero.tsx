"use client";

/**
 * SeguimientoHero — Hero del tracking Amazon-style.
 *
 * Muestra número de orden, estado big y ETA prominente (countdown).
 * El ETA se actualiza cada 30s.
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { TrackingStatus } from "@/lib/db/order-tracking.db";

interface Props {
  orderId: string;
  status: TrackingStatus;
  etaAt: string; // ISO
  storeName: string;
  className?: string;
}

const STATUS_LABEL: Record<TrackingStatus, string> = {
  confirmed: "Pedido confirmado",
  preparing: "Preparando",
  shipping: "En camino",
  nearby: "Cerca de ti",
  delivered: "Entregado",
  canceled: "Cancelado",
};

function msToMinLabel(diffMs: number): { mins: number; label: string } {
  const total = Math.max(0, Math.floor(diffMs / 1000));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins <= 0 && secs <= 0) return { mins: 0, label: "Llegando ahora" };
  if (mins <= 0) return { mins: 0, label: `${secs}s` };
  return { mins, label: `~${mins} min` };
}

export function SeguimientoHero({ orderId, status, etaAt, storeName, className }: Props) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const diff = new Date(etaAt).getTime() - now;
  const eta = msToMinLabel(diff);
  const isDone = status === "delivered";
  const isCanceled = status === "canceled";
  const short = orderId.length > 12 ? `#${orderId.slice(-8).toUpperCase()}` : `#${orderId.toUpperCase()}`;

  return (
    <section
      aria-labelledby="tracking-hero-heading"
      className={cn(
        "rounded-2xl border border-gray-100 dark:border-card-border bg-white dark:bg-card p-6 sm:p-8",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-muted">
          Pedido {short}
        </span>
        <span className="text-[length:var(--ts-2xs)] text-muted">{storeName}</span>
      </div>

      {isCanceled ? (
        <>
          <h1
            id="tracking-hero-heading"
            className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground"
          >
            Pedido cancelado
          </h1>
          <p className="mt-3 text-sm text-muted max-w-xl leading-relaxed">
            Este pedido fue cancelado. Si fue un error, contacta a la tienda.
          </p>
        </>
      ) : isDone ? (
        <>
          <h1
            id="tracking-hero-heading"
            className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground"
          >
            Entregado
          </h1>
          <p className="mt-3 text-sm text-muted max-w-xl leading-relaxed">
            Tu pedido fue entregado. Gracias por confiar en {storeName}.
          </p>
        </>
      ) : (
        <>
          <span className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-[var(--ls-wider)] text-muted mb-1 block">
            {STATUS_LABEL[status]}
          </span>
          <h1
            id="tracking-hero-heading"
            className="text-4xl sm:text-5xl font-extrabold leading-[0.95] tracking-tight text-foreground"
          >
            Llega en{" "}
            <span className="tabular-nums text-primary">
              {eta.mins > 0 ? eta.mins : eta.label}
            </span>
            {eta.mins > 0 && (
              <span className="text-xl sm:text-2xl font-bold text-muted align-middle ml-2">
                min
              </span>
            )}
          </h1>
          <p className="mt-3 text-sm text-muted max-w-xl leading-relaxed">
            Tu pedido está en camino. Te avisaremos cuando el repartidor esté cerca.
          </p>
        </>
      )}

      <ProgressBar status={status} />
    </section>
  );
}

function ProgressBar({ status }: { status: TrackingStatus }) {
  const order: TrackingStatus[] = ["confirmed", "preparing", "shipping", "nearby", "delivered"];
  const idx = Math.max(0, order.indexOf(status));
  const fraction = status === "canceled" ? 0 : (idx + 1) / order.length;

  return (
    <div className="mt-6" aria-hidden>
      <div className="h-2 w-full rounded-full bg-[var(--surface-sunken)] dark:bg-surface overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
          style={{ width: `${Math.round(fraction * 100)}%` }}
        />
      </div>
      <div className="mt-2 grid grid-cols-5 text-[length:var(--ts-2xs)] uppercase font-bold tracking-[var(--ls-wider)] text-muted">
        {order.map((s, i) => (
          <span
            key={s}
            className={cn(
              "truncate",
              i <= idx && status !== "canceled" && "text-foreground",
            )}
          >
            {s === "confirmed" && "Confirmado"}
            {s === "preparing" && "Prep."}
            {s === "shipping" && "En camino"}
            {s === "nearby" && "Cerca"}
            {s === "delivered" && "Entregado"}
          </span>
        ))}
      </div>
    </div>
  );
}
