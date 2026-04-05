"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  RefreshCw,
  Loader2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Play,
  Server,
  CircleDot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentDomain, TaskStatus, TaskPriority } from "@/lib/agents/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentHealth {
  domain: AgentDomain;
  status: "active" | "inactive";
  actions: string[];
  circuitState: "closed" | "open" | "half-open";
}

interface HealthResponse {
  status: "healthy" | "degraded";
  agents: AgentHealth[];
  activeTasks: number;
  uptime: number;
  error?: string;
}

interface AgentTask {
  id: string;
  domain: AgentDomain;
  action: string;
  payload: Record<string, unknown>;
  priority: TaskPriority;
  status: TaskStatus;
  result?: unknown;
  error?: string;
  tenantId: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  traceId: string;
}

interface TaskListResponse {
  tasks: AgentTask[];
}

interface ExecuteResponse {
  task: AgentTask & { _timeout?: boolean };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DOMAIN_LABELS: Record<AgentDomain, string> = {
  inventory: "Inventario",
  orders: "Pedidos",
  customers: "Clientes",
  analytics: "Analítica",
  notifications: "Notificaciones",
  pricing: "Precios",
};

const DOMAIN_ACTIONS: Record<string, string[]> = {
  inventory: ["check-stock", "fefo-audit", "reorder-suggestions", "stock-valuation", "movement-summary"],
  orders: ["pending-summary", "delivery-schedule", "returns-analysis", "status-overview", "daily-sales-report"],
  customers: ["segmentation", "top-customers", "churn-risk", "birthday-upcoming", "customer-360"],
  analytics: ["daily-kpis", "product-performance", "margin-analysis", "sales-trend", "category-breakdown"],
  notifications: ["send-order-update", "send-stock-alert", "send-expiry-warning", "send-promotion", "digest-pending"],
  pricing: ["margin-check", "competitor-gap", "promotion-candidates", "bundle-suggestions", "price-history"],
};

const STATUS_META: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  pending:   { label: "Pendiente",  color: "text-amber-600",   bg: "bg-amber-100 dark:bg-amber-900/30" },
  running:   { label: "Ejecutando", color: "text-blue-600",    bg: "bg-blue-100 dark:bg-blue-900/30" },
  completed: { label: "Completado", color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  failed:    { label: "Fallido",    color: "text-red-600",     bg: "bg-red-100 dark:bg-red-900/30" },
  cancelled: { label: "Cancelado",  color: "text-gray-500",    bg: "bg-gray-100 dark:bg-gray-900/30" },
};

const CIRCUIT_META: Record<string, { label: string; color: string; bg: string }> = {
  closed:    { label: "Cerrado",    color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  open:      { label: "Abierto",    color: "text-red-600",     bg: "bg-red-100 dark:bg-red-900/30" },
  "half-open": { label: "Semi-abierto", color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-900/30" },
};

const AUTO_REFRESH_MS = 5_000;
const HISTORY_PAGE_SIZE = 10;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" }) +
      " " +
      d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

function fmtUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function fmtDuration(start?: string, end?: string): string {
  if (!start) return "—";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const ms = e - s;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function truncateId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) + "…" : id;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AgentsDashboardTab() {
  // ── Health state ────────────────────────────────────────────────────────
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  // ── Execute task state ──────────────────────────────────────────────────
  const [execDomain, setExecDomain] = useState<AgentDomain>("inventory");
  // execActionOverride se guarda por dominio para que al cambiar de dominio se auto-seleccione la primera acción
  const [execActionOverride, setExecActionOverride] = useState<Partial<Record<AgentDomain, string>>>({});
  const execAction = execActionOverride[execDomain] ?? DOMAIN_ACTIONS[execDomain]?.[0] ?? "";
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState<AgentTask | null>(null);
  const [execError, setExecError] = useState<string | null>(null);

  // ── Recent tasks state ──────────────────────────────────────────────────
  const [recentTasks, setRecentTasks] = useState<AgentTask[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  // ── History state ───────────────────────────────────────────────────────
  const [historyTasks, setHistoryTasks] = useState<AgentTask[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyDomain, setHistoryDomain] = useState<AgentDomain | "todos">("todos");

  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetchers ────────────────────────────────────────────────────────────

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/health", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: unknown = await res.json();
      setHealth(data as HealthResponse);
      setHealthError(null);
    } catch (err) {
      setHealthError(
        err instanceof Error ? err.message : "Error al obtener estado del sistema"
      );
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const fetchRecentTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/agents?limit=20", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: unknown = await res.json();
      const parsed = data as TaskListResponse;
      setRecentTasks(parsed.tasks ?? []);
    } catch {
      // silencioso — se reintenta con auto-refresh
    } finally {
      setRecentLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async (page: number, domain: AgentDomain | "todos") => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(HISTORY_PAGE_SIZE),
        // La API de /api/agents acepta limit. Simulamos paginación client-side
        // con un fetch mayor y slice.
      });
      if (domain !== "todos") params.set("domain", domain);
      // Fetch a larger set for client-side pagination
      params.set("limit", "200");

      const res = await fetch(`/api/agents?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: unknown = await res.json();
      const parsed = data as TaskListResponse;
      const allTasks = parsed.tasks ?? [];
      setHistoryTotal(allTasks.length);
      const start = (page - 1) * HISTORY_PAGE_SIZE;
      setHistoryTasks(allTasks.slice(start, start + HISTORY_PAGE_SIZE));
    } catch {
      setHistoryTasks([]);
      setHistoryTotal(0);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // ── Effects ─────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchHealth();
    fetchRecentTasks();
    fetchHistory(1, "todos");
  }, [fetchHealth, fetchRecentTasks, fetchHistory]);

  // Auto-refresh for running tasks
  useEffect(() => {
    const hasRunning = recentTasks.some((t) => t.status === "running" || t.status === "pending");
    if (hasRunning) {
      autoRefreshRef.current = setInterval(() => {
        fetchRecentTasks();
      }, AUTO_REFRESH_MS);
    }
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [recentTasks, fetchRecentTasks]);


  // ── Handlers ────────────────────────────────────────────────────────────

  async function handleExecute() {
    setExecuting(true);
    setExecResult(null);
    setExecError(null);
    try {
      const res = await fetch("/api/agents/execute", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: execDomain, action: execAction }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        const errData = data as { error?: { message?: string } };
        throw new Error(errData?.error?.message ?? `Error HTTP ${res.status}`);
      }
      const parsed = data as ExecuteResponse;
      setExecResult(parsed.task as AgentTask);
      // Refresh recent tasks after execution
      fetchRecentTasks();
    } catch (err) {
      setExecError(
        err instanceof Error ? err.message : "Error al ejecutar tarea"
      );
    } finally {
      setExecuting(false);
    }
  }

  function handleHistoryPageChange(newPage: number) {
    setHistoryPage(newPage);
    fetchHistory(newPage, historyDomain);
  }

  function handleHistoryDomainChange(domain: AgentDomain | "todos") {
    setHistoryDomain(domain);
    setHistoryPage(1);
    fetchHistory(1, domain);
  }

  const totalHistoryPages = Math.max(1, Math.ceil(historyTotal / HISTORY_PAGE_SIZE));

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <Activity className="h-6 w-6 text-[#00B4A6]" />
            Dashboard de Agentes
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">
            Sistema multi-agente — monitoreo, ejecución y tareas recientes
          </p>
        </div>
        <button
          onClick={() => {
            setHealthLoading(true);
            setRecentLoading(true);
            fetchHealth();
            fetchRecentTasks();
            fetchHistory(historyPage, historyDomain);
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Actualizar
        </button>
      </div>

      {/* ── Section 1: System Health ───────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-gray-500 dark:text-muted uppercase tracking-wide">
          Estado del Sistema
        </h2>

        {healthLoading && (
          <div className="flex items-center justify-center py-10 gap-3 text-gray-400 dark:text-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-semibold">Consultando estado…</span>
          </div>
        )}

        {healthError && !healthLoading && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-red-700 dark:text-red-400 text-sm">Error de conexión</p>
              <p className="text-xs text-red-600 dark:text-red-300 mt-0.5">{healthError}</p>
            </div>
          </div>
        )}

        {health && !healthLoading && (
          <>
            {/* KPI bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className={cn(
                "rounded-2xl p-4",
                health.status === "healthy"
                  ? "bg-emerald-50 dark:bg-emerald-950/30"
                  : "bg-red-50 dark:bg-red-950/30"
              )}>
                <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-1">Estado</p>
                <div className="flex items-center gap-2">
                  {health.status === "healthy" ? (
                    <CheckCircle className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                  <span className={cn(
                    "text-lg font-extrabold",
                    health.status === "healthy" ? "text-emerald-600" : "text-red-500"
                  )}>
                    {health.status === "healthy" ? "Saludable" : "Degradado"}
                  </span>
                </div>
              </div>
              <div className="rounded-2xl p-4 bg-blue-50 dark:bg-blue-950/30">
                <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-1">Agentes</p>
                <p className="text-xl font-extrabold text-blue-600">{health.agents.length}</p>
              </div>
              <div className="rounded-2xl p-4 bg-violet-50 dark:bg-violet-950/30">
                <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-1">Tareas Activas</p>
                <p className="text-xl font-extrabold text-violet-600">{health.activeTasks}</p>
              </div>
              <div className="rounded-2xl p-4 bg-gray-50 dark:bg-gray-800/50">
                <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-1">Uptime</p>
                <p className="text-xl font-extrabold text-gray-700 dark:text-gray-200">
                  {fmtUptime(health.uptime)}
                </p>
              </div>
            </div>

            {/* Agent cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {health.agents.map((agent) => {
                const circuit = CIRCUIT_META[agent.circuitState] ?? CIRCUIT_META["closed"];
                return (
                  <div
                    key={agent.domain}
                    className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-[#00B4A6]" />
                        <span className="font-bold text-gray-900 dark:text-foreground text-sm">
                          {DOMAIN_LABELS[agent.domain]}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded-full",
                          agent.status === "active"
                            ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600"
                            : "bg-red-100 dark:bg-red-900/30 text-red-600"
                        )}
                      >
                        {agent.status === "active" ? "Activo" : "Inactivo"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 dark:text-muted">
                        {agent.actions.length} acciones
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-full",
                          circuit.bg,
                          circuit.color
                        )}
                      >
                        <CircleDot className="h-3 w-3" />
                        {circuit.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Section 2: Execute Task ────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-gray-500 dark:text-muted uppercase tracking-wide">
          Ejecutar Tarea
        </h2>
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Domain selector */}
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">
                Dominio
              </label>
              <select
                value={execDomain}
                onChange={(e) => setExecDomain(e.target.value as AgentDomain)}
                className="w-full text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground"
              >
                {Object.entries(DOMAIN_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Action selector */}
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 dark:text-muted mb-1">
                Acción
              </label>
              <select
                value={execAction}
                onChange={(e) => setExecActionOverride(prev => ({ ...prev, [execDomain]: e.target.value }))}
                className="w-full text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground"
              >
                {(DOMAIN_ACTIONS[execDomain] ?? []).map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
            </div>

            {/* Execute button */}
            <div className="flex items-end">
              <button
                onClick={handleExecute}
                disabled={executing}
                className={cn(
                  "flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-50",
                  "bg-[#00B4A6] hover:bg-[#009690] dark:bg-[#00B4A6] dark:hover:bg-[#3a7d5e]"
                )}
              >
                {executing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {executing ? "Ejecutando…" : "Ejecutar"}
              </button>
            </div>
          </div>

          {/* Execution result */}
          {execError && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl p-3 flex items-start gap-2">
              <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 dark:text-red-300">{execError}</p>
            </div>
          )}

          {execResult && (
            <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                  Tarea ejecutada
                </span>
                <span
                  className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto",
                    STATUS_META[execResult.status].bg,
                    STATUS_META[execResult.status].color
                  )}
                >
                  {STATUS_META[execResult.status].label}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-gray-500 dark:text-muted">ID:</span>{" "}
                  <span className="font-mono font-semibold text-gray-700 dark:text-foreground">
                    {truncateId(execResult.id)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-muted">Dominio:</span>{" "}
                  <span className="font-semibold text-gray-700 dark:text-foreground">
                    {DOMAIN_LABELS[execResult.domain]}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-muted">Acción:</span>{" "}
                  <span className="font-semibold text-gray-700 dark:text-foreground">
                    {execResult.action}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-muted">Duración:</span>{" "}
                  <span className="font-semibold text-gray-700 dark:text-foreground">
                    {fmtDuration(execResult.startedAt, execResult.completedAt)}
                  </span>
                </div>
              </div>
              {execResult.error && (
                <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg p-2">
                  {execResult.error}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Section 3: Recent Tasks ────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-500 dark:text-muted uppercase tracking-wide">
            Tareas Recientes
          </h2>
          {recentTasks.some((t) => t.status === "running" || t.status === "pending") && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Auto-actualizando
            </span>
          )}
        </div>

        {recentLoading && (
          <div className="flex items-center justify-center py-10 gap-3 text-gray-400 dark:text-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-semibold">Cargando tareas…</span>
          </div>
        )}

        {!recentLoading && recentTasks.length === 0 && (
          <div className="bg-white dark:bg-card border-2 border-dashed border-gray-200 dark:border-card-border rounded-2xl p-10 text-center text-gray-400 dark:text-muted">
            <Clock className="h-10 w-10 mx-auto mb-3" />
            <p className="font-semibold">Sin tareas recientes</p>
            <p className="text-xs mt-1">
              Ejecuta una tarea desde el panel superior para comenzar
            </p>
          </div>
        )}

        {!recentLoading && recentTasks.length > 0 && (
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-card-border text-left">
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">
                      ID
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">
                      Dominio
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">
                      Acción
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">
                      Estado
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide hidden md:table-cell">
                      Prioridad
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide hidden md:table-cell">
                      Creado
                    </th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide hidden sm:table-cell">
                      Duración
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {recentTasks.map((task) => (
                    <TaskRow key={task.id} task={task} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Section 4: Task History ────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-gray-500 dark:text-muted uppercase tracking-wide">
            Historial de Tareas
          </h2>
          <select
            value={historyDomain}
            onChange={(e) =>
              handleHistoryDomainChange(e.target.value as AgentDomain | "todos")
            }
            className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground"
          >
            <option value="todos">Todos los dominios</option>
            {Object.entries(DOMAIN_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {historyLoading && (
          <div className="flex items-center justify-center py-10 gap-3 text-gray-400 dark:text-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-semibold">Cargando historial…</span>
          </div>
        )}

        {!historyLoading && historyTasks.length === 0 && (
          <div className="bg-white dark:bg-card border-2 border-dashed border-gray-200 dark:border-card-border rounded-2xl p-10 text-center text-gray-400 dark:text-muted">
            <Zap className="h-10 w-10 mx-auto mb-3" />
            <p className="font-semibold">Sin historial</p>
            <p className="text-xs mt-1">
              No se encontraron tareas con los filtros actuales
            </p>
          </div>
        )}

        {!historyLoading && historyTasks.length > 0 && (
          <>
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-card-border text-left">
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">
                        ID
                      </th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">
                        Dominio
                      </th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">
                        Acción
                      </th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">
                        Estado
                      </th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide hidden md:table-cell">
                        Prioridad
                      </th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide hidden md:table-cell">
                        Creado
                      </th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide hidden sm:table-cell">
                        Duración
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {historyTasks.map((task) => (
                      <TaskRow key={task.id} task={task} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => handleHistoryPageChange(historyPage - 1)}
                disabled={historyPage <= 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-card-border text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface/50 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </button>
              <span className="text-sm font-semibold text-gray-700 dark:text-foreground">
                Página {historyPage} de {totalHistoryPages}
              </span>
              <button
                onClick={() => handleHistoryPageChange(historyPage + 1)}
                disabled={historyPage >= totalHistoryPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-card-border text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface/50 disabled:opacity-40 transition-colors"
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── TaskRow sub-component ─────────────────────────────────────────────────────

const PRIORITY_LABELS: Record<TaskPriority, { label: string; color: string }> = {
  critical: { label: "Crítica",  color: "text-red-600 font-bold" },
  high:     { label: "Alta",     color: "text-[#f97316] font-semibold" },
  normal:   { label: "Normal",   color: "text-gray-600 dark:text-gray-400" },
  low:      { label: "Baja",     color: "text-gray-400" },
};

function TaskRow({ task }: { task: AgentTask }) {
  const statusMeta = STATUS_META[task.status];
  const priorityMeta = PRIORITY_LABELS[task.priority];

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-surface transition-colors">
      <td className="px-2 sm:px-4 py-1.5 sm:py-2.5">
        <span className="font-mono text-xs text-gray-500 dark:text-muted" title={task.id}>
          {truncateId(task.id)}
        </span>
      </td>
      <td className="px-2 sm:px-4 py-1.5 sm:py-2.5">
        <span className="text-xs font-semibold text-gray-800 dark:text-foreground">
          {DOMAIN_LABELS[task.domain]}
        </span>
      </td>
      <td className="px-2 sm:px-4 py-1.5 sm:py-2.5">
        <span className="text-xs text-gray-600 dark:text-gray-300 font-mono">
          {task.action}
        </span>
      </td>
      <td className="px-2 sm:px-4 py-1.5 sm:py-2.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full",
            statusMeta.bg,
            statusMeta.color
          )}
        >
          {task.status === "running" && <Loader2 className="h-3 w-3 animate-spin" />}
          {task.status === "completed" && <CheckCircle className="h-3 w-3" />}
          {task.status === "failed" && <XCircle className="h-3 w-3" />}
          {task.status === "pending" && <Clock className="h-3 w-3" />}
          {statusMeta.label}
        </span>
      </td>
      <td className="px-2 sm:px-4 py-1.5 sm:py-2.5 hidden md:table-cell">
        <span className={cn("text-xs", priorityMeta.color)}>
          {priorityMeta.label}
        </span>
      </td>
      <td className="px-2 sm:px-4 py-1.5 sm:py-2.5 hidden md:table-cell">
        <span className="text-xs text-gray-500 dark:text-muted whitespace-nowrap">
          {fmtDate(task.createdAt)}
        </span>
      </td>
      <td className="px-2 sm:px-4 py-1.5 sm:py-2.5 hidden sm:table-cell">
        <span className="text-xs text-gray-500 dark:text-muted whitespace-nowrap">
          {fmtDuration(task.startedAt, task.completedAt)}
        </span>
      </td>
    </tr>
  );
}
