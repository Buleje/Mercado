"use client";

/**
 * SocioMembersAdminModule — Programa Socio Buleje.
 *
 * Bridge ENRICH-5 para el programa de membresía Socio Buleje.
 * KPIs de miembros, MRR, churn, etc. + catálogo de ofertas exclusivas.
 */

import { useState, useMemo, useEffect } from "react";
import {
  HeartHandshake,
  Users,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Download,
  Search,
  Eye,
  Package,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import KPICard from "@/components/admin/shared/KPICard";
import {
  MemberProfileDrawer,
  type SocioMember,
} from "./socio-admin/MemberProfileDrawer";
import { ExclusiveOffersTab } from "./socio-admin/ExclusiveOffersTab";

// ── Mock data ───────────────────────────────────────────────────────────────

const MOCK_MEMBERS: SocioMember[] = [
  {
    id: "SOC-001",
    name: "María López",
    phone: "987654321",
    email: "maria.lopez@example.com",
    plan: "anual",
    status: "activo",
    startDate: "2025-06-15",
    renewsAt: "2026-06-15",
    monthlyFee: 15,
    totalCashback: 87.5,
    totalSpent: 1750,
    ordersCount: 24,
    offersUsed: 18,
    lastOrder: "2026-04-15",
  },
  {
    id: "SOC-002",
    name: "Juan Pérez",
    phone: "912345678",
    email: "juan.p@example.com",
    plan: "mensual",
    status: "activo",
    startDate: "2025-12-01",
    renewsAt: "2026-05-01",
    monthlyFee: 19,
    totalCashback: 32,
    totalSpent: 640,
    ordersCount: 8,
    offersUsed: 5,
    lastOrder: "2026-04-10",
  },
  {
    id: "SOC-003",
    name: "Ana Torres",
    phone: "998877665",
    plan: "anual",
    status: "activo",
    startDate: "2025-03-10",
    renewsAt: "2026-03-10",
    monthlyFee: 15,
    totalCashback: 145,
    totalSpent: 2900,
    ordersCount: 38,
    offersUsed: 28,
    lastOrder: "2026-04-14",
  },
  {
    id: "SOC-004",
    name: "Carlos Ramírez",
    phone: "965432109",
    plan: "mensual",
    status: "pausado",
    startDate: "2025-11-20",
    renewsAt: "2026-04-20",
    monthlyFee: 19,
    totalCashback: 18,
    totalSpent: 360,
    ordersCount: 5,
    offersUsed: 2,
  },
  {
    id: "SOC-005",
    name: "Sofía Mendez",
    phone: "943210987",
    plan: "mensual",
    status: "cancelado",
    startDate: "2025-08-01",
    renewsAt: "2026-02-01",
    monthlyFee: 19,
    totalCashback: 42,
    totalSpent: 840,
    ordersCount: 12,
    offersUsed: 8,
  },
  {
    id: "SOC-006",
    name: "Pedro Salas",
    phone: "934567890",
    plan: "mensual",
    status: "activo",
    startDate: "2026-04-01",
    renewsAt: "2026-05-01",
    monthlyFee: 19,
    totalCashback: 8,
    totalSpent: 160,
    ordersCount: 2,
    offersUsed: 1,
    lastOrder: "2026-04-12",
  },
];

const PLAN_LABELS: Record<SocioMember["plan"], string> = {
  mensual: "Mensual",
  anual: "Anual",
};

const STATUS_STYLES: Record<SocioMember["status"], string> = {
  activo: "bg-[var(--data-success-100)] text-[var(--data-success-500)]",
  pausado: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]",
  cancelado: "bg-gray-100 text-[var(--text-secondary)]",
};

