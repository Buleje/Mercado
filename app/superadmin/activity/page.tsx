"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import {
  Search,
  ChevronDown,
  ChevronRight,
  Activity,
  Loader2,
  Download,
  Bot,
  ShieldCheck,
  User,
  UserCog,
  PartyPopper,
  Clock,
} from "@buleje/design-system/icons";
import {
  ADMIN_TOKENS,
  AdminTabShell,
  AdminEmptyState,
} from "../_components/_shared";
import { useDateRange } from "@/hooks/use-date-range";
import CustomDateRangePicker from "@/components/superadmin/_shared/CustomDateRangePicker";
import { SAStatChip } from "@/components/superadmin/_shared/SAStatChip";

interface ActivityLog {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  detail: string;
  user: string;
  tenantId: string;
  createdAt: string;
}

interface Pagination {
  page: number;
  pages: number;
  total: number;
  limit: number;
}

// ── Tonos semánticos por tipo de acción ───────────────────────────────────
const ACTION_TONES: Record<string, { bg: string; text: string; ring: string; label: string }> = {
  create:           { bg: "bg-emerald-500/12 dark:bg-emerald-500/20",   text: "text-emerald-700 dark:text-emerald-300",   ring: "ring-emerald-500/30",  label: "Creación" },
  update:           { bg: "bg-sky-500/12 dark:bg-sky-500/20",           text: "text-sky-700 dark:text-sky-300",           ring: "ring-sky-500/30",      label: "Actualización" },
  delete:           { bg: "bg-rose-500/12 dark:bg-rose-500/20",         text: "text-rose-700 dark:text-rose-300",         ring: "ring-rose-500/30",     label: "Eliminación" },
  login_success:    { bg: "bg-emerald-500/12 dark:bg-emerald-500/20",   text: "text-emerald-700 dark:text-emerald-300",   ring: "ring-emerald-500/30",  label: "Login OK" },
  login_failed:     { bg: "bg-rose-500/12 dark:bg-rose-500/20",         text: "text-rose-700 dark:text-rose-300",         ring: "ring-rose-500/30",     label: "Login falló" },
  impersonate:      { bg: "bg-teal-500/15 dark:bg-teal-500/25",       text: "text-teal-700 dark:text-teal-300",       ring: "ring-teal-500/40",    label: "Suplantación" },
  plan_change:      { bg: "bg-violet-500/12 dark:bg-violet-500/20",     text: "text-violet-700 dark:text-violet-300",     ring: "ring-violet-500/30",   label: "Cambio plan" },
  suspend:          { bg: "bg-rose-500/12 dark:bg-rose-500/20",         text: "text-rose-700 dark:text-rose-300",         ring: "ring-rose-500/30",     label: "Suspensión" },
  activate:         { bg: "bg-emerald-500/12 dark:bg-emerald-500/20",   text: "text-emerald-700 dark:text-emerald-300",   ring: "ring-emerald-500/30",  label: "Activación" },
  logout:           { bg: "bg-slate-500/12 dark:bg-slate-500/20",       text: "text-slate-700 dark:text-slate-300",       ring: "ring-slate-500/30",    label: "Logout" },
};

const DEFAULT_TONE = {
  bg: "bg-slate-500/10 dark:bg-slate-500/15",
  text: "text-slate-700 dark:text-slate-300",
  ring: "ring-slate-500/30",
  label: "Otro",
};

function getActionTone(action: string) {
  return ACTION_TONES[action.toLowerCase()] ?? DEFAULT_TONE;
}

// ── Avatares por tipo de usuario ──────────────────────────────────────────
function getUserMeta(user: string): { icon: typeof Bot; tone: string; bg: string; text: string } {
  const u = user.toLowerCase();
  if (u === "system")
    return { icon: Bot, tone: "slate", bg: "bg-slate-500/15", text: "text-slate-600 dark:text-slate-300" };
  if (u === "cron")
    return { icon: Clock, tone: "violet", bg: "bg-violet-500/15", text: "text-violet-600 dark:text-violet-300" };
  if (u === "superadmin")
    return { icon: ShieldCheck, tone: "teal", bg: "bg-teal-500/15", text: "text-teal-600 dark:text-teal-300" };
  if (u.includes("admin"))
    return { icon: UserCog, tone: "sky", bg: "bg-sky-500/15", text: "text-sky-600 dark:text-sky-300" };
  return { icon: User, tone: "amber", bg: "bg-teal-500/15", text: "text-teal-600 dark:text-teal-300" };
}

