"use client";

/**
 * LeadsFunnelModule — Funnel de leads outbound/inbound (CEO dashboard).
 *
 * Muestra los leads capturados por /api/lead/capture (WhatsApp outbound, ads
 * FB/TikTok, referidos, formulario público) con KPIs, filtros y workflow de
 * status (new → contacted → demo_done → signed_up → won/lost).
 *
 * Backend:
 *  - GET /api/admin/leads/funnel → stats (total, last7d, last30d, conversionRate, bySource, byBusinessType, byCity, byStatus)
 *  - GET /api/admin/leads        → lista paginada con filtros
 *  - PATCH /api/admin/leads      → actualiza status (CSRF protegido)
 *
 * Datos persistidos via LeadsDB en ActivityLog (entity="lead").
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  UserPlus,
  TrendingUp,
  Activity,
  CheckCircle,
  Filter,
  RefreshCw,
  Phone,
} from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import KPICard from "@/components/admin/shared/KPICard";
import { DataTable, SectionTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";

interface FunnelStats {
  total: number;
  last7d: number;
  last30d: number;
  conversionRate: number;
  bySource: Record<string, number>;
  byBusinessType: Record<string, number>;
  byCity: Record<string, number>;
  byStatus: Record<string, number>;
  oldestLeadAt?: string;
  newestLeadAt?: string;
}

interface LeadRow {
  id: string;
  entityId: string;
  whatsappLast4: string;
  name: string;
  businessType: string;
  businessName?: string;
  city: string;
  monthlyRevenue?: string;
  painPoint?: string;
  preferredDemoTime?: string;
  source: string;
  ref?: string;
  status: string;
  createdAt: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: "Nuevo", color: "var(--accent)" },
  contacted: { label: "Contactado", color: "var(--data-warning-500)" },
  demo_done: { label: "Demo hecho", color: "var(--data-info-500)" },
  signed_up: { label: "Registrado", color: "var(--data-success-500)" },
  won: { label: "Ganado", color: "var(--data-success-500)" },
  lost: { label: "Perdido", color: "var(--data-error-500)" },
};

const NEXT_STATUS: Record<string, string> = {
  new: "contacted",
  contacted: "demo_done",
  demo_done: "signed_up",
  signed_up: "won",
};

function getCsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )csrf-token=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : null;
}

export default function LeadsFunnelModule() {
  const [stats, setStats] = useState<FunnelStats | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const [statsRes, leadsRes] = await Promise.all([
        fetch("/api/admin/leads/funnel", { credentials: "include" }),
        fetch(
          `/api/admin/leads?limit=100${sourceFilter ? `&source=${encodeURIComponent(sourceFilter)}` : ""}`,
          { credentials: "include" },
        ),
      ]);

      if (!statsRes.ok || !leadsRes.ok) {
        throw new Error(`HTTP ${statsRes.status}/${leadsRes.status}`);
      }

      const statsJson = await statsRes.json();
      const leadsJson = await leadsRes.json();

      setStats(statsJson);
      setLeads(leadsJson.leads ?? []);
      setError(null);
    } catch (err) {
      setError(String(err).slice(0, 200));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sourceFilter]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const updateStatus = useCallback(
    async (entityId: string, newStatus: string) => {
      const csrf = getCsrfCookie();
      try {
        const res = await fetch("/api/admin/leads", {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            ...(csrf ? { "x-csrf-token": csrf } : {}),
          },
          credentials: "include",
          body: JSON.stringify({ entityId, status: newStatus }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await fetchAll();
      } catch (err) {
        setError(`No se pudo actualizar el lead: ${String(err).slice(0, 100)}`);
      }
    },
    [fetchAll],
  );

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      if (statusFilter && l.status !== statusFilter) return false;
      return true;
    });
  }, [leads, statusFilter]);

  const sourceEntries = useMemo(
    () => (stats ? Object.entries(stats.bySource).sort((a, b) => b[1] - a[1]) : []),
    [stats],
  );
  const businessTypeEntries = useMemo(
    () =>
      stats ? Object.entries(stats.byBusinessType).sort((a, b) => b[1] - a[1]) : [],
    [stats],
  );

  return (
    <div className="space-y-6">
      <AdminModuleHeader
        eyebrow="Clientes · CEO Dashboard"
        title="Funnel de Leads"
        description="Prospectos que llenaron el formulario público. Movele el status conforme los contactes y cerrá ventas."
        icon={UserPlus}
      >
        <button
          onClick={fetchAll}
          disabled={refreshing}
          className={cn(
            "px-4 h-12 rounded-2xl border-2 border-[var(--rule-soft)] text-base font-medium",
            "bg-[var(--surface-raised)] text-[var(--text-primary)]",
            "hover:bg-[var(--surface-hover)] transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2",
          )}
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          Actualizar
        </button>
      </AdminModuleHeader>

      {error && (
        <div className="bg-[var(--data-error-100)] dark:bg-[var(--data-error-700)] border border-[var(--data-error-500)] text-[var(--data-error-700)] dark:text-[var(--data-error-500)] rounded-xl p-4 text-base">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-[var(--text-secondary)]">Cargando funnel...</div>
      ) : !stats ? (
        <div className="text-center py-12 text-[var(--text-secondary)]">Sin datos todavía.</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              label="Total leads (90d)"
              value={stats.total}
              icon={UserPlus}
              subtitle={
                stats.newestLeadAt
                  ? `Último: ${new Date(stats.newestLeadAt).toLocaleDateString("es-PE")}`
                  : "—"
              }
            />
            <KPICard
              label="Últimos 7 días"
              value={stats.last7d}
              icon={Activity}
              subtitle="Velocidad reciente"
            />
            <KPICard
              label="Últimos 30 días"
              value={stats.last30d}
              icon={TrendingUp}
              subtitle="Tendencia mensual"
            />
            <KPICard
              label="Conversión"
              value={`${stats.conversionRate}%`}
              icon={CheckCircle}
              subtitle="demo_done + signed_up + won"
            />
          </div>

          {/* Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-[var(--surface-raised)] border border-[var(--rule-soft)] rounded-2xl p-5">
              <SectionTitle as="h3" className="mb-4">Por canal (source)</SectionTitle>
              {sourceEntries.length === 0 ? (
                <div className="text-sm text-[var(--text-secondary)]">Sin datos</div>
              ) : (
                <div className="space-y-2">
                  {sourceEntries.map(([source, count]) => (
                    <button
                      key={source}
                      onClick={() => setSourceFilter(source === sourceFilter ? "" : source)}
                      className={cn(
                        "w-full flex justify-between items-center px-3 py-2 rounded-xl text-base transition-colors",
                        source === sourceFilter
                          ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                          : "bg-[var(--surface-base)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]",
                      )}
                    >
                      <span>{source || "direct"}</span>
                      <span className="font-semibold">{count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[var(--surface-raised)] border border-[var(--rule-soft)] rounded-2xl p-5">
              <SectionTitle as="h3" className="mb-4">Por tipo de negocio</SectionTitle>
              {businessTypeEntries.length === 0 ? (
                <div className="text-sm text-[var(--text-secondary)]">Sin datos</div>
              ) : (
                <div className="space-y-2">
                  {businessTypeEntries.map(([type, count]) => (
                    <div
                      key={type}
                      className="flex justify-between items-center px-3 py-2 rounded-xl bg-[var(--surface-base)] text-base"
                    >
                      <span className="capitalize text-[var(--text-primary)]">{type}</span>
                      <span className="font-semibold text-[var(--text-primary)]">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <Filter className="h-5 w-5 text-[var(--text-secondary)]" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-12 rounded-2xl border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] text-base text-[var(--text-primary)] px-4"
            >
              <option value="">Todos los status</option>
              {Object.entries(STATUS_LABELS).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            {sourceFilter && (
              <button
                onClick={() => setSourceFilter("")}
                className="h-12 px-4 rounded-2xl border-2 border-[var(--accent)] text-[var(--accent)] text-base font-medium hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] transition-colors"
              >
                Source: {sourceFilter} ✕
              </button>
            )}
          </div>

          {/* Lead list */}
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-soft)] rounded-2xl overflow-hidden">
            <DataTable className="w-full">
              <thead className="bg-[var(--surface-base)] border-b border-[var(--rule-soft)]">
                <tr className="text-left text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">WhatsApp</th>
                  <th className="px-4 py-3">Negocio</th>
                  <th className="px-4 py-3">Ciudad</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-[var(--text-secondary)] text-base">
                      No hay leads con esos filtros.
                    </td>
                  </tr>
                ) : (
                  filteredLeads.map((lead) => {
                    const statusInfo = STATUS_LABELS[lead.status] ?? STATUS_LABELS.new!;
                    const next = NEXT_STATUS[lead.status];
                    return (
                      <tr
                        key={lead.id}
                        className="border-b border-[var(--rule-soft)] hover:bg-[var(--surface-hover)] transition-colors"
                      >
                        <td className="px-4 py-3 text-base text-[var(--text-primary)] font-medium">
                          {lead.name}
                        </td>
                        <td className="px-4 py-3 text-base text-[var(--text-secondary)]">
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-4 w-4" />
                            ···{lead.whatsappLast4}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-base text-[var(--text-primary)]">
                          <div className="capitalize">{lead.businessType}</div>
                          {lead.businessName && (
                            <div className="text-sm text-[var(--text-secondary)]">{lead.businessName}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-base text-[var(--text-primary)]">{lead.city}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className="px-2 py-1 rounded-md bg-[var(--surface-base)] text-[var(--text-primary)]">
                            {lead.source}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="px-3 py-1 rounded-full text-sm font-medium"
                            style={{
                              backgroundColor: `color-mix(in oklch, ${statusInfo.color} 18%, transparent)`,
                              color: statusInfo.color,
                            }}
                          >
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                          {new Date(lead.createdAt).toLocaleDateString("es-PE", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </td>
                        <td className="px-4 py-3">
                          {next ? (
                            <button
                              onClick={() => updateStatus(lead.entityId, next)}
                              className="h-9 px-3 rounded-lg bg-[var(--accent)] text-[var(--accent-foreground)] text-sm font-medium hover:opacity-90 transition-opacity"
                            >
                              → {STATUS_LABELS[next]?.label}
                            </button>
                          ) : (
                            <span className="text-sm text-[var(--text-secondary)]">Cerrado</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </DataTable>
          </div>

          {/* Hint */}
          <p className="text-sm text-[var(--text-secondary)] text-center">
            Workflow: <strong>nuevo</strong> → contactado → demo hecho → registrado → ganado / perdido.<br />
            Tip: cada cambio se audita automáticamente vía ActivityLog (Ley 29733 compliant).
          </p>
        </>
      )}
    </div>
  );
}