const STATUS_LABELS: Record<SocioMember["status"], string> = {
  activo: "Activo",
  pausado: "Pausado",
  cancelado: "Cancelado",
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function exportCSV(rows: SocioMember[]) {
  const headers = ["ID", "Nombre", "Teléfono", "Plan", "Estado", "Inicio", "Renovacion", "Cashback", "Gastado", "Pedidos"];
  const csvRows = rows.map((r) => [
    r.id,
    r.name,
    r.phone,
    PLAN_LABELS[r.plan],
    STATUS_LABELS[r.status],
    r.startDate,
    r.renewsAt,
    r.totalCashback.toFixed(2),
    r.totalSpent.toFixed(2),
    r.ordersCount.toString(),
  ]);
  const csv = [headers, ...csvRows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `socio_members_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Members Tab ─────────────────────────────────────────────────────────────

function MembersTab({
  members,
  onSelect,
}: {
  members: SocioMember[];
  onSelect: (m: SocioMember) => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SocioMember["status"] | "all">("all");
  const [planFilter, setPlanFilter] = useState<SocioMember["plan"] | "all">("all");

  const filtered = useMemo(() => {
    return members.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (planFilter !== "all" && m.plan !== planFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        m.name.toLowerCase().includes(q) ||
        m.phone.includes(q) ||
        m.id.toLowerCase().includes(q)
      );
    });
  }, [members, search, statusFilter, planFilter]);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            type="search"
            placeholder="Buscar por nombre, teléfono o ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
          />
        </div>
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value as SocioMember["plan"] | "all")}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm cursor-pointer"
        >
          <option value="all">Todos los planes</option>
          <option value="mensual">Mensual</option>
          <option value="anual">Anual</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as SocioMember["status"] | "all")}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm cursor-pointer"
        >
          <option value="all">Todos los estados</option>
          <option value="activo">Activos</option>
          <option value="pausado">Pausados</option>
          <option value="cancelado">Cancelados</option>
        </select>
        <button
          onClick={() => exportCSV(filtered)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-[var(--text-primary)] bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          <Download className="h-4 w-4" />
          CSV
        </button>
      </div>

      {/* Tabla */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-tertiary)]">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin miembros que mostrar</p>
          <p className="text-xs mt-1">Ajusta los filtros o espera nuevas suscripciones.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Miembro</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide hidden sm:table-cell">Plan</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide hidden md:table-cell">Renovación</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide hidden lg:table-cell">Cashback</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide hidden lg:table-cell">Pedidos</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Estado</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-linear-to-br from-[var(--accent)] to-[var(--data-success-500)] text-white flex items-center justify-center text-xs font-bold shrink-0">
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-[var(--text-primary)] text-sm">{m.name}</p>
                          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{m.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                        {PLAN_LABELS[m.plan]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] hidden md:table-cell">
                      {fmtDate(m.renewsAt)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-primary hidden lg:table-cell">
                      {fmt(m.totalCashback)}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--text-secondary)] hidden lg:table-cell">
                      {m.ordersCount}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-bold", STATUS_STYLES[m.status])}>
                        {STATUS_LABELS[m.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => onSelect(m)}
                        className="inline-flex items-center gap-1 p-2 rounded-lg text-[var(--text-tertiary)] hover:text-primary hover:bg-primary/10 transition-colors"
                        title="Ver perfil"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
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

// ── Main Component ──────────────────────────────────────────────────────────

const MODULE_ID = "socio-members";

const TABS = [
  { id: "miembros", label: "Miembros", icon: Users },
  { id: "ofertas", label: "Ofertas exclusivas", icon: Package },
];

// ── Server → SocioMember mapper (ADR-078) ─────────────────────────────────────

type ServerMember = {
  userId: string;
  plan: "monthly" | "annual";
  status: "trial" | "active" | "past_due" | "paused" | "cancelled";
  startedAt: string;
  currentPeriodEnd: string;
  cashbackBalance: number;
  totalEarned: number;
};

type ServerStats = {
  totalMembers: number;
  activeMembers: number;
  trialMembers: number;
  mrrSoles: number;
  churnRate30d: number;
  outstandingCashbackLiabilitySoles: number;
} | null;

function serverToLegacyMember(m: ServerMember): SocioMember {
  const statusMap = {
    active: "activo" as const,
    trial: "activo" as const,
    past_due: "activo" as const,
    paused: "pausado" as const,
    cancelled: "cancelado" as const,
  };
  const planMap = { monthly: "mensual" as const, annual: "anual" as const };
  const monthlyFee = m.plan === "annual" ? 15 : 19;
  return {
    id: m.userId,
    name: m.userId,
    phone: "",
    plan: planMap[m.plan],
    status: statusMap[m.status],
    startDate: m.startedAt.split("T")[0] ?? m.startedAt,
    renewsAt: m.currentPeriodEnd.split("T")[0] ?? m.currentPeriodEnd,
    monthlyFee,
    totalCashback: m.cashbackBalance,
    totalSpent: 0,
    ordersCount: 0,
    offersUsed: 0,
  };
}

export default function SocioMembersAdminModule() {
  const [tab, setTab] = useState(TABS[0].id);
  const [members, setMembers] = useState<SocioMember[]>(MOCK_MEMBERS);
  const [selected, setSelected] = useState<SocioMember | null>(null);
  const [serverStats, setServerStats] = useState<ServerStats>(null);

  // ADR-078: al mount, intentamos hidratar desde /api/admin/socio/*.
  // Si falla (403, API caída), se mantiene el MOCK_MEMBERS como fallback.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [membersRes, statsRes] = await Promise.all([
          fetch("/api/admin/socio/members?limit=200", { cache: "no-store" }),
          fetch("/api/admin/socio/stats", { cache: "no-store" }),
        ]);
        if (!cancelled && membersRes.ok) {
          const data = (await membersRes.json()) as {
            ok: boolean;
            members: ServerMember[];
          };
          if (data.ok && Array.isArray(data.members) && data.members.length > 0) {
            setMembers(data.members.map(serverToLegacyMember));
          }
        }
        if (!cancelled && statsRes.ok) {
          const data = (await statsRes.json()) as { ok: boolean; stats: ServerStats };
          if (data.ok) setServerStats(data.stats);
        }
      } catch {
        // silent — UI sigue con mock.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // KPIs
  const activos = members.filter((m) => m.status === "activo");
  const mrr = activos.reduce((sum, m) => sum + m.monthlyFee, 0);

  const now = new Date();
  const thisMonth = (iso: string) => {
    const d = new Date(iso);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  };

  const nuevosEsteMes = members.filter((m) => thisMonth(m.startDate)).length;
  const churnEsteMes = members.filter(
    (m) => m.status === "cancelado" && thisMonth(m.renewsAt)
  ).length;

  const handleExtend = (id: string, months: number) => {
    setMembers((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const current = new Date(m.renewsAt);
        current.setMonth(current.getMonth() + months);
        return { ...m, renewsAt: current.toISOString().split("T")[0] };
      })
    );
    setSelected(null);
  };

  const handleCancel = (id: string, _reason: string) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: "cancelado" as const } : m))
    );
    setSelected(null);
  };

  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Socio Buleje"
        description="Programa de membresía con precios exclusivos y cashback"
        icon={HeartHandshake}
      />

      {/* KPIs — prefiere stats de server (ADR-078), fallback a cálculo local */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label="Miembros activos"
          value={serverStats?.activeMembers ?? activos.length}
          icon={Users}
          color="var(--accent)"
          subtitle="Membresía vigente"
        />
        <KPICard
          label="MRR"
          value={fmt(serverStats?.mrrSoles ?? mrr)}
          icon={DollarSign}
          color="#10B981"
          subtitle="Ingreso recurrente 30d"
        />
        <KPICard
          label="Nuevos este mes"
          value={nuevosEsteMes}
          icon={TrendingUp}
          color="#3B82F6"
          subtitle="Altas del periodo"
        />
        <KPICard
          label={serverStats ? "Churn 30d" : "Churn este mes"}
          value={
            serverStats
              ? `${(serverStats.churnRate30d * 100).toFixed(1)}%`
              : churnEsteMes
          }
          icon={TrendingDown}
          color="#F59E0B"
          subtitle="Bajas del periodo"
          alert={(serverStats?.churnRate30d ?? 0) > 0.08 || churnEsteMes > 3}
        />
      </div>

      <AdminTabBar
        tabs={TABS}
        activeTab={tab}
        onTabChange={(id) => setTab(id)}
        moduleId={MODULE_ID}
      >
        {tab === "miembros" && <MembersTab members={members} onSelect={setSelected} />}
        {tab === "ofertas" && <ExclusiveOffersTab />}
      </AdminTabBar>

      {selected && (
        <MemberProfileDrawer
          member={selected}
          onClose={() => setSelected(null)}
          onExtend={handleExtend}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
