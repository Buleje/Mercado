"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Users,
  AlertTriangle,
  CreditCard,
  ShieldAlert,
  ArrowRight,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type FiadoEntry = {
  id: string;
  customerName?: string;
  balance?: number;
  status?: "ACTIVO" | "PAGADO" | "VENCIDO" | "CANCELADO";
  dueDate?: string;
  createdAt?: string;
};

type FilterKey = "todos" | "vencidos" | "por-vencer" | "al-dia";

type RiskLevel = "ALTO" | "MEDIO" | "BAJO";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysDiff(dateStr: string): number {
  return Math.floor(
    (new Date(dateStr).getTime() - Date.now()) / 86_400_000
  );
}

function daysOverdue(dateStr: string): number {
  return Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 86_400_000
  );
}

function getRiskLevel(vencidos: number, activos: number): RiskLevel {
  const total = vencidos + activos;
  if (total === 0) return "BAJO";
  const pct = vencidos / total;
  if (pct > 0.3) return "ALTO";
  if (pct >= 0.1) return "MEDIO";
  return "BAJO";
}

function isVencido(f: FiadoEntry): boolean {
  return f.status === "VENCIDO";
}

function isPorVencer(f: FiadoEntry): boolean {
  if (f.status !== "ACTIVO" || !f.dueDate) return false;
  const d = daysDiff(f.dueDate);
  return d >= 0 && d <= 7;
}

function isAlDia(f: FiadoEntry): boolean {
  if (f.status !== "ACTIVO" || !f.dueDate) return false;
  return daysDiff(f.dueDate) > 7;
}

function sortFiados(list: FiadoEntry[]): FiadoEntry[] {
  return [...list].sort((a, b) => {
    const aVenc = isVencido(a) ? 0 : 1;
    const bVenc = isVencido(b) ? 0 : 1;
    if (aVenc !== bVenc) return aVenc - bVenc;
    return (b.balance ?? 0) - (a.balance ?? 0);
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SkeletonKPI() {
  return (
    <div className="h-20 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 animate-pulse" />
  );
}

function SkeletonRow() {
  return (
    <div className="h-12 rounded border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30 animate-pulse" />
  );
}

interface KPICardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent?: "emerald" | "red" | "amber" | "gray";
}

function KPICard({ icon: Icon, label, value, sub, accent = "gray" }: KPICardProps) {
  const iconColor = {
    emerald: "text-emerald-500",
    red: "text-red-500",
    amber: "text-amber-500",
    gray: "text-gray-400",
  }[accent];

  const valueColor = {
    emerald: "text-emerald-700 dark:text-emerald-400",
    red: "text-red-700 dark:text-red-400",
    amber: "text-amber-700 dark:text-amber-400",
    gray: "text-gray-800 dark:text-gray-100",
  }[accent];

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("w-4 h-4 shrink-0", iconColor)} />
        <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{label}</span>
      </div>
      <p className={cn("text-xl font-semibold leading-none", valueColor)}>{value}</p>
      {sub && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</p>
      )}
    </div>
  );
}

interface StatusBadgeProps {
  status: FiadoEntry["status"];
}

function StatusBadge({ status }: StatusBadgeProps) {
  const config: Record<
    NonNullable<FiadoEntry["status"]>,
    { label: string; className: string }
  > = {
    VENCIDO: {
      label: "Vencido",
      className:
        "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800",
    },
    ACTIVO: {
      label: "Activo",
      className:
        "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
    },
    PAGADO: {
      label: "Pagado",
      className:
        "bg-gray-50 text-gray-500 border border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
    },
    CANCELADO: {
      label: "Cancelado",
      className:
        "bg-gray-50 text-gray-400 border border-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-700 line-through",
    },
  };

  const { label, className } = config[status ?? "ACTIVO"] ?? config.ACTIVO;

  return (
    <span className={cn("text-xs px-2 py-0.5 rounded-full", className)}>
      {label}
    </span>
  );
}

interface DaysInfoProps {
  entry: FiadoEntry;
}

