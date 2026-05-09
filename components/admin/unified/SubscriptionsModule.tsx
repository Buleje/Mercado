"use client";

import { CardTitle } from "@buleje/design-system";
/**
 * SubscriptionsModule — Bodega al Mes (suscripciones recurrentes).
 *
 * Bridge admin para ENRICH-5: expone las suscripciones "Bodega al Mes" que
 * los clientes contratan desde el marketplace. KPIs + lista + acciones.
 *
 * Tabs:
 *   - Activas  → lista de suscripciones vigentes
 *   - Planes   → catálogo de planes ofrecidos
 *   - Pausadas → suspendidas temporalmente
 *   - Canceladas → histórico
 */

import { useState, useMemo } from "react";
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
  AlertCircle,
  CheckCircle,
  Package,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import KPICard from "@/components/admin/shared/KPICard";

// ── Types ───────────────────────────────────────────────────────────────────

type SubStatus = "activa" | "pausada" | "cancelada" | "prueba";
type SubPlan = "básico" | "estandar" | "premium";

interface Subscription {
  id: string;
  customerName: string;
  customerPhone: string;
  plan: SubPlan;
  status: SubStatus;
  startDate: string;
  nextBilling: string;
  monthlyAmount: number;
  totalBilled: number;
  deliveryDay: string;
  lastDelivery?: string;
}

interface PlanCatalog {
  id: SubPlan;
  label: string;
  monthlyPrice: number;
  description: string;
  itemsCount: number;
  activeSubs: number;
}

// ── Mock data (bridge a API real cuando esté disponible) ────────────────────

const MOCK_SUBS: Subscription[] = [
  {
    id: "SUB-001",
    customerName: "María López",
    customerPhone: "987654321",
    plan: "estandar",
    status: "activa",
    startDate: "2025-11-10",
    nextBilling: "2026-05-10",
    monthlyAmount: 180,
    totalBilled: 1080,
    deliveryDay: "Viernes",
    lastDelivery: "2026-04-10",
  },
  {
    id: "SUB-002",
    customerName: "Juan Pérez",
    customerPhone: "912345678",
    plan: "premium",
    status: "activa",
    startDate: "2025-09-15",
    nextBilling: "2026-05-15",
    monthlyAmount: 350,
    totalBilled: 2450,
    deliveryDay: "Lunes",
    lastDelivery: "2026-04-15",
  },
  {
    id: "SUB-003",
    customerName: "Carlos Ramírez",
    customerPhone: "998877665",
    plan: "básico",
    status: "pausada",
    startDate: "2025-12-01",
    nextBilling: "2026-05-01",
    monthlyAmount: 95,
    totalBilled: 380,
    deliveryDay: "Miércoles",
  },
  {
    id: "SUB-004",
    customerName: "Ana Torres",
    customerPhone: "965432109",
    plan: "estandar",
    status: "prueba",
    startDate: "2026-04-01",
    nextBilling: "2026-05-01",
    monthlyAmount: 180,
    totalBilled: 0,
    deliveryDay: "Viernes",
  },
];

const PLANS: PlanCatalog[] = [
  {
    id: "básico",
    label: "Básico",
    monthlyPrice: 95,
    description: "Canasta esencial mensual (10 productos de uso diario)",
    itemsCount: 10,
    activeSubs: 14,
  },
  {
    id: "estandar",
    label: "Estándar",
    monthlyPrice: 180,
    description: "Canasta familiar mensual (20 productos variados)",
    itemsCount: 20,
    activeSubs: 23,
  },
  {
    id: "premium",
    label: "Premium",
    monthlyPrice: 350,
    description: "Canasta completa mensual (35 productos + premium picks)",
    itemsCount: 35,
    activeSubs: 8,
  },
];

const PLAN_LABELS: Record<SubPlan, string> = {
  básico: "Básico",
  estandar: "Estándar",
  premium: "Premium",
};

const STATUS_STYLES: Record<SubStatus, string> = {
  activa: "bg-[var(--data-success-100)] text-[var(--data-success-500)]",
  pausada: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]",
  cancelada: "bg-gray-100 text-[var(--text-secondary)]",
  prueba: "bg-[var(--data-info-100)] text-[var(--data-info-500)]",
};

