"use client";

import { CardTitle, PageTitle } from "@buleje/design-system";

import { useState, useMemo, useEffect } from "react";
import {
  ScrollText, Download, Search, Eye, X, AlertTriangle,
  Shield, Trash2, Pencil, Plus, Settings, UserCog, Loader2,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";
import ResponsiveTable from "@/components/ui/ResponsiveTable";
// import type { ReactNode } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type AuditAction = "crear" | "editar" | "eliminar" | "login" | "config" | "exportar" | "precio" | "permiso";
type AuditSeverity = "info" | "advertencia" | "critica";

type AuditEntry = {
  id: string;
  timestamp: string;
  user: string;
  role: string;
  action: AuditAction;
  module: string;
  description: string;
  details: string;
  severity: AuditSeverity;
  ip: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

const ACTION_META: Record<AuditAction, { label: string; icon: typeof Plus; color: string }> = {
  crear:    { label: "Crear",    icon: Plus,     color: "text-[var(--data-success-500)]" },
  editar:   { label: "Editar",   icon: Pencil,   color: "text-[var(--data-success-500)]" },
  eliminar: { label: "Eliminar", icon: Trash2,   color: "text-[var(--data-error-500)]" },
  login:    { label: "Login",    icon: UserCog,  color: "text-[var(--text-secondary)]" },
  config:   { label: "Config",   icon: Settings, color: "text-[var(--data-warning-500)]" },
  exportar: { label: "Exportar", icon: Download,  color: "text-[var(--data-info-500)]" },
  precio:   { label: "Precio",   icon: Pencil,   color: "text-[var(--data-warning-500)]" },
  permiso:  { label: "Permiso",  icon: Shield,   color: "text-[var(--text-secondary)]" },
};

const SEVERITY_META: Record<AuditSeverity, { label: string; color: string; bg: string }> = {
  info:        { label: "Info",        color: "text-[var(--data-success-500)]",    bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  advertencia: { label: "Advertencia", color: "text-[var(--data-warning-500)]",   bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30" },
  critica:     { label: "Crítica",     color: "text-[var(--data-error-500)]",     bg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30" },
};

const MODULES = ["Inventario", "Ventas", "Clientes", "Proveedores", "Finanzas", "RRHH", "Configuración", "Usuarios", "Precios", "Pedidos"];

// ── Helpers ──────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10);

function mapAction(raw: string): AuditAction {
  const r = raw.toLowerCase();
  if (r === "create" || r === "crear") return "crear";
  if (r === "update" || r === "editar") return "editar";
  if (r === "delete" || r === "eliminar") return "eliminar";
  if (r === "login") return "login";
  if (r.includes("config") || r.includes("settings") || r.includes("setting")) return "config";
  if (r.includes("export") || r === "exportar") return "exportar";
  if (r.includes("price") || r.includes("precio")) return "precio";
  if (r.includes("permiso") || r.includes("permission") || r.includes("role")) return "permiso";
  return "editar";
}

function mapSeverity(action: AuditAction): AuditSeverity {
  if (action === "eliminar" || action === "permiso") return "advertencia";
  if (action === "precio") return "advertencia";
  return "info";
}

function mapModule(entity: string): string {
  const map: Record<string, string> = {
    product: "Inventario",
    order: "Pedidos",
    customer: "Clientes",
    sale: "Ventas",
    purchase: "Proveedores",
    user: "Usuarios",
    settings: "Configuración",
    coupon: "Finanzas",
    supplier: "Proveedores",
    expense: "Finanzas",
    cash: "Ventas",
  };
  const key = entity.toLowerCase();
  for (const [k, v] of Object.entries(map)) {
    if (key.includes(k)) return v;
  }
  return entity.charAt(0).toUpperCase() + entity.slice(1);
}

// ── Columns for ResponsiveTable ───────────────────────────────────────────────

const auditColumns: import("@/components/ui/ResponsiveTable").Column<AuditEntry>[] = [
  {
    key: "severity",
    header: "Severidad",
    render: (e: AuditEntry) => {
      const sev = SEVERITY_META[e.severity];
      return <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", sev.bg, sev.color)}>{sev.label}</span>;
    },
  },
  {
    key: "timestamp",
    header: "Fecha/Hora",
    hideOnMobile: true,
    render: (e: AuditEntry) => <span className="text-xs text-[var(--text-secondary)] whitespace-nowrap">{fmtDate(e.timestamp)}</span>,
  },
  {
    key: "user",
    header: "Usuario",
    render: (e: AuditEntry) => (
      <div>
        <p className="font-semibold text-[var(--text-primary)] dark:text-foreground text-xs">{e.user}</p>
        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{e.role}</p>
      </div>
    ),
  },
  {
    key: "action",
    header: "Acción",
    render: (e: AuditEntry) => {
      const act = ACTION_META[e.action];
      const ActIcon = act.icon;
      return <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", act.color)}><ActIcon className="h-3 w-3" />{act.label}</span>;
    },
  },
  {
    key: "module",
    header: "Módulo",
    hideOnMobile: true,
    render: (e: AuditEntry) => <span className="text-xs text-[var(--text-secondary)] dark:text-muted">{e.module}</span>,
  },
  {
    key: "description",
    header: "Descripción",
    render: (e: AuditEntry) => <span className="text-xs text-[var(--text-primary)] dark:text-foreground max-w-60 truncate block">{e.description}</span>,
  },
  {
    key: "detail",
    header: "",
    hideOnMobile: true,
    render: () => <Eye className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

type RawEntry = { id: string; action: string; entity: string; entityId?: string; detail: string; user: string; createdAt: string };

function mapApiRows(data: RawEntry[]): AuditEntry[] {
  return data.map(r => {
    const action = mapAction(r.action);
    return {
      id: r.id,
      timestamp: r.createdAt,
      user: r.user,
      role: "admin",
      action,
      module: mapModule(r.entity),
      description: r.detail || `${r.action} ${r.entity}${r.entityId ? ` #${r.entityId}` : ""}`,
      details: r.entityId ? `Entidad: ${r.entity} · ID: ${r.entityId}` : "",
      severity: mapSeverity(action),
      ip: "—",
    };
  });
}

export default function AuditLogTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState<AuditAction | "todos">("todos");
  const [filterSeverity, setFilterSeverity] = useState<AuditSeverity | "todos">("todos");
  const [filterModule, setFilterModule] = useState("todos");
  const [filterUser, setFilterUser] = useState("todos");
  const [detail, setDetail] = useState<AuditEntry | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setEntries([]);
    setNextCursor(null);
    const params = new URLSearchParams();
    if (filterUser !== "todos") params.set("user", filterUser);
    const url = `/api/activity-log${params.size ? `?${params}` : ""}`;
    fetch(url)
      .then(r => r.ok ? r.json() : { items: [], nextCursor: null })
      .then(({ items, nextCursor: nc }: { items: RawEntry[]; nextCursor: string | null }) => {
        if (!active) return;
        setEntries(mapApiRows(items));
        setNextCursor(nc);
      })
      .catch(() => { /* silent */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filterUser]);

  function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const params = new URLSearchParams({ cursor: nextCursor });
    if (filterUser !== "todos") params.set("user", filterUser);
    fetch(`/api/activity-log?${params}`)
      .then(r => r.ok ? r.json() : { items: [], nextCursor: null })
      .then(({ items, nextCursor: nc }: { items: RawEntry[]; nextCursor: string | null }) => {
        setEntries(prev => [...prev, ...mapApiRows(items)]);
        setNextCursor(nc);
      })
      .catch(() => { /* silent */ })
      .finally(() => setLoadingMore(false));
  }

  const users = useMemo(() => [...new Set(entries.map(e => e.user))].sort(), [entries]);

  const filtered = useMemo(() => {
    let list = [...entries];
    if (filterAction !== "todos") list = list.filter(e => e.action === filterAction);
    if (filterSeverity !== "todos") list = list.filter(e => e.severity === filterSeverity);
    if (filterModule !== "todos") list = list.filter(e => e.module === filterModule);
    if (filterUser !== "todos") list = list.filter(e => e.user === filterUser);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e => e.description.toLowerCase().includes(q) || e.details.toLowerCase().includes(q) || e.user.toLowerCase().includes(q));
    }
    return list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [entries, filterAction, filterSeverity, filterModule, filterUser, search]);

  const stats = useMemo(() => {
    const criticas = entries.filter(e => e.severity === "critica").length;
    const advertencias = entries.filter(e => e.severity === "advertencia").length;
    const hoy = entries.filter(e => e.timestamp.startsWith(TODAY)).length;
    return { total: entries.length, criticas, advertencias, hoy };
  }, [entries]);

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <PageTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <ScrollText className="h-6 w-6 text-primary" /> Auditoría Avanzada
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Registro de actividad detallado con trazabilidad completa</p>
        </div>
        <button onClick={() => exportToCSV(filtered.map(e => ({ fecha: e.timestamp, usuario: e.user, rol: e.role, accion: ACTION_META[e.action].label, modulo: e.module, descripcion: e.description, detalles: e.details, severidad: e.severity, ip: e.ip })), "auditoria")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      {loading && (
        <div className="flex flex-wrap items-center justify-center py-16 gap-3 text-[var(--text-tertiary)] dark:text-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-semibold">Cargando registro de auditoría…</span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total eventos", value: String(stats.total), color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
          { label: "Hoy", value: String(stats.hoy), color: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-sunken)]" },
          { label: "Advertencias", value: String(stats.advertencias), color: "text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30" },
          { label: "Críticas", value: String(stats.criticas), color: "text-[var(--data-error-500)]", bg: "bg-[var(--data-error-50)] dark:bg-red-950/30" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-xl p-4", bg)}>
            <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Alert */}
      {stats.criticas > 0 && (
        <div className="bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] rounded-xl p-4 flex flex-wrap items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-[var(--data-error-500)] shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)] text-sm">Eventos críticos detectados</p>
            <p className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] mt-0.5">{stats.criticas} evento(s) de severidad crítica — eliminaciones, cambios de permisos o precios masivos.</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Descripción, usuario..." className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
        </div>
        <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value as AuditSeverity | "todos")} className="text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
          <option value="todos">Todas las severidades</option>
          {(Object.keys(SEVERITY_META) as AuditSeverity[]).map(s => <option key={s} value={s}>{SEVERITY_META[s].label}</option>)}
        </select>
        <select value={filterAction} onChange={e => setFilterAction(e.target.value as AuditAction | "todos")} className="text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
          <option value="todos">Todas las acciones</option>
          {(Object.keys(ACTION_META) as AuditAction[]).map(a => <option key={a} value={a}>{ACTION_META[a].label}</option>)}
        </select>
        <select value={filterModule} onChange={e => setFilterModule(e.target.value)} className="text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
          <option value="todos">Todos los módulos</option>
          {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filterUser} onChange={e => setFilterUser(e.target.value)} className="text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
          <option value="todos">Todos los usuarios</option>
          {users.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      {/* Table */}
      <ResponsiveTable<AuditEntry>
        columns={auditColumns}
        data={filtered}
        keyExtractor={(e) => e.id}
        onRowClick={(e) => setDetail(e)}
        loading={loading}
        loadingRows={6}
        emptyIcon={ScrollText}
        emptyMessage="Sin eventos"
        emptySubMessage="No se encontraron registros de auditoría con los filtros actuales."
      />

      {/* Load more */}
      {nextCursor && (
        <div className="flex justify-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface/50 disabled:opacity-50 transition-colors"
          >
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
            {loadingMore ? "Cargando…" : "Cargar más eventos"}
          </button>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <div className="modal-backdrop p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground text-sm">Detalle del evento</CardTitle>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
            </div>
            <div className="space-y-2 text-sm">
              {[
                ["Fecha/Hora", fmtDate(detail.timestamp)], ["Usuario", `${detail.user} (${detail.role})`],
                ["Acción", ACTION_META[detail.action].label], ["Módulo", detail.module],
                ["Severidad", SEVERITY_META[detail.severity].label], ["Descripción", detail.description],
                ["Detalles", detail.details], ["IP", detail.ip],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-wrap justify-between gap-2 sm:gap-4">
                  <span className="text-[var(--text-secondary)] dark:text-muted shrink-0">{k}</span>
                  <span className="font-semibold text-[var(--text-primary)] dark:text-foreground text-right">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
