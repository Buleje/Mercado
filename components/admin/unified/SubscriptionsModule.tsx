"use client";

import { DataTable, LoadingState } from "@buleje/design-system";
/**
 * SubscriptionsModule — Bodega al Mes (suscripciones recurrentes).
 *
 * Admin bridge para ENRICH-5 / ADR-076: expone las suscripciones "Bodega al
 * Mes" que los clientes contratan desde el marketplace. KPIs (backend
 * `/api/admin/subscriptions/stats`) + lista real (`/api/admin/subscriptions`,
 * enriquecida por `SubscriptionsDB.listForTenantAdmin`) + acciones que
 * escriben de verdad contra `/api/admin/subscriptions/[id]`.
 *
 * Tabs:
 *   - Activas   → suscripciones vigentes
 *   - Pausadas  → suspendidas temporalmente
 *   - Canceladas → histórico
 *
 * No hay tab "Planes": el modelo real (`Subscription`) es por producto +
 * frecuencia + descuento, no por tiers fijos (básico/estándar/premium) — esa
 * idea no tiene backend. Mostrarla habría sido inventar datos.
 */

import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Repeat,
  DollarSign,
  Users,
  TrendingUp,
  Calendar,
  Pause,
  Play,
  X,
  Download,
  Search,
  CheckCircle,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import KPICard from "@/components/admin/shared/KPICard";

// ── Types ───────────────────────────────────────────────────────────────────

type SubStatus = "active" | "paused" | "cancelled";
type SubFrequency = "weekly" | "biweekly" | "monthly" | "bimonthly";

interface Subscription {
  id: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  frequency: SubFrequency;
  status: SubStatus;
  startDate: string;
  nextBilling: string;
  monthlyAmount: number;
}

interface SubscriptionStats {
  active: number;
  paused: number;
  cancelled: number;
  mrrEstimated: number;
}

// ── Constants ─────────────────────────────────────────────────────────────

const FREQUENCY_LABELS: Record<SubFrequency, string> = {
  weekly: "Semanal",
  biweekly: "Quincenal",
  monthly: "Mensual",
  bimonthly: "Bimestral",
};

const STATUS_STYLES: Record<SubStatus, string> = {
  active: "bg-[var(--data-success-100)] text-[var(--data-success-500)]",
  paused: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]",
  cancelled: "bg-gray-100 text-[var(--text-secondary)]",
};