// ── Tiempo relativo ─────────────────────────────────────────────────────
// Brandon 2026-05-21 audit blindaje: guards de Date null/Invalid centralizados.
function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "ahora";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "ahora";
  const diff = Date.now() - t;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "ahora";
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} d`;
  const mo = Math.floor(d / 30);
  return `hace ${mo} mes${mo === 1 ? "" : "es"}`;
}

// ── Etiqueta de bucket por día (para agrupar las filas) ────────────────
function dayBucket(iso: string | null | undefined): string {
  if (!iso) return "Sin fecha";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Sin fecha";
  const now = new Date();
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (isSameDay(d, now)) return "Hoy";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(d, yesterday)) return "Ayer";
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (d.getTime() > weekAgo.getTime()) {
    return d.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "short" });
  }
  return d.toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });
}

// ── Parser de detail JSON ───────────────────────────────────────────────
function tryParseDetail(detail: string): unknown | null {
  if (!detail) return null;
  const trimmed = detail.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

// ── Slug del tenant (heurística) ────────────────────────────────────────
function prettyTenant(tenantId: string): { slug: string; isCuid: boolean } {
  if (!tenantId) return { slug: "—", isCuid: false };
  // CUIDs suelen tener 25+ chars y empezar con c
  const isCuid = tenantId.length > 16 && /^[a-z0-9]+$/.test(tenantId);
  return { slug: tenantId, isCuid };
}

// ── Quick filter chips disponibles ──────────────────────────────────────
const QUICK_FILTERS: Array<{ label: string; value: string; tone: string }> = [
  { label: "Todos",        value: "",              tone: "neutral" },
  { label: "Logins",       value: "login_success", tone: "emerald" },
  { label: "Suplantación", value: "impersonate",   tone: "amber" },
  { label: "Creaciones",   value: "create",        tone: "emerald" },
  { label: "Cambios",      value: "update",        tone: "sky" },
  { label: "Eliminaciones",value: "delete",        tone: "rose" },
  { label: "Suspensiones", value: "suspend",       tone: "rose" },
];

export default function ActivityPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pages: 1, total: 0, limit: 50 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterTenant, setFilterTenant] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterEntity, setFilterEntity] = useState("");
  const [textFilter, setTextFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dateRange = useDateRange("activity", "7d");

  const loadActivity = useCallback(async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (filterTenant) params.set("tenant", filterTenant);
      if (filterAction) params.set("action", filterAction);
      if (filterEntity) params.set("entity", filterEntity);
      params.set("from", dateRange.start.toISOString());
      params.set("to", dateRange.end.toISOString());

      const res = await fetch(`/api/superadmin/activity?${params}`, { credentials: "include" });
      if (!res.ok) {
        setError("Error al cargar actividad");
        return;
      }
      const data = (await res.json()) as { logs: ActivityLog[]; pagination: Pagination };
      setLogs(data.logs);
      setPagination(data.pagination);
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }, [filterTenant, filterAction, filterEntity, dateRange.start, dateRange.end]);

  useEffect(() => {
    void loadActivity(1);
  }, [loadActivity]);

  // Auto-refresh cada 30s.
  // Audit P0 #1 (2026-05-19): antes este efecto tenía `pagination.page` en deps,
  // lo que **reiniciaba el timer en cada cambio de página** → el refresh
  // automático nunca se disparaba si el usuario paginaba continuamente.
  // Fix: usar ref para la página actual + skip si `document.hidden` (no gastamos
  // ciclos cuando el tab está en background).
  const pagePageRef = useRef(pagination.page);
  useEffect(() => { pagePageRef.current = pagination.page; }, [pagination.page]);
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      // Visibility guard — no refrescamos si el tab no está visible.
      if (typeof document !== "undefined" && document.hidden) return;
      void loadActivity(pagePageRef.current);
    }, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadActivity]);

  // ── Filtros client-side adicionales (text search) ─────────────────────
  const filteredLogs = useMemo(() => {
    const q = textFilter.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (l) =>
        l.action.toLowerCase().includes(q) ||
        l.user.toLowerCase().includes(q) ||
        l.entity.toLowerCase().includes(q) ||
        (l.entityId ?? "").toLowerCase().includes(q) ||
        l.tenantId.toLowerCase().includes(q) ||
        (l.detail ?? "").toLowerCase().includes(q),
    );
  }, [logs, textFilter]);

  // ── Stats hero (calculados desde la página activa) ────────────────────
  const stats = useMemo(() => {
    const byAction: Record<string, number> = {};
    const byUser: Record<string, number> = {};
    let criticalCount = 0;
    let todayCount = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const l of logs) {
      byAction[l.action] = (byAction[l.action] ?? 0) + 1;
      byUser[l.user] = (byUser[l.user] ?? 0) + 1;
      if (["delete", "suspend", "impersonate", "login_failed"].includes(l.action.toLowerCase())) {
        criticalCount++;
      }
      if (new Date(l.createdAt).getTime() >= today.getTime()) {
        todayCount++;
      }
    }

    return {
      total: pagination.total,
      page: logs.length,
      today: todayCount,
      critical: criticalCount,
      uniqueUsers: Object.keys(byUser).length,
      topAction: Object.entries(byAction).sort(([, a], [, b]) => b - a)[0],
    };
  }, [logs, pagination.total]);

  // ── Agrupación por día ────────────────────────────────────────────────
  const groupedLogs = useMemo(() => {
    const groups: Array<{ bucket: string; items: ActivityLog[] }> = [];
    for (const log of filteredLogs) {
      const bucket = dayBucket(log.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.bucket === bucket) {
        last.items.push(log);
      } else {
        groups.push({ bucket, items: [log] });
      }
    }
    return groups;
  }, [filteredLogs]);

  // ── Export CSV ────────────────────────────────────────────────────────
  const handleExportCsv = useCallback(() => {
    const rows = [
      ["Fecha", "Usuario", "Acción", "Entidad", "Entity ID", "Tenant", "Detalle"],
      ...filteredLogs.map((l) => [
        new Date(l.createdAt).toISOString(),
        l.user,
        l.action,
        l.entity,
        l.entityId ?? "",
        l.tenantId,
        l.detail ?? "",
      ]),
    ];
    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredLogs]);

  const fmtAbsolute = (d: string) =>
    new Date(d).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" });

  const inputCls =
    "bg-[var(--surface-canvas)] border-2 border-[var(--rule-base)] text-[var(--text-primary)] rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 transition-colors";
  const selectCls = `appearance-none ${inputCls} pr-9 text-[var(--text-secondary)] cursor-pointer`;

  return (
    <AdminTabShell
      info={{
        what: "Registra cada acción relevante de la plataforma: creaciones, ediciones, borrados, logins y cambios de plan en todos los tenants.",
        affects: "Solo visible para ti en el superadmin. No afecta a las tiendas ni al storefront.",
        example: "Si un dueño de tienda borra un producto o cambia su plan a Pro, el evento aparece aquí con fecha, usuario y tenant.",
      }}
      title="Log de actividad"
      description={`${pagination.total.toLocaleString("es-PE")} registros — refresh automático cada 30s.`}
      icon={Activity}
      kicker="Auditoría"
      actions={
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={filteredLogs.length === 0}
          className="inline-flex items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </button>
      }
    >
      {/* ═══════ Stats hero — visión rápida de la actividad ═══════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SAStatChip
          icon={Activity}
          label="Total registros"
          value={stats.total.toLocaleString("es-PE")}
          hint="En el rango"
          tone="teal"
        />
        <SAStatChip
          icon={PartyPopper}
          label="Hoy"
          value={String(stats.today)}
          hint={`${stats.page} en página actual`}
          tone="sky"
        />
        <SAStatChip
          icon={ShieldCheck}
          label="Eventos críticos"
          value={String(stats.critical)}
          hint="delete / suspend / impersonate"
          tone={stats.critical > 0 ? "rose" : "emerald"}
        />
        <SAStatChip
          icon={User}
          label="Usuarios únicos"
          value={String(stats.uniqueUsers)}
          hint={stats.topAction ? `Top: ${stats.topAction[0]}` : "—"}
          tone="violet"
        />
      </div>

      {/* ═══════ Date range chips ════════════════════════════════════════ */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mr-1">
          Periodo:
        </span>
        {(["1d", "7d", "30d", "90d", "1y"] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => dateRange.setRange(r)}
            className={[
              "rounded-lg border-2 px-3 py-1.5 text-sm font-bold transition-colors",
              dateRange.range === r
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
            ].join(" ")}
          >
            {r === "1d" ? "Hoy" : r === "7d" ? "7 días" : r === "30d" ? "30 días" : r === "90d" ? "90 días" : "1 año"}
          </button>
        ))}
        <CustomDateRangePicker
          active={dateRange.range === "custom"}
          value={dateRange.customRange}
          onActivate={() => dateRange.setRange("custom")}
          onChange={dateRange.setCustomRange}
        />
      </div>

      {/* ═══════ Quick action filter chips ═══════════════════════════════ */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mr-1">
          Acción:
        </span>
        {QUICK_FILTERS.map((qf) => {
          const isActive = filterAction === qf.value;
          return (
            <button
              key={qf.label}
              type="button"
              onClick={() => setFilterAction(qf.value)}
              className={[
                "rounded-full px-3 py-1 text-xs font-bold border-2 transition-colors",
                isActive
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
              ].join(" ")}
            >
              {qf.label}
            </button>
          );
        })}
      </div>

      {/* ═══════ Filtros avanzados (search + tenant + entity) ════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr_1fr] gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)] pointer-events-none" />
          <input
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
            placeholder="Buscar por usuario, acción, detalle…"
            className={`w-full ${inputCls} pl-10`}
            aria-label="Buscar en la lista"
          />
        </div>

        <div className="relative">
          <input
            value={filterTenant}
            onChange={(e) => setFilterTenant(e.target.value)}
            placeholder="Tenant ID o slug…"
            className={`w-full ${inputCls}`}
            aria-label="Filtrar por tenant"
          />
        </div>

        <div className="relative">
          <select
            value={filterEntity}
            onChange={(e) => setFilterEntity(e.target.value)}
            className={`w-full ${selectCls}`}
            aria-label="Filtrar por entidad"
          >
            <option value="">Todas las entidades</option>
            <option value="product">Product</option>
            <option value="order">Order</option>
            <option value="customer">Customer</option>
            <option value="tenant">Tenant</option>
            <option value="admin_user">Admin User</option>
            <option value="category">Category</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)] pointer-events-none" />
        </div>
      </div>

      {/* ═══════ Error ═══════════════════════════════════════════════════ */}
      {error && (
        <div className={`${ADMIN_TOKENS.errorBanner} flex items-center justify-between`}>
          {error}
          <button
            type="button"
            onClick={() => void loadActivity(pagination.page)}
            className="underline hover:no-underline text-xs"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* ═══════ Activity feed — agrupado por día ═══════════════════════ */}
      {loading ? (
        <div className={`${ADMIN_TOKENS.card} flex items-center justify-center gap-3 py-20 text-[var(--text-tertiary)]`}>
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> Cargando actividad…
        </div>
      ) : filteredLogs.length === 0 ? (
        <AdminEmptyState
          icon={Activity}
          title={textFilter ? "Sin coincidencias" : "Sin registros de actividad"}
          description={
            textFilter
              ? `No encontramos eventos con "${textFilter}".`
              : "Aún no hay eventos registrados con los filtros actuales."
          }
        />
      ) : (
        <div className="space-y-5">
          {groupedLogs.map((group) => (
            <section key={group.bucket}>
              <header className="flex items-center gap-3 mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  {group.bucket}
                </h3>
                <div className="flex-1 h-px bg-[var(--rule-soft)]" aria-hidden />
                <span className="text-xs font-semibold text-[var(--text-tertiary)] tabular-nums">
                  {group.items.length} evento{group.items.length === 1 ? "" : "s"}
                </span>
              </header>
              <div className={`${ADMIN_TOKENS.card} overflow-hidden`}>
                <ul className="divide-y divide-[var(--rule-soft)]">
                  {group.items.map((log) => {
                    const tone = getActionTone(log.action);
                    const userMeta = getUserMeta(log.user);
                    const tenant = prettyTenant(log.tenantId);
                    const isExpanded = expandedId === log.id;
                    const parsedDetail = tryParseDetail(log.detail);
                    const hasDetail = Boolean(log.detail) || parsedDetail !== null;
                    const Icon = userMeta.icon;

                    return (
                      <li key={log.id} className="transition-colors hover:bg-[var(--surface-sunken)]/40">
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : log.id)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left"
                        >
                          {/* Avatar usuario */}
                          <div
                            className={`shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-xl ${userMeta.bg} ${userMeta.text}`}
                            aria-hidden
                          >
                            <Icon className="h-4 w-4" strokeWidth={2.25} />
                          </div>

                          {/* Usuario + acción + entidad */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-[var(--text-primary)]">
                                {log.user}
                              </span>
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${tone.bg} ${tone.text} ${tone.ring}`}
                              >
                                {log.action}
                              </span>
                              <span className="text-xs text-[var(--text-tertiary)]">·</span>
                              <span className="text-xs font-semibold text-[var(--text-secondary)] truncate">
                                {log.entity}
                                {log.entityId && (
                                  <span className="ml-1 font-mono text-[var(--text-tertiary)] text-[11px]">
                                    {log.entityId.length > 18
                                      ? `${log.entityId.slice(0, 8)}…`
                                      : log.entityId}
                                  </span>
                                )}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)] flex items-center gap-2 flex-wrap">
                              <span title={fmtAbsolute(log.createdAt)} className="font-semibold">
                                {timeAgo(log.createdAt)}
                              </span>
                              <span>·</span>
                              <span title={fmtAbsolute(log.createdAt)} className="tabular-nums">
                                {fmtAbsolute(log.createdAt)}
                              </span>
                              <span>·</span>
                              <span
                                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ${tenant.isCuid ? "font-mono" : "font-bold"} bg-[var(--surface-sunken)] text-[var(--text-secondary)]`}
                              >
                                {tenant.isCuid ? `${tenant.slug.slice(0, 8)}…` : tenant.slug}
                              </span>
                            </p>
                          </div>

                          {hasDetail && (
                            <ChevronRight
                              className={`shrink-0 h-4 w-4 text-[var(--text-tertiary)] transition-transform ${isExpanded ? "rotate-90" : ""}`}
                              aria-hidden
                            />
                          )}
                        </button>

                        {/* Detail expandido — JSON pretty si parsea, sino texto plano */}
                        {isExpanded && hasDetail && (
                          <div className="px-4 pb-4 pt-1 bg-[var(--surface-sunken)]/30 border-t border-[var(--rule-soft)]">
                            <div className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3 overflow-x-auto">
                              {parsedDetail !== null ? (
                                <pre className="text-[11px] font-mono text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                                  {JSON.stringify(parsedDetail, null, 2)}
                                </pre>
                              ) : (
                                <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap">
                                  {log.detail}
                                </p>
                              )}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-tertiary)]">
                              <span>
                                <strong className="font-bold text-[var(--text-secondary)]">ID:</strong>{" "}
                                <span className="font-mono">{log.id}</span>
                              </span>
                              {log.entityId && (
                                <span>
                                  <strong className="font-bold text-[var(--text-secondary)]">Entity ID:</strong>{" "}
                                  <span className="font-mono">{log.entityId}</span>
                                </span>
                              )}
                              {log.tenantId && (
                                <span>
                                  <strong className="font-bold text-[var(--text-secondary)]">Tenant:</strong>{" "}
                                  <span className="font-mono">{log.tenantId}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
          ))}
        </div>
      )}

      {/* ═══════ Paginación ══════════════════════════════════════════════ */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <span className="text-xs text-[var(--text-tertiary)] tabular-nums">
            Mostrando {logs.length} de {pagination.total.toLocaleString("es-PE")} registros
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadActivity(pagination.page - 1)}
              disabled={pagination.page <= 1 || loading}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border-2 border-[var(--rule-base)] text-sm font-bold text-[var(--text-secondary)] disabled:opacity-40 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            >
              ← Anterior
            </button>
            <span className="text-sm font-bold text-[var(--text-primary)] tabular-nums px-2">
              {pagination.page} / {pagination.pages}
            </span>
            <button
              type="button"
              onClick={() => void loadActivity(pagination.page + 1)}
              disabled={pagination.page >= pagination.pages || loading}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border-2 border-[var(--rule-base)] text-sm font-bold text-[var(--text-secondary)] disabled:opacity-40 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </AdminTabShell>
  );
}

// Audit P1: StatChip eliminado — reemplazado por <SAStatChip> de _shared.
