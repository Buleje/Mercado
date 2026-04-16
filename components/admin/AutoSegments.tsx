"use client";
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
} from "lucide-react";
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
        color: "text-amber-600 dark:text-amber-400",
        bg: "bg-amber-50 dark:bg-amber-900/20",
        border: "border-amber-200 dark:border-amber-800",
      },
      {
        key: "regular",
        label: "Regular",
        description: "Entre S/100 y S/500 al mes",
        icon: ShoppingCart,
        color: "text-[#00B4A6] dark:text-emerald-400",
        bg: "bg-emerald-50 dark:bg-emerald-900/20",
        border: "border-emerald-200 dark:border-emerald-800",
      },
      {
        key: "ocasional",
        label: "Ocasional",
        description: "Menos de S/100 al mes",
        icon: User,
        color: "text-emerald-600 dark:text-emerald-400",
        bg: "bg-emerald-50 dark:bg-emerald-900/20",
        border: "border-emerald-200 dark:border-emerald-800",
      },
      {
        key: "nuevo",
        label: "Nuevo",
        description: "Primera compra en los ultimos 30 dias",
        icon: UserPlus,
        color: "text-purple-600 dark:text-purple-400",
        bg: "bg-purple-50 dark:bg-purple-900/20",
        border: "border-purple-200 dark:border-purple-800",
      },
      {
        key: "inactivo",
        label: "Inactivo",
        description: "Sin compras en mas de 60 dias",
        icon: Moon,
        color: "text-gray-500 dark:text-gray-400",
        bg: "bg-gray-50 dark:bg-gray-800",
        border: "border-gray-200 dark:border-gray-700",
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
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Segmentacion Automatica
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Clasifica tus clientes automaticamente segun su comportamiento de
            compra
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Actualizar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-[#00B4A6]" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/30 dark:bg-red-900/10">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
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
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white dark:bg-gray-900",
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
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-600 shadow-sm dark:bg-gray-900 dark:text-gray-300">
                        {seg.customers.length} clientes
                      </span>
                      <span className="text-xs text-gray-400">{pct}%</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {seg.description}
                    </p>
                    <div className="mt-1.5 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <span>Revenue: {fmt(seg.revenue)}</span>
                      <span>({revPct}% del total)</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-gray-400">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </div>
                </button>

                {/* Expanded customer list */}
                {isExpanded && (
                  <div className="border-t border-gray-200/50 p-4 dark:border-gray-700/50">
                    {seg.customers.length === 0 ? (
                      <p className="text-center text-sm text-gray-400">
                        No hay clientes en este segmento.
                      </p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {seg.customers.map((c) => (
                          <div
                            key={c.phone}
                            className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm dark:bg-gray-900"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                                {c.name}
                              </p>
                              <p className="text-xs text-gray-400">{c.phone}</p>
                            </div>
                            <span className="ml-2 shrink-0 text-sm font-semibold text-[#00B4A6]">
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
