"use client";
import { LoadingState } from "@buleje/design-system";
 

import { useState, useEffect } from "react";
import {
  ShoppingCart,
  Star,
  MessageSquare,
  CreditCard,
  Gift,
  AlertCircle,
  Loader2,
  User,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────────

type EventType = "order" | "review" | "complaint" | "credit" | "points";

type TimelineEvent = {
  id: string;
  type: EventType;
  title: string;
  detail: string;
  amount?: number;
  date: string;
};

type Summary = {
  totalSpent: number;
  orderCount: number;
  firstOrderDate: string | null;
  topProduct: string | null;
};

type Order = {
  id: string;
  status: string;
  total: number;
  paymentMethod: string;
  items?: { name: string; quantity: number }[];
  createdAt: string;
};

// ── Props ────────────────────────────────────────────────────────────────────

type Props = {
  customerPhone: string;
  customerName?: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

const EVENT_CONFIG: Record<
  EventType,
  { icon: typeof ShoppingCart; color: string; bg: string; dot: string }
> = {
  order: {
    icon: ShoppingCart,
    color: "text-primary",
    bg: "bg-primary/10 dark:bg-primary/20",
    dot: "bg-primary",
  },
  review: {
    icon: Star,
    color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
    bg: "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20",
    dot: "bg-[var(--data-warning-500)]",
  },
  complaint: {
    icon: MessageSquare,
    color: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",
    bg: "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20",
    dot: "bg-[var(--data-error-500)]",
  },
  credit: {
    icon: CreditCard,
    color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",
    dot: "bg-[var(--accent-soft)]",
  },
  points: {
    icon: Gift,
    color: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    bg: "bg-[var(--surface-sunken)]",
    dot: "bg-[var(--accent-soft)]",
  },
};

// ── Component ────────────────────────────────────────────────────────────────

export default function CustomerTimeline({ customerPhone, customerName }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [summary, setSummary] = useState<Summary>({
    totalSpent: 0,
    orderCount: 0,
    firstOrderDate: null,
    topProduct: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!customerPhone) return;
    setLoading(true);
    setError("");

    // Try timeline endpoint, fall back to orders
    const fetchTimeline = fetch(
      `/api/customers/${encodeURIComponent(customerPhone)}/orders`
    )
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      });

    fetchTimeline
      .then((data) => {
        const orders: Order[] = Array.isArray(data)
          ? data
          : (data.orders ?? data.data ?? []);

        // Build timeline events from orders
        const evts: TimelineEvent[] = orders.map((o) => ({
          id: o.id,
          type: "order" as EventType,
          title: `Pedido #${o.id.slice(-6).toUpperCase()}`,
          detail: `${o.paymentMethod ?? "—"} · Estado: ${o.status}`,
          amount: o.total,
          date: o.createdAt,
        }));

        evts.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        setEvents(evts);

        // Summary
        const totalSpent = orders.reduce((s, o) => s + (o.total ?? 0), 0);
        const sorted = [...orders].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        // Top product
        const productMap: Record<string, number> = {};
        orders.forEach((o) => {
          (o.items ?? []).forEach((it) => {
            productMap[it.name] = (productMap[it.name] ?? 0) + it.quantity;
          });
        });
        const topProduct =
          Object.entries(productMap).sort((a, b) => b[1] - a[1])[0]?.[0] ??
          null;

        setSummary({
          totalSpent,
          orderCount: orders.length,
          firstOrderDate: sorted[0]?.createdAt ?? null,
          topProduct,
        });
      })
      .catch(() => setError("No se pudo cargar el historial del cliente."))
      .finally(() => setLoading(false));
  }, [customerPhone]);

  if (!customerPhone) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--text-tertiary)]">
        Selecciona un cliente para ver su linea de tiempo.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white">
          <User className="h-5 w-5" />
        </div>
        <div>
          <p className="font-semibold text-[var(--text-primary)]">
            {customerName ?? "Cliente"}
          </p>
          <p className="text-sm text-[var(--text-tertiary)]">
            {customerPhone}
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[var(--rule-base)] bg-white p-3 dark:border-[var(--rule-base)] dark:bg-gray-900">
          <p className="text-lg font-bold text-primary">
            {fmt(summary.totalSpent)}
          </p>
          <p className="text-xs text-[var(--text-tertiary)]">
            Total gastado
          </p>
        </div>
        <div className="rounded-xl border border-[var(--rule-base)] bg-white p-3 dark:border-[var(--rule-base)] dark:bg-gray-900">
          <p className="text-lg font-bold text-primary">
            {summary.orderCount}
          </p>
          <p className="text-xs text-[var(--text-tertiary)]">Compras</p>
        </div>
        <div className="rounded-xl border border-[var(--rule-base)] bg-white p-3 dark:border-[var(--rule-base)] dark:bg-gray-900">
          <p className="text-lg font-bold text-primary">
            {summary.firstOrderDate
              ? `${daysSince(summary.firstOrderDate)}d`
              : "—"}
          </p>
          <p className="text-xs text-[var(--text-tertiary)]">
            Antiguedad
          </p>
        </div>
        <div className="rounded-xl border border-[var(--rule-base)] bg-white p-3 dark:border-[var(--rule-base)] dark:bg-gray-900">
          <p
            className="truncate text-sm font-bold text-primary"
            title={summary.topProduct ?? "—"}
          >
            {summary.topProduct ?? "—"}
          </p>
          <p className="text-xs text-[var(--text-tertiary)]">
            Producto favorito
          </p>
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <LoadingState />
      ) : error ? (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 dark:border-[var(--data-error-500)]/30 dark:bg-[var(--data-error-500)]/10">
          <AlertCircle className="h-5 w-5 text-[var(--data-error-500)]" />
          <p className="text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">{error}</p>
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-[var(--rule-base)] bg-white p-8 text-center dark:border-[var(--rule-base)] dark:bg-gray-900">
          <p className="text-sm text-[var(--text-tertiary)]">
            No hay eventos registrados para este cliente.
          </p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-4 top-0 h-full w-0.5 bg-[var(--surface-sunken)]" />

          <div className="space-y-4 pl-10">
            {events.map((ev) => {
              const cfg = EVENT_CONFIG[ev.type];
              const Icon = cfg.icon;
              return (
                <div key={ev.id} className="relative">
                  {/* Dot */}
                  <div
                    className={cn(
                      "absolute -left-[34px] flex h-7 w-7 items-center justify-center rounded-full border-2 border-white dark:border-gray-950",
                      cfg.bg
                    )}
                  >
                    <Icon className={cn("h-3.5 w-3.5", cfg.color)} />
                  </div>

                  {/* Card */}
                  <div className="rounded-xl border border-[var(--rule-base)] bg-white p-4 dark:border-[var(--rule-base)] dark:bg-gray-900">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--text-primary)]">
                          {ev.title}
                        </p>
                        <p className="mt-0.5 text-sm text-[var(--text-tertiary)]">
                          {ev.detail}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {ev.amount !== undefined && (
                          <p className="font-semibold text-primary">
                            {fmt(ev.amount)}
                          </p>
                        )}
                        <p className="text-xs text-[var(--text-tertiary)]">{fmtDate(ev.date)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
