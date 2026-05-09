"use client";
import { LoadingState, SectionTitle } from "@buleje/design-system";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useMemo } from "react";
import {
  Crown,
  ShoppingCart,
  Moon,
  UserPlus,
  User,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────────

type Customer = {
  phone: string;
  name: string;
  totalSpent?: number;
  _orderCount?: number;
  _lastOrder?: string | null;
  loyaltyTier?: string;
};

type SegmentKey = "vip" | "regular" | "ocasional" | "nuevo" | "inactivo";

type SegmentInfo = {
  key: SegmentKey;
  label: string;
  description: string;
  icon: typeof Crown;
  color: string;
  bg: string;
  border: string;
  customers: Customer[];
  revenue: number;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 999;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function classifyCustomer(c: Customer): SegmentKey {
  const spent = c.totalSpent ?? 0;
  const orders = c._orderCount ?? 0;
  const lastDays = daysSince(c._lastOrder);

  if (lastDays > 60) return "inactivo";
  if (lastDays <= 30 && orders === 1) return "nuevo";
  if (spent > 500 || orders > 20) return "vip";
  if (spent >= 100) return "regular";
  return "ocasional";
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AutoSegments() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<SegmentKey | null>(null);

  const fetchData = () => {
    setLoading(true);
    setError("");
    fetch("/api/customers?limit=500&includeStats=true")
      .then((r) => r.json())
      .then((data) => {
        const list: Customer[] = Array.isArray(data)
          ? data
          : (data.customers ?? data.data ?? []);
        setCustomers(list);
      })
      .catch(() => setError("No se pudieron cargar los clientes."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const segments = useMemo<SegmentInfo[]>(() => {
    const _totalRevenue = customers.reduce(
      (s, c) => s + (c.totalSpent ?? 0),
      0
    );

    const SEGMENT_DEFS: Omit<SegmentInfo, "customers" | "revenue">[] = [
      {
        key: "vip",
        label: "VIP",
        description: "Mas de S/500/mes o mas de 20 pedidos",
        icon: Crown,
        color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
        bg: "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20",
        border: "border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]",
      },
      {
        key: "regular",
        label: "Regular",
        description: "Entre S/100 y S/500 al mes",
        icon: ShoppingCart,
        color: "text-primary dark:text-[var(--data-success-500)]",
        bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",
        border: "border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30",
      },
      {
        key: "ocasional",
        label: "Ocasional",
        description: "Menos de S/100 al mes",
        icon: User,
        color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
        bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",
        border: "border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30",
      },
      {
        key: "nuevo",
        label: "Nuevo",
        description: "Primera compra en los últimos 30 días",
        icon: UserPlus,
        color: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
        bg: "bg-[var(--surface-sunken)]",
        border: "border-[var(--rule-base)]",
      },
      {
        key: "inactivo",
        label: "Inactivo",
        description: "Sin compras en mas de 60 dias",
        icon: Moon,
        color: "text-[var(--text-tertiary)]",
        bg: "bg-[var(--surface-sunken)]",
        border: "border-[var(--rule-base)]",
      },
    ];

    const grouped: Record<SegmentKey, Customer[]> = {
      vip: [],
      regular: [],
      ocasional: [],
      nuevo: [],
      inactivo: [],
    };

    customers.forEach((c) => {
      const key = classifyCustomer(c);
      grouped[key].push(c);
    });

    return SEGMENT_DEFS.map((def) => {
      const segCustomers = grouped[def.key];
      const revenue = segCustomers.reduce(
        (s, c) => s + (c.totalSpent ?? 0),
        0
      );
      return { ...def, customers: segCustomers, revenue };
    });
  }, [customers]);

  const _totalRevenue = customers.reduce(
    (s, c) => s + (c.totalSpent ?? 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <SectionTitle className="text-xl font-bold text-[var(--text-primary)]">
            Segmentacion Automatica
          </SectionTitle>
          <p className="text-sm text-[var(--text-tertiary)]">
            Clasifica tus clientes automaticamente segun su comportamiento de
            compra
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-[var(--rule-base)] px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-alt)] disabled:opacity-50 dark:border-[var(--rule-base)] dark:text-[var(--text-tertiary)] dark:hover:bg-gray-800"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Actualizar
        </button>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 dark:border-[var(--data-error-500)]/30 dark:bg-[var(--data-error-500)]/10">
          <AlertCircle className="h-5 w-5 text-[var(--data-error-500)]" />
          <p className="text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">{error}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {segments.map((seg) => {
            const Icon = seg.icon;
            const pct =
              customers.length > 0
                ? Math.round((seg.customers.length / customers.length) * 100)
                : 0;
            const revPct =
              _totalRevenue > 0
                ? Math.round((seg.revenue / _totalRevenue) * 100)
                : 0;
            const isExpanded = expanded === seg.key;

            return (
              <div
                key={seg.key}
                className={cn(
                  "rounded-xl border transition",
                  seg.border,
                  seg.bg
                )}
              >
                <button
                  onClick={() =>
                    setExpanded(isExpanded ? null : seg.key)
                  }
                  className="flex w-full items-center gap-4 p-4 text-left"
                >
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-raised)]",
                      seg.color
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("font-semibold", seg.color)}>
                        {seg.label}
                      </span>
                      <span className="rounded-full bg-white dark:bg-[var(--color-card)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]  dark:bg-gray-900 dark:text-[var(--text-tertiary)]">
                        {seg.customers.length} clientes
                      </span>
                      <span className="text-xs text-[var(--text-tertiary)]">{pct}%</span>
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)]">
                      {seg.description}
                    </p>
                    <div className="mt-1.5 flex items-center gap-4 text-xs text-[var(--text-tertiary)]">
                      <span>Revenue: {fmt(seg.revenue)}</span>
                      <span>({revPct}% del total)</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-[var(--text-tertiary)]">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </div>
                </button>

                {/* Expanded customer list */}
                {isExpanded && (
                  <div className="border-t border-[var(--rule-base)]/50 p-4 dark:border-[var(--rule-base)]">
                    {seg.customers.length === 0 ? (
                      <p className="text-center text-sm text-[var(--text-tertiary)]">
                        No hay clientes en este segmento.
                      </p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {seg.customers.map((c) => (
                          <div
                            key={c.phone}
                            className="flex items-center justify-between rounded-lg bg-white px-3 py-2  dark:bg-gray-900"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                                {c.name}
                              </p>
                              <p className="text-xs text-[var(--text-tertiary)]">{c.phone}</p>
                            </div>
                            <span className="ml-2 shrink-0 text-sm font-semibold text-primary">
                              {fmt(c.totalSpent ?? 0)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