const STATUS_LABELS: Record<SubStatus, string> = {
  activa: "Activa",
  pausada: "Pausada",
  cancelada: "Cancelada",
  prueba: "En prueba",
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
  const headers = ["ID", "Cliente", "Teléfono", "Plan", "Estado", "Inicio", "Próximo cobro", "Monto mensual", "Total facturado"];
  const csvRows = rows.map((r) => [
    r.id,
    r.customerName,
    r.customerPhone,
    PLAN_LABELS[r.plan],
    STATUS_LABELS[r.status],
    r.startDate,
    r.nextBilling,
    Number(r.monthlyAmount).toFixed(2),
    Number(r.totalBilled).toFixed(2),
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
  const [planFilter, setPlanFilter] = useState<SubPlan | "all">("all");

  const filtered = useMemo(() => {
    return subs.filter((s) => {
      if (planFilter !== "all" && s.plan !== planFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        s.customerName.toLowerCase().includes(q) ||
        s.customerPhone.includes(q) ||
        s.id.toLowerCase().includes(q)
      );
    });
  }, [subs, search, planFilter]);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            type="search"
            placeholder="Buscar por cliente, teléfono o ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
          />
        </div>
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value as SubPlan | "all")}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm cursor-pointer"
        >
          <option value="all">Todos los planes</option>
          <option value="básico">Básico</option>
          <option value="estandar">Estándar</option>
          <option value="premium">Premium</option>
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
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide hidden sm:table-cell">Plan</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Monto/mes</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide hidden md:table-cell">Próximo cobro</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide hidden md:table-cell">Día entrega</th>
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
                        {PLAN_LABELS[s.plan]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-[var(--text-primary)]">
                      {fmt(s.monthlyAmount)}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] hidden md:table-cell">
                      {fmtDate(s.nextBilling)}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] hidden md:table-cell">
                      {s.deliveryDay}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-bold", STATUS_STYLES[s.status])}>
                        {STATUS_LABELS[s.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {s.status === "activa" && (
                          <button
                            onClick={() => onAction(s.id, "pausar")}
                            className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-warning-500)] hover:bg-[var(--data-warning-50)] transition-colors"
                            title="Pausar"
                          >
                            <Pause className="h-4 w-4" />
                          </button>
                        )}
                        {s.status === "pausada" && (
                          <button
                            onClick={() => onAction(s.id, "reanudar")}
                            className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-success-500)] hover:bg-[var(--data-success-50)] transition-colors"
                            title="Reanudar"
                          >
                            <Play className="h-4 w-4" />
                          </button>
                        )}
                        {s.status !== "cancelada" && (
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
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-tab: Planes ─────────────────────────────────────────────────────────

function PlansTab({ plans }: { plans: PlanCatalog[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 bg-[var(--data-info-50)] border border-[var(--data-info-500)] rounded-xl text-sm text-[var(--data-info-500)]">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Catálogo de planes Bodega al Mes</p>
          <p className="text-xs mt-0.5">Los cambios a planes se aplican a nuevas suscripciones. Las existentes mantienen su precio.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((p) => (
          <div
            key={p.id}
            className="bg-white dark:bg-[var(--color-card)] border border-gray-200 rounded-2xl p-5 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <CardTitle className="font-extrabold text-[var(--text-primary)] text-lg">{p.label}</CardTitle>
              <Package className="h-5 w-5 text-primary" />
            </div>
            <p className="text-3xl font-extrabold text-[var(--text-primary)] mb-1">{fmt(p.monthlyPrice)}</p>
            <p className="text-xs text-[var(--text-secondary)] mb-4">al mes</p>
            <p className="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">{p.description}</p>

            <div className="space-y-2 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)]">Productos incluidos</span>
                <span className="font-bold text-[var(--text-primary)]">{p.itemsCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)]">Suscripciones activas</span>
                <span className="font-bold text-primary">{p.activeSubs}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)]">Ingresos mes</span>
                <span className="font-bold text-[var(--text-primary)]">{fmt(p.activeSubs * p.monthlyPrice)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

const MODULE_ID = "subscriptions";

const TABS = [
  { id: "activas", label: "Activas", icon: CheckCircle },
  { id: "pausadas", label: "Pausadas", icon: Pause },
  { id: "canceladas", label: "Canceladas", icon: X },
  { id: "planes", label: "Planes", icon: Package },
];

export default function SubscriptionsModule() {
  const [tab, setTab] = useState(TABS[0].id);
  const [subs, setSubs] = useState<Subscription[]>(MOCK_SUBS);

  const handleAction = (id: string, action: "pausar" | "reanudar" | "cancelar") => {
    setSubs((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        if (action === "pausar") return { ...s, status: "pausada" as const };
        if (action === "reanudar") return { ...s, status: "activa" as const };
        return { ...s, status: "cancelada" as const };
      })
    );
  };

  // KPIs
  const activas = subs.filter((s) => s.status === "activa" || s.status === "prueba");
  const pausadas = subs.filter((s) => s.status === "pausada");
  const canceladas = subs.filter((s) => s.status === "cancelada");
  const mrr = activas.reduce((sum, s) => sum + s.monthlyAmount, 0);
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
          value={activas.length}
          icon={Users}
          color="var(--accent)"
          subtitle="Incluye periodo de prueba"
        />
        <KPICard
          label="MRR estimado"
          value={fmt(mrr)}
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
          value={pausadas.length + canceladas.length}
          icon={Calendar}
          color="#F59E0B"
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
        {tab === "planes" && <PlansTab plans={PLANS} />}
      </AdminTabBar>
    </div>
  );
}
