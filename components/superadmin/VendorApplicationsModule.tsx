"use client";

/**
 * VendorApplicationsModule — Review de aplicaciones de vendedores.
 *
 * Fetch real desde /api/superadmin/vendor-applications (ADR-079).
 * El componente mantiene un loading state y muestra un empty si no
 * hay aplicaciones.
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
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
  tone,
  subtitle,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone: "warning" | "success" | "danger" | "info" | "accent";
  subtitle?: string;
}) {
  const iconBg = {
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    success:
      "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]",
    danger: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
    info: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300",
    accent: "bg-[var(--accent)]/10 text-[var(--accent)]",
  }[tone];
  return (
    <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <span
          className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
      </div>
      <p className="mt-4 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </p>
      <p className="mt-1 font-display text-3xl font-extrabold tabular-nums tracking-tight text-[var(--text-primary)]">
        {value}
      </p>
      {subtitle && (
        <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">{subtitle}</p>
      )}
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
    headers: csrfHeaders({ "Content-Type": "application/json" }),
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
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      {/* ── Hero canónico ───────────────────────────────────────── */}
      <header className="border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3.5 min-w-0 flex-1">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shrink-0">
                <Building2 className="h-6 w-6" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                  Marketplace · Onboarding
                </p>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
                  Aplicaciones de vendedores
                </h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
                  Review de onboarding para nuevos vendedores del marketplace. Aprobá, rechazá o
                  solicitá información adicional.
                </p>
              </div>
            </div>
            <div className="flex items-stretch gap-2 flex-wrap shrink-0">
              <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 py-2 min-w-[88px]">
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
                  Por revisar
                </p>
                <p className="font-display text-xl font-extrabold tabular-nums tracking-tight mt-1 leading-none text-amber-600 dark:text-amber-400">
                  {pendientes}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 py-2 min-w-[88px]">
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
                  Total visibles
                </p>
                <p className="font-display text-xl font-extrabold tabular-nums tracking-tight mt-1 leading-none text-[var(--text-primary)]">
                  {filtered.length}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {error && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-300/60 bg-rose-50/40 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-300">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-xs font-bold underline"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Pendientes"
            value={pendientes}
            icon={Clock}
            tone="warning"
            subtitle="Requieren revisión"
          />
          <StatCard
            label="Aprobadas este mes"
            value={aprobadasEsteMes}
            icon={CheckCircle}
            tone="success"
            subtitle="Nuevos vendedores"
          />
          <StatCard
            label="Rechazadas este mes"
            value={rechazadasEsteMes}
            icon={XCircle}
            tone="danger"
            subtitle="No aprobadas"
          />
          <StatCard
            label="Tiempo de review"
            value={`${avgReviewDays}d`}
            icon={Timer}
            tone="info"
            subtitle="Promedio histórico"
          />
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]"
              aria-hidden
            />
            <input
              type="search"
              placeholder="Buscar por negocio, RUC, propietario o distrito…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value as VendorApplication["status"] | "all",
              )
            }
            className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-2 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] cursor-pointer"
          >
            <option value="all">Todos los estados</option>
            <option value="pendiente">Pendientes</option>
            <option value="aprobada">Aprobadas</option>
            <option value="rechazada">Rechazadas</option>
            <option value="info_solicitada">Info solicitada</option>
          </select>
          <button
            onClick={() => exportCSV(filtered)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 py-2 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
          >
            <Download className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            CSV
          </button>
        </div>

        {/* Tabla */}
        {loading ? (
          <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] py-16 text-center">
            <Loader2 className="h-6 w-6 mx-auto mb-3 animate-spin text-[var(--accent)]" />
            <p className="text-sm font-bold text-[var(--text-primary)]">Cargando aplicaciones…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] py-16 text-center">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] mb-3">
              <Building2 className="h-6 w-6 text-[var(--text-tertiary)]" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="font-display text-base font-extrabold text-[var(--text-primary)]">
              Sin aplicaciones que mostrar
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              Ajustá los filtros para ver más.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] text-left text-[length:var(--ts-2xs)] uppercase tracking-wider text-[var(--text-tertiary)]">
                    <th className="px-5 py-3 font-extrabold">Negocio</th>
                    <th className="px-3 py-3 font-extrabold hidden sm:table-cell">RUC</th>
                    <th className="px-3 py-3 font-extrabold hidden md:table-cell">Distrito</th>
                    <th className="px-3 py-3 font-extrabold hidden lg:table-cell">Categoría</th>
                    <th className="px-3 py-3 font-extrabold hidden md:table-cell">Fecha</th>
                    <th className="px-3 py-3 font-extrabold text-center">Estado</th>
                    <th className="px-5 py-3 font-extrabold text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--rule-soft)]">
                  {filtered.map((a) => (
                    <tr
                      key={a.id}
                      className="transition hover:bg-[var(--surface-sunken)]/50"
                    >
                      <td className="px-5 py-3">
                        <p className="font-bold text-[var(--text-primary)]">
                          {a.businessName}
                        </p>
                        <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                          {a.ownerName}
                        </p>
                      </td>
                      <td className="px-3 py-3 hidden sm:table-cell">
                        <span className="font-mono text-xs text-[var(--text-secondary)]">
                          {a.ruc}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-[var(--text-secondary)] hidden md:table-cell">
                        {a.district}
                      </td>
                      <td className="px-3 py-3 text-[var(--text-secondary)] hidden lg:table-cell">
                        <span className="text-xs">{a.category}</span>
                      </td>
                      <td className="px-3 py-3 text-[var(--text-secondary)] hidden md:table-cell">
                        <span className="text-xs">{fmtDate(a.submittedAt)}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider",
                            STATUS_STYLES[a.status],
                          )}
                        >
                          {STATUS_LABELS[a.status]}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setSelected(a)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]"
                            title="Ver detalles"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {a.status === "pendiente" && (
                            <>
                              <button
                                onClick={() => handleApprove(a.id)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--data-success-500)]/10 hover:text-[var(--data-success-500)]"
                                title="Aprobar"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setSelected(a)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-sky-100 hover:text-sky-700 dark:hover:bg-sky-900/40 dark:hover:text-sky-300"
                                title="Solicitar info"
                              >
                                <MessageSquare className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setSelected(a)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-900/40 dark:hover:text-rose-300"
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
    </div>
  );
}