const STATUS_LABELS: Record<SubStatus, string> = {
  active: "Activa",
  paused: "Pausada",
  cancelled: "Cancelada",
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function exportCSV(rows: Subscription[]) {
  const headers = ["ID", "Cliente", "Teléfono", "Producto", "Frecuencia", "Estado", "Inicio", "Próximo cobro", "Monto mensual"];
  const csvRows = rows.map((r) => [
    r.id,
    r.customerName,
    r.customerPhone,
    r.productName,
    FREQUENCY_LABELS[r.frequency],
    STATUS_LABELS[r.status],
    r.startDate,
    r.nextBilling,
    Number(r.monthlyAmount).toFixed(2),
  ]);
  const csv = [headers, ...csvRows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `suscripciones_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Sub-tab: Lista ──────────────────────────────────────────────────────────

function SubscriptionList({
  subs,
  onAction,
}: {
  subs: Subscription[];
  onAction: (id: string, action: "pausar" | "reanudar" | "cancelar") => void;
}) {
  const [search, setSearch] = useState("");
  const [freqFilter, setFreqFilter] = useState<SubFrequency | "all">("all");

  const filtered = useMemo(() => {
    return subs.filter((s) => {
      if (freqFilter !== "all" && s.frequency !== freqFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        s.customerName.toLowerCase().includes(q) ||
        s.customerPhone.includes(q) ||
        s.productName.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
      );
    });
  }, [subs, search, freqFilter]);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            type="search"
            placeholder="Buscar por cliente, teléfono, producto o ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
          />
        </div>
        <select
          value={freqFilter}
          onChange={(e) => setFreqFilter(e.target.value as SubFrequency | "all")}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm cursor-pointer"
        >
          <option value="all">Todas las frecuencias</option>
          <option value="weekly">Semanal</option>
          <option value="biweekly">Quincenal</option>
          <option value="monthly">Mensual</option>
          <option value="bimonthly">Bimestral</option>
        </select>
        <button
          onClick={() => exportCSV(filtered)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-[var(--text-primary)] bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          <Download className="h-4 w-4" />
          Exportar
        </button>
      </div>

      {/* Tabla */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-tertiary)]">
          <Repeat className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin suscripciones registradas</p>
          <p className="text-xs mt-1">Los clientes que contraten Bodega al Mes aparecerán aquí.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-[var(--color-card)] border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <DataTable className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide hidden sm:table-cell">Producto</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide hidden md:table-cell">Frecuencia</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Monto/mes</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide hidden md:table-cell">Próximo cobro</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Estado</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-bold text-[var(--text-primary)]">{s.customerName}</p>
                      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{s.customerPhone}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                        {s.productName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] hidden md:table-cell">
                      {FREQUENCY_LABELS[s.frequency]}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-[var(--text-primary)]">
                      {fmt(s.monthlyAmount)}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] hidden md:table-cell">
                      {fmtDate(s.nextBilling)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-bold", STATUS_STYLES[s.status])}>
                        {STATUS_LABELS[s.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {s.status === "active" && (
                          <button
                            onClick={() => onAction(s.id, "pausar")}
                            className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-warning-500)] hover:bg-[var(--data-warning-50)] transition-colors"
                            title="Pausar"
                          >
                            <Pause className="h-4 w-4" />
                          </button>
                        )}
                        {s.status === "paused" && (
                          <button
                            onClick={() => onAction(s.id, "reanudar")}
                            className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-success-500)] hover:bg-[var(--data-success-50)] transition-colors"
                            title="Reanudar"
                          >
                            <Play className="h-4 w-4" />
                          </button>
                        )}
                        {s.status !== "cancelled" && (
                          <button
                            onClick={() => onAction(s.id, "cancelar")}
                            className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] transition-colors"
                            title="Cancelar"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

const MODULE_ID = "subscriptions";

const TABS = [
  { id: "activas", label: "Activas", icon: CheckCircle },
  { id: "pausadas", label: "Pausadas", icon: Pause },
  { id: "canceladas", label: "Canceladas", icon: X },
];

const ACTION_TO_STATUS: Record<"pausar" | "reanudar" | "cancelar", SubStatus> = {
  pausar: "paused",
  reanudar: "active",
  cancelar: "cancelled",
};

export default function SubscriptionsModule() {
  const [tab, setTab] = useState(TABS[0].id);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [stats, setStats] = useState<SubscriptionStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    Promise.all([
      fetch("/api/admin/subscriptions", { credentials: "include", signal: ac.signal }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/admin/subscriptions/stats", { credentials: "include", signal: ac.signal }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([list, statsRes]) => {
        if (list?.items) setSubs(list.items as Subscription[]);
        if (statsRes) {
          setStats({
            active: statsRes.active,
            paused: statsRes.paused,
            cancelled: statsRes.cancelled,
            mrrEstimated: statsRes.mrrEstimated,
          });
        }
      })
      .catch((e) => { if ((e as Error).name !== "AbortError") toast.error("No se pudieron cargar las suscripciones"); })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, []);

  const handleAction = async (id: string, action: "pausar" | "reanudar" | "cancelar") => {
    const newStatus = ACTION_TO_STATUS[action];
    const prev = subs;
    setSubs((cur) => cur.map((s) => (s.id === id ? { ...s, status: newStatus } : s)));

    try {
      const res = await fetch(`/api/admin/subscriptions/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? body?.error ?? `HTTP ${res.status}`);
      }
      toast.success(
        action === "pausar" ? "Suscripción pausada" : action === "reanudar" ? "Suscripción reanudada" : "Suscripción cancelada",
      );
    } catch (err) {
      setSubs(prev);
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar la suscripción");
    }
  };

  if (loading) return <LoadingState />;

  // KPIs
  const activas = subs.filter((s) => s.status === "active");
  const pausadas = subs.filter((s) => s.status === "paused");
  const canceladas = subs.filter((s) => s.status === "cancelled");
  const nuevosEsteMes = subs.filter((s) => {
    const start = new Date(s.startDate);
    const now = new Date();
    return start.getMonth() === now.getMonth() && start.getFullYear() === now.getFullYear();
  }).length;

  const filteredByTab =
    tab === "activas"
      ? activas
      : tab === "pausadas"
        ? pausadas
        : tab === "canceladas"
          ? canceladas
          : [];

  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Bodega al Mes"
        description="Suscripciones recurrentes de canastas mensuales"
        icon={Repeat}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label="Suscripciones activas"
          value={stats?.active ?? activas.length}
          icon={Users}
          color="var(--accent)"
          subtitle="Vigentes hoy"
        />
        <KPICard
          label="MRR estimado"
          value={fmt(stats?.mrrEstimated ?? 0)}
          icon={DollarSign}
          color="#10B981"
          subtitle="Ingreso recurrente mensual"
        />
        <KPICard
          label="Nuevas este mes"
          value={nuevosEsteMes}
          icon={TrendingUp}
          color="#3B82F6"
          subtitle="Altas del periodo actual"
        />
        <KPICard
          label="Pausadas / canceladas"
          value={(stats?.paused ?? pausadas.length) + (stats?.cancelled ?? canceladas.length)}
          icon={Calendar}
          color="#ff6b5b"
          subtitle="Requieren seguimiento"
        />
      </div>

      <AdminTabBar
        tabs={TABS}
        activeTab={tab}
        onTabChange={(id) => setTab(id)}
        moduleId={MODULE_ID}
      >
        {tab === "activas" && <SubscriptionList subs={filteredByTab} onAction={handleAction} />}
        {tab === "pausadas" && <SubscriptionList subs={filteredByTab} onAction={handleAction} />}
        {tab === "canceladas" && <SubscriptionList subs={filteredByTab} onAction={handleAction} />}
      </AdminTabBar>
    </div>
  );
}
