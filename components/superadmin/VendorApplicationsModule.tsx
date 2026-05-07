"use client";

/**
 * VendorApplicationsModule — Review de aplicaciones de vendedores.
 *
 * Fetch real desde /api/superadmin/vendor-applications (ADR-079).
 * El componente mantiene un loading state y muestra un empty si no
 * hay aplicaciones.
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Building2,
  Clock,
  CheckCircle,
  XCircle,
  Timer,
  Search,
  Download,
  Eye,
  Check,
  X,
  MessageSquare,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ApplicationDetailsDrawer,
  type VendorApplication,
} from "./vendor-applications/ApplicationDetailsDrawer";

// ── Helpers ─────────────────────────────────────────────────────────────────

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

function exportCSV(rows: VendorApplication[]) {
  const headers = [
    "ID",
    "Razon social",
    "RUC",
    "Propietario",
    "Teléfono",
    "Distrito",
    "Categoria",
    "Estado",
    "Enviada",
    "Revisada",
  ];
  const csvRows = rows.map((r) => [
    r.id,
    r.businessName,
    r.ruc,
    r.ownerName,
    r.phone,
    r.district,
    r.category,
    r.status,
    r.submittedAt,
    r.reviewedAt ?? "",
  ]);
  const csv = [headers, ...csvRows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vendor_applications_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Styles ──────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<VendorApplication["status"], string> = {
  pendiente: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]",
  aprobada: "bg-[var(--data-success-100)] text-[var(--data-success-500)]",
  rechazada: "bg-[var(--data-error-100)] text-[var(--data-error-500)]",
  info_solicitada: "bg-[var(--data-info-100)] text-[var(--data-info-500)]",
};

const STATUS_LABELS: Record<VendorApplication["status"], string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  info_solicitada: "Info solicitada",
};

// ── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  iconColor,
  subtitle,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconColor: string;
  subtitle?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[length:var(--ts-2xs)] text-gray-500 font-bold uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1 tabular-nums">{value}</p>
          {subtitle && <p className="text-[length:var(--ts-2xs)] text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className={cn("h-9 w-9 rounded-full flex items-center justify-center shrink-0")} style={{ backgroundColor: `${iconColor}15` }}>
          <Icon className="h-4 w-4" style={{ color: iconColor }} />
        </div>
      </div>
    </div>
  );
}

// ── Data hook ───────────────────────────────────────────────────────────────

type Stats = {
  pending: number;
  underReview: number;
  approvedThisMonth: number;
  rejectedThisMonth: number;
  tenantProvisioned: number;
  avgReviewDays: number;
  topRejectionReasons: Array<{ reason: string; count: number }>;
};

async function fetchApplications(status: string): Promise<VendorApplication[]> {
  const res = await fetch(
    `/api/superadmin/vendor-applications?status=${encodeURIComponent(status)}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as {
    ok: boolean;
    applications: VendorApplication[];
  };
  return json.applications;
}

async function fetchStats(): Promise<Stats | null> {
  try {
    const res = await fetch("/api/superadmin/vendor-applications/stats", {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { ok: boolean; stats: Stats };
    return json.stats;
  } catch {
    return null;
  }
}

async function postReview(
  id: string,
  action:
    | "start_review"
    | "request_info"
    | "approve"
    | "reject"
    | "reopen",
  note?: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/superadmin/vendor-applications/${id}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, note }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: body.error ?? `HTTP ${res.status}` };
  }
  return { ok: true };
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function VendorApplicationsModule() {
  const [apps, setApps] = useState<VendorApplication[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    VendorApplication["status"] | "all"
  >("pendiente");
  const [selected, setSelected] = useState<VendorApplication | null>(null);

  // Mapea el filtro UI al status del backend
  const backendStatus = useMemo(() => {
    switch (statusFilter) {
      case "pendiente":
        return "pending";
      case "aprobada":
        return "approved";
      case "rechazada":
        return "rejected";
      case "info_solicitada":
        return "info_requested";
      default:
        return "all";
    }
  }, [statusFilter]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, s] = await Promise.all([
        fetchApplications(backendStatus),
        fetchStats(),
      ]);
      setApps(list);
      setStats(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [backendStatus]);

  useEffect(() => {
    reload();
  }, [reload]);

  const filtered = useMemo(() => {
    if (!search.trim()) return apps;
    const q = search.toLowerCase();
    return apps.filter(
      (a) =>
        a.businessName.toLowerCase().includes(q) ||
        a.ruc.includes(q) ||
        a.ownerName.toLowerCase().includes(q) ||
        a.district.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q),
    );
  }, [apps, search]);

  const handleApprove = async (id: string) => {
    const res = await postReview(id, "approve");
    if (!res.ok) {
      setError(res.error ?? "No se pudo aprobar");
      return;
    }
    setSelected(null);
    await reload();
  };

  const handleReject = async (id: string, reason: string) => {
    const res = await postReview(id, "reject", reason);
    if (!res.ok) {
      setError(res.error ?? "No se pudo rechazar");
      return;
    }
    setSelected(null);
    await reload();
  };

  const handleRequestInfo = async (id: string, info: string) => {
    // Si viene de pending, primero hay que startReview para entrar a under_review
    const current = apps.find((a) => a.id === id);
    if (current?.status === "pendiente") {
      await postReview(id, "start_review");
    }
    const res = await postReview(id, "request_info", info);
    if (!res.ok) {
      setError(res.error ?? "No se pudo solicitar info");
      return;
    }
    setSelected(null);
    await reload();
  };

  // KPIs: usamos stats del server si hay, sino derivamos del listado.
  const pendientes = stats?.pending ?? apps.filter((a) => a.status === "pendiente").length;
  const aprobadasEsteMes = stats?.approvedThisMonth ?? 0;
  const rechazadasEsteMes = stats?.rejectedThisMonth ?? 0;
  const avgReviewDays = stats?.avgReviewDays ?? 0;

  return (
    <div className="space-y-4">
      {/* Page Header — usa el shell unificado del superadmin (font-display + kicker accent) */}
      <header className="flex items-start gap-3.5">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)] text-white shrink-0">
          <Building2 className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)] mb-1">
            Marketplace
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
            Aplicaciones de vendedores
          </h1>
          <p className="text-sm sm:text-base text-[var(--text-secondary)] mt-1.5">
            Review de onboarding para nuevos vendedores del marketplace.
          </p>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-[var(--data-error-500)] bg-[var(--data-error-500)]/5 px-4 py-3 text-sm text-[var(--data-error-500)] flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-xs font-semibold underline"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Pendientes"
          value={pendientes}
          icon={Clock}
          iconColor="#F59E0B"
          subtitle="Requieren revisión"
        />
        <StatCard
          label="Aprobadas este mes"
          value={aprobadasEsteMes}
          icon={CheckCircle}
          iconColor="#10B981"
          subtitle="Nuevos vendedores"
        />
        <StatCard
          label="Rechazadas este mes"
          value={rechazadasEsteMes}
          icon={XCircle}
          iconColor="#EF4444"
          subtitle="No aprobadas"
        />
        <StatCard
          label="Tiempo de review"
          value={`${avgReviewDays} días`}
          icon={Timer}
          iconColor="#3B82F6"
          subtitle="Promedio histórico"
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="search"
            placeholder="Buscar por negocio, RUC, propietario o distrito..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(
              e.target.value as VendorApplication["status"] | "all",
            )
          }
          className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm cursor-pointer"
        >
          <option value="all">Todos los estados</option>
          <option value="pendiente">Pendientes</option>
          <option value="aprobada">Aprobadas</option>
          <option value="rechazada">Rechazadas</option>
          <option value="info_solicitada">Info solicitada</option>
        </select>
        <button
          onClick={() => exportCSV(filtered)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <Download className="h-4 w-4" />
          CSV
        </button>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl">
          <Loader2 className="h-6 w-6 mx-auto mb-3 animate-spin" />
          <p className="text-sm font-semibold">Cargando aplicaciones…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl">
          <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin aplicaciones que mostrar</p>
          <p className="text-xs mt-1">Ajusta los filtros para ver más.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Negocio</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden sm:table-cell">RUC</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden md:table-cell">Distrito</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Categoría</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden md:table-cell">Fecha</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Estado</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-bold text-gray-900 dark:text-white">{a.businessName}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{a.ownerName}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{a.ruc}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden md:table-cell">
                      {a.district}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden lg:table-cell">
                      <span className="text-xs">{a.category}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden md:table-cell">
                      <span className="text-xs">{fmtDate(a.submittedAt)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-bold", STATUS_STYLES[a.status])}>
                        {STATUS_LABELS[a.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setSelected(a)}
                          className="p-2 rounded-lg text-gray-400 hover:text-[var(--accent-dark)] hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
                          title="Ver detalles"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {a.status === "pendiente" && (
                          <>
                            <button
                              onClick={() => handleApprove(a.id)}
                              className="p-2 rounded-lg text-gray-400 hover:text-[var(--data-success-500)] hover:bg-[var(--data-success-50)] dark:hover:bg-[var(--data-success-500)]/20 transition-colors"
                              title="Aprobar"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setSelected(a)}
                              className="p-2 rounded-lg text-gray-400 hover:text-[var(--data-info-500)] hover:bg-[var(--data-info-50)] dark:hover:bg-[var(--data-info-500)]/20 transition-colors"
                              title="Solicitar info"
                            >
                              <MessageSquare className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setSelected(a)}
                              className="p-2 rounded-lg text-gray-400 hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/20 transition-colors"
                              title="Rechazar"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </>
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

      {selected && (
        <ApplicationDetailsDrawer
          application={selected}
          onClose={() => setSelected(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onRequestInfo={handleRequestInfo}
        />
      )}
    </div>
  );
}
