"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------------ types ---

type OrderStatus = "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";

interface PublicOrder {
  id: string;
  status: OrderStatus;
  customerName: string;
  items: { name: string; quantity: number; unit?: string }[];
  total: number;
  paymentMethod: string | null;
  notes: string | null;
  deliverySlot: string | null;
  couponDiscount: string | null;
  discountAmount: number | null;
  createdAt: string;
  updatedAt: string;
}

// --------------------------------------------------------- timeline config ---

const TIMELINE_STEPS: { key: OrderStatus; label: string; description: string }[] = [
  { key: "pendiente",  label: "Pendiente",  description: "Tu pedido fue recibido y esta en revision" },
  { key: "confirmado", label: "Confirmado", description: "El pedido fue confirmado y se esta preparando" },
  { key: "en_camino",  label: "En camino",  description: "Tu delivery esta de camino a tu direccion" },
  { key: "entregado",  label: "Entregado",  description: "El pedido llego a su destino" },
];

const STATUS_ORDER: Record<OrderStatus, number> = {
  pendiente:  0,
  confirmado: 1,
  en_camino:  2,
  entregado:  3,
  cancelado:  -1,
};

// ------------------------------------------------------------ sub-components ---

function StatusBadge({ status }: { status: OrderStatus }) {
  const map: Record<OrderStatus, { label: string; className: string }> = {
    pendiente:  { label: "Pendiente",  className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
    confirmado: { label: "Confirmado", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
    en_camino:  { label: "En camino",  className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
    entregado:  { label: "Entregado",  className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
    cancelado:  { label: "Cancelado",  className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  };
  const { label, className } = map[status] ?? map.pendiente;
  return (
    <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold", className)}>
      {label}
    </span>
  );
}

function TimelineStep({
  step,
  currentStatus,
  isLast,
}: {
  step: (typeof TIMELINE_STEPS)[number];
  currentStatus: OrderStatus;
  isLast: boolean;
}) {
  const currentIndex = STATUS_ORDER[currentStatus] ?? 0;
  const stepIndex    = STATUS_ORDER[step.key];
  const isDone       = currentIndex >= stepIndex;
  const isActive     = currentIndex === stepIndex;

  return (
    <li className="relative flex gap-4">
      {/* vertical line */}
      {!isLast && (
        <span
          className={cn(
            "absolute left-4 top-8 h-full w-0.5 -translate-x-1/2",
            isDone ? "bg-[#2d6a4f]" : "bg-border dark:bg-border",
          )}
        />
      )}

      {/* circle */}
      <div
        className={cn(
          "relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          isDone
            ? "border-[#2d6a4f] bg-[#2d6a4f]"
            : "border-border bg-card dark:border-border dark:bg-card",
        )}
      >
        {isDone ? (
          <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <span className="h-2 w-2 rounded-full bg-border dark:bg-border" />
        )}
      </div>

      {/* text */}
      <div className="pb-6">
        <p className={cn("text-sm font-semibold", isDone ? "text-foreground dark:text-foreground" : "text-muted-foreground dark:text-muted")}>
          {step.label}
          {isActive && (
            <span className="ml-2 inline-flex items-center rounded-full bg-[#f4a261]/20 px-2 py-0.5 text-xs font-medium text-[#f4a261]">
              Ahora
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground dark:text-muted">{step.description}</p>
      </div>
    </li>
  );
}

function OrderResult({ order }: { order: PublicOrder }) {
  const isCancelled = order.status === "cancelado";

  return (
    <div className="mt-8 space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-4 dark:bg-card dark:border-border">
        <div>
          <p className="text-xs text-muted-foreground dark:text-muted">Pedido</p>
          <p className="font-mono text-sm font-semibold text-foreground dark:text-foreground">#{order.id.slice(0, 8).toUpperCase()}</p>
        </div>
        <StatusBadge status={order.status} />
        <div className="text-right">
          <p className="text-xs text-muted-foreground dark:text-muted">Total</p>
          <p className="text-sm font-bold text-foreground dark:text-foreground">
            S/ {order.total.toFixed(2)}
          </p>
        </div>
      </div>

      {/* timeline */}
      {!isCancelled && (
        <div className="rounded-xl border border-border bg-card p-5 dark:bg-card dark:border-border">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground dark:text-muted">
            Estado del pedido
          </p>
          <ul>
            {TIMELINE_STEPS.map((step, idx) => (
              <TimelineStep
                key={step.key}
                step={step}
                currentStatus={order.status}
                isLast={idx === TIMELINE_STEPS.length - 1}
              />
            ))}
          </ul>
        </div>
      )}

      {isCancelled && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/20">
          <p className="text-sm font-semibold text-red-700 dark:text-red-400">Pedido cancelado</p>
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            Este pedido fue cancelado. Si tienes dudas, contactanos por WhatsApp.
          </p>
        </div>
      )}

      {/* items */}
      <div className="rounded-xl border border-border bg-card p-5 dark:bg-card dark:border-border">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground dark:text-muted">
          Productos
        </p>
        <ul className="space-y-2">
          {order.items.map((item, idx) => (
            <li key={idx} className="flex items-center justify-between text-sm">
              <span className="text-foreground dark:text-foreground">{item.name}</span>
              <span className="text-muted-foreground dark:text-muted">
                x{item.quantity}
                {item.unit ? ` ${item.unit}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* delivery slot */}
      {order.deliverySlot && (
        <div className="rounded-xl border border-border bg-card p-4 dark:bg-card dark:border-border">
          <p className="text-xs text-muted-foreground dark:text-muted">Hora estimada de entrega</p>
          <p className="mt-1 text-sm font-semibold text-foreground dark:text-foreground">{order.deliverySlot}</p>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- main ---

export default function TrackingForm() {
  const [query, setQuery]   = useState("");
  const [order, setOrder]   = useState<PublicOrder | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const id = query.trim();
    if (!id) return;

    setOrder(null);
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(id)}/public`);
        if (res.status === 404) {
          setError("No encontramos ese pedido. Verifica el numero e intenta de nuevo.");
          return;
        }
        if (!res.ok) {
          setError("Ocurrio un error al buscar tu pedido. Intenta en unos segundos.");
          return;
        }
        const data: PublicOrder = await res.json();
        setOrder(data);
      } catch {
        setError("Sin conexion. Revisa tu internet e intenta de nuevo.");
      }
    });
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Numero de pedido (ej. abc12345)"
          required
          className={cn(
            "flex-1 rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-[#2d6a4f]",
            "dark:bg-card dark:border-border dark:text-foreground dark:placeholder:text-muted",
          )}
        />
        <button
          type="submit"
          disabled={isPending}
          className={cn(
            "rounded-xl bg-[#2d6a4f] px-5 py-3 text-sm font-semibold text-white transition-colors",
            "hover:bg-[#245a42] active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed",
          )}
        >
          {isPending ? "Buscando..." : "Buscar"}
        </button>
      </form>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
          {error}
        </div>
      )}

      {order && <OrderResult order={order} />}
    </div>
  );
}