function DaysInfo({ entry }: DaysInfoProps) {
  if (!entry.dueDate && !entry.createdAt) return null;

  if (entry.status === "VENCIDO" && entry.dueDate) {
    const n = daysOverdue(entry.dueDate);
    return (
      <span className="text-xs text-red-600 dark:text-red-400">
        Vencido hace {n} {n === 1 ? "dia" : "dias"}
      </span>
    );
  }

  if (entry.status === "ACTIVO" && entry.dueDate) {
    const d = daysDiff(entry.dueDate);
    if (d < 0) {
      const n = Math.abs(d);
      return (
        <span className="text-xs text-red-600 dark:text-red-400">
          Vencido hace {n} {n === 1 ? "dia" : "dias"}
        </span>
      );
    }
    if (d === 0) {
      return (
        <span className="text-xs text-amber-600 dark:text-amber-400">
          Vence hoy
        </span>
      );
    }
    return (
      <span className="text-xs text-gray-500 dark:text-gray-400">
        Vence en {d} {d === 1 ? "dia" : "dias"}
      </span>
    );
  }

  return null;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FiadosSection() {
  const [fiados, setFiados] = useState<FiadoEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("todos");

  useEffect(() => {
    fetch("/api/fiados")
      .then((r) => (r.ok ? r.json() : { fiados: [] }))
      .then((d) => setFiados(Array.isArray(d) ? d : (d.fiados ?? [])))
      .catch(() => setFiados([]))
      .finally(() => setLoading(false));
  }, []);

  // ─── KPI derivations ──────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const active = fiados.filter(
      (f) => f.status === "ACTIVO" || f.status === "VENCIDO"
    );
    const vencidosList = fiados.filter(isVencido);

    const totalBalance = active.reduce((sum, f) => sum + (f.balance ?? 0), 0);
    const vencidosCount = vencidosList.length;
    const activosCount = fiados.filter((f) => f.status === "ACTIVO").length;

    const uniqueCustomers = new Set(
      active.map((f) => f.customerName ?? f.id)
    ).size;

    const risk = getRiskLevel(vencidosCount, activosCount);

    return { totalBalance, vencidosCount, uniqueCustomers, risk, activosCount };
  }, [fiados]);

  // ─── Filtered list ────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list: FiadoEntry[];
    switch (filter) {
      case "vencidos":
        list = fiados.filter(isVencido);
        break;
      case "por-vencer":
        list = fiados.filter(isPorVencer);
        break;
      case "al-dia":
        list = fiados.filter(isAlDia);
        break;
      default:
        list = fiados;
    }
    return sortFiados(list);
  }, [fiados, filter]);

  // ─── Filter buttons config ────────────────────────────────────────────────

  const filters: { key: FilterKey; label: string }[] = [
    { key: "todos", label: "Todos" },
    { key: "vencidos", label: "Vencidos" },
    { key: "por-vencer", label: "Por vencer" },
    { key: "al-dia", label: "Al dia" },
  ];

  const riskColor: Record<RiskLevel, string> = {
    ALTO: "red",
    MEDIO: "amber",
    BAJO: "emerald",
  } as const;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* KPI Row */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonKPI key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KPICard
            icon={CreditCard}
            label="Total fiados activos"
            value={formatCurrency(kpis.totalBalance)}
            sub={`${kpis.activosCount + kpis.vencidosCount} registros`}
            accent="gray"
          />
          <KPICard
            icon={AlertTriangle}
            label="Vencidos"
            value={String(kpis.vencidosCount)}
            sub={kpis.vencidosCount === 1 ? "cuenta" : "cuentas"}
            accent={kpis.vencidosCount > 0 ? "red" : "gray"}
          />
          <KPICard
            icon={Users}
            label="Clientes con fiado"
            value={String(kpis.uniqueCustomers)}
            sub="activos o vencidos"
            accent="gray"
          />
          <KPICard
            icon={ShieldAlert}
            label="Nivel de riesgo"
            value={kpis.risk}
            sub={
              kpis.risk === "ALTO"
                ? "Mas del 30% vencido"
                : kpis.risk === "MEDIO"
                ? "Entre 10-30% vencido"
                : "Menos del 10% vencido"
            }
            accent={riskColor[kpis.risk] as "red" | "amber" | "emerald"}
          />
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3 py-1 text-xs rounded border transition-colors",
              filter === f.key
                ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700 dark:hover:border-gray-600"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Fiados List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-10 text-center">
          <p className="text-sm text-gray-400 dark:text-gray-500">
            No hay fiados registrados
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
            <span className="text-xs text-gray-400 dark:text-gray-500">Cliente</span>
            <span className="text-xs text-gray-400 dark:text-gray-500 text-right">Monto</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">Estado</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">Plazo</span>
          </div>

          {/* Rows */}
          <ul>
            {filtered.map((entry, idx) => (
              <li
                key={entry.id}
                className={cn(
                  "grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-4 py-3",
                  idx !== filtered.length - 1 &&
                    "border-b border-gray-100 dark:border-gray-800"
                )}
              >
                {/* Customer name */}
                <span
                  className="text-sm text-gray-800 dark:text-gray-100 truncate"
                  title={entry.customerName ?? "—"}
                >
                  {entry.customerName ?? "—"}
                </span>

                {/* Balance */}
                <span
                  className={cn(
                    "text-sm font-medium text-right tabular-nums",
                    isVencido(entry)
                      ? "text-red-600 dark:text-red-400"
                      : "text-gray-700 dark:text-gray-200"
                  )}
                >
                  {formatCurrency(entry.balance ?? 0)}
                </span>

                {/* Status badge */}
                <StatusBadge status={entry.status} />

                {/* Days info */}
                <span className="text-right min-w-[90px]">
                  <DaysInfo entry={entry} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Deep-link Footer */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Para cobrar, ajustar limites o ver historial completo
        </p>
        <button
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded border border-emerald-500 text-emerald-600 dark:text-emerald-400 dark:border-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors shrink-0"
          onClick={() => {}}
        >
          Ir a Gestion de Fiados
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
