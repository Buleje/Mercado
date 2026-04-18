"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Users,
  AlertTriangle,
  CreditCard,
  ShieldAlert,
  ArrowRight,
} from "@buleje/design-system/icons";
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
    <div className="h-20 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)]/40 animate-pulse" />
  );
}

function SkeletonRow() {
  return (
    <div className="h-12 rounded border border-[var(--rule-base)] bg-[var(--surface-sunken)]/30 animate-pulse" />
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
    emerald: "text-[var(--data-success)]",
    red: "text-red-500",
    amber: "text-amber-500",
    gray: "text-[var(--text-tertiary)]",
  }[accent];

  const valueColor = {
    emerald: "text-[var(--data-success)] dark:text-[var(--data-success)]",
    red: "text-red-700 dark:text-red-400",
    amber: "text-amber-700 dark:text-amber-400",
    gray: "text-[var(--text-primary)]",
  }[accent];

  return (
    <div className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("w-4 h-4 shrink-0", iconColor)} />
        <span className="text-xs text-[var(--text-tertiary)] truncate">{label}</span>
      </div>
      <p className={cn("text-xl font-semibold leading-none", valueColor)}>{value}</p>
      {sub && (
        <p className="text-xs text-[var(--text-tertiary)] mt-1">{sub}</p>
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
        "bg-[var(--data-error-50)] text-[var(--data-error)] border border-[var(--data-error)] dark:bg-red-950/30 dark:text-[var(--data-error)] dark:border-[var(--data-error)]",
    },
    ACTIVO: {
      label: "Activo",
      className:
        "bg-[var(--accent-soft)] text-[var(--data-success)] border border-[var(--data-success)]/30 dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)] dark:border-[var(--data-success)]/30",
    },
    PAGADO: {
      label: "Pagado",
      className:
        "bg-gray-50 text-[var(--text-secondary)] border border-[var(--rule-base)] dark:bg-gray-800 dark:text-[var(--text-tertiary)] dark:border-[var(--rule-base)]",
    },
    CANCELADO: {
      label: "Cancelado",
      className:
        "bg-gray-50 text-[var(--text-tertiary)] border border-[var(--rule-base)] dark:bg-gray-800 dark:text-[var(--text-secondary)] dark:border-[var(--rule-base)] line-through",
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
      <span className="text-xs text-[var(--data-error)] dark:text-[var(--data-error)]">
        Vencido hace {n} {n === 1 ? "dia" : "dias"}
      </span>
    );
  }

  if (entry.status === "ACTIVO" && entry.dueDate) {
    const d = daysDiff(entry.dueDate);
    if (d < 0) {
      const n = Math.abs(d);
      return (
        <span className="text-xs text-[var(--data-error)] dark:text-[var(--data-error)]">
          Vencido hace {n} {n === 1 ? "dia" : "dias"}
        </span>
      );
    }
    if (d === 0) {
      return (
        <span className="text-xs text-[var(--data-warning)] dark:text-[var(--data-warning)]">
          Vence hoy
        </span>
      );
    }
    return (
      <span className="text-xs text-[var(--text-tertiary)]">
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
                ? "bg-[var(--accent-soft)] text-[var(--data-success)] border-[var(--data-success)]/30 dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)] dark:border-[var(--data-success)]/30"
                : "bg-white text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-gray-300 dark:bg-gray-900 dark:text-[var(--text-tertiary)] dark:border-[var(--rule-base)] dark:hover:border-gray-600"
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
        <div className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] py-10 text-center">
          <p className="text-sm text-[var(--text-tertiary)]">
            No hay fiados registrados
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)]/50">
            <span className="text-xs text-[var(--text-tertiary)]">Cliente</span>
            <span className="text-xs text-[var(--text-tertiary)] text-right">Monto</span>
            <span className="text-xs text-[var(--text-tertiary)]">Estado</span>
            <span className="text-xs text-[var(--text-tertiary)]">Plazo</span>
          </div>

          {/* Rows */}
          <ul>
            {filtered.map((entry, idx) => (
              <li
                key={entry.id}
                className={cn(
                  "grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-4 py-3",
                  idx !== filtered.length - 1 &&
                    "border-b border-[var(--rule-base)]"
                )}
              >
                {/* Customer name */}
                <span
                  className="text-sm text-[var(--text-primary)] truncate"
                  title={entry.customerName ?? "—"}
                >
                  {entry.customerName ?? "—"}
                </span>

                {/* Balance */}
                <span
                  className={cn(
                    "text-sm font-medium text-right tabular-nums",
                    isVencido(entry)
                      ? "text-[var(--data-error)] dark:text-[var(--data-error)]"
                      : "text-[var(--text-secondary)]"
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
      <div className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-[var(--text-tertiary)]">
          Para cobrar, ajustar limites o ver historial completo
        </p>
        <button
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded border border-[var(--data-success)]/30 text-[var(--data-success)] dark:text-[var(--data-success)] dark:border-[var(--data-success)]/30 hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] transition-colors shrink-0"
          onClick={() => {}}
        >
          Ir a Gestion de Fiados
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
