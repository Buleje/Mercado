"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Target, TrendingUp, Plus, Pencil, Trash2, Check, X, BarChart3,
  Calendar, AlertTriangle, CheckCircle2, Clock, RefreshCw, Sparkles,
  Users, Coins, Package,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import { toast } from "sonner";

type GoalPeriod = "diario" | "semanal" | "mensual";
// FIX 2026-05-07 (C): nuevas categorías auto-trackeables.
// - ticket_promedio: facturación / Nº pedidos del período
// - retencion: clientes que compraron 2+ veces / clientes totales
// (producto_top quedó pendiente — requiere persistir productId en la meta)
type GoalCategory = "ventas" | "pedidos" | "clientes" | "productos" | "caja" | "ticket_promedio" | "retencion";
type GoalStatus = "completed" | "overdue" | "urgent" | "active";

interface Goal {
  id: string;
  name: string;
  category: GoalCategory;
  period: GoalPeriod;
  target: number;
  current: number;
  unit: string;
  createdAt: string;
  dueDate?: string;
}

const CATEGORY_META: Record<GoalCategory, { label: string; color: string; bg: string; icon: React.ElementType; trackable: boolean }> = {
  ventas:           { label: "Ventas",           color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)]",     icon: TrendingUp, trackable: true  },
  pedidos:          { label: "Pedidos",          color: "text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-50)]", icon: BarChart3,  trackable: true  },
  clientes:         { label: "Clientes",         color: "text-[var(--text-secondary)]",   bg: "bg-[var(--surface-sunken)]",  icon: Users,      trackable: true  },
  productos:        { label: "Productos",        color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)]",     icon: Package,    trackable: false },
  caja:             { label: "Caja",             color: "text-[var(--text-secondary)]",   bg: "bg-[var(--surface-sunken)]",  icon: Coins,      trackable: false },
  ticket_promedio:  { label: "Ticket promedio",  color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)]",     icon: Coins,      trackable: true  },
  retencion:        { label: "Retención",        color: "text-[var(--text-secondary)]",   bg: "bg-[var(--surface-sunken)]",  icon: Users,      trackable: true  },
};

const PERIOD_LABELS: Record<GoalPeriod, string> = {
  diario: "Diario", semanal: "Semanal", mensual: "Mensual",
};

const PERIOD_DAYS: Record<GoalPeriod, number> = {
  diario: 1, semanal: 7, mensual: 30,
};

interface Template {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  category: GoalCategory;
  period: GoalPeriod;
  unit: string;
  defaultTarget: number;
  namePrefix: string;
}

const TEMPLATES: Template[] = [
  { id: "ventas-mes",       label: "Ventas del mes",         description: "Cuánto querés facturar este mes",     icon: TrendingUp, category: "ventas",    period: "mensual", unit: "S/",       defaultTarget: 50000, namePrefix: "Ventas " },
  { id: "ventas-dia",       label: "Meta diaria",            description: "Tu objetivo de ventas por día",        icon: Sparkles,   category: "ventas",    period: "diario",  unit: "S/",       defaultTarget: 1500,  namePrefix: "Meta diaria " },
  { id: "pedidos-semana",   label: "Pedidos a la semana",    description: "Cuántos pedidos querés cerrar",        icon: BarChart3,  category: "pedidos",   period: "semanal", unit: "pedidos",  defaultTarget: 80,    namePrefix: "Pedidos " },
  { id: "clientes-nuevos",  label: "Clientes nuevos",        description: "Crecer la base de clientes",           icon: Users,      category: "clientes",  period: "mensual", unit: "clientes", defaultTarget: 30,    namePrefix: "Nuevos clientes " },
  { id: "productos-vendidos", label: "Productos vendidos",   description: "Volumen de productos despachados",     icon: Package,    category: "productos", period: "mensual", unit: "unidades", defaultTarget: 500,   namePrefix: "Unidades " },
  { id: "cobranza-mes",     label: "Cobranza del mes",       description: "Recuperar fiados pendientes",          icon: Coins,      category: "caja",      period: "mensual", unit: "S/",       defaultTarget: 2000,  namePrefix: "Cobranza " },
  // FIX 2026-05-07 (C): templates de las nuevas categorías auto-trackeables.
  { id: "ticket-mes",       label: "Subir ticket promedio",  description: "Que cada compra valga más",            icon: Coins,      category: "ticket_promedio", period: "mensual", unit: "S/",       defaultTarget: 35,    namePrefix: "Ticket promedio " },
  { id: "retencion-mes",    label: "Clientes que vuelven",   description: "% de clientes con 2+ compras",         icon: Users,      category: "retencion",       period: "mensual", unit: "%",        defaultTarget: 40,    namePrefix: "Retención " },
];

interface AutoStats {
  ventasMes: number;
  ventasDia: number;
  ventasSemana: number;
  pedidosMes: number;
  pedidosSemana: number;
  pedidosDia: number;
  clientesMes: number;
  clientesSemana: number;
  clientesDia: number;
  // FIX 2026-05-07 (C): métricas derivadas auto-trackeables.
  ticketPromedioMes: number;
  ticketPromedioSemana: number;
  ticketPromedioDia: number;
  // % de clientes que compraron 2+ veces en el período (0-100).
  retencionMes: number;
  retencionSemana: number;
  retencionDia: number;
}

const ZERO_STATS: AutoStats = {
  ventasMes: 0, ventasDia: 0, ventasSemana: 0,
  pedidosMes: 0, pedidosSemana: 0, pedidosDia: 0,
  clientesMes: 0, clientesSemana: 0, clientesDia: 0,
  ticketPromedioMes: 0, ticketPromedioSemana: 0, ticketPromedioDia: 0,
  retencionMes: 0, retencionSemana: 0, retencionDia: 0,
};

function pickAutoCurrent(category: GoalCategory, period: GoalPeriod, stats: AutoStats): number | null {
  if (category === "ventas") {
    if (period === "diario")  return stats.ventasDia;
    if (period === "semanal") return stats.ventasSemana;
    return stats.ventasMes;
  }
  if (category === "pedidos") {
    if (period === "diario")  return stats.pedidosDia;
    if (period === "semanal") return stats.pedidosSemana;
    return stats.pedidosMes;
  }
  if (category === "clientes") {
    if (period === "diario")  return stats.clientesDia;
    if (period === "semanal") return stats.clientesSemana;
    return stats.clientesMes;
  }
  if (category === "ticket_promedio") {
    if (period === "diario")  return stats.ticketPromedioDia;
    if (period === "semanal") return stats.ticketPromedioSemana;
    return stats.ticketPromedioMes;
  }
  if (category === "retencion") {
    if (period === "diario")  return stats.retencionDia;
    if (period === "semanal") return stats.retencionSemana;
    return stats.retencionMes;
  }
  return null;
}

function computeStatus(goal: Goal): GoalStatus {
  const pct = goal.target > 0 ? (goal.current / goal.target) * 100 : 0;
  if (pct >= 100) return "completed";
  if (goal.dueDate) {
    const days = daysBetween(goal.dueDate);
    if (days < 0) return "overdue";
    if (days <= 3) return "urgent";
  }
  return "active";
}

function daysBetween(dateStr: string): number {
  const target = new Date(dateStr);
  const today  = new Date();
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function formatDaysRemaining(dateStr: string): { text: string; tone: "ok" | "warn" | "danger" } {
  const d = daysBetween(dateStr);
  if (d < 0)  return { text: `Vencida hace ${Math.abs(d)} ${Math.abs(d) === 1 ? "día" : "días"}`, tone: "danger" };
  if (d === 0) return { text: "Vence hoy",                                                          tone: "danger" };
  if (d === 1) return { text: "Vence mañana",                                                       tone: "warn"   };
  if (d <= 3)  return { text: `Faltan ${d} días`,                                                   tone: "warn"   };
  return       { text: `Faltan ${d} días`,                                                          tone: "ok"     };
}

function computeForecast(goal: Goal): { projected: number; willHit: boolean; pctOfTarget: number } | null {
  const elapsedMs = Date.now() - new Date(goal.createdAt).getTime();
  const elapsedDays = Math.max(1, elapsedMs / 86_400_000);
  const periodDays = PERIOD_DAYS[goal.period];
  if (elapsedDays >= periodDays) return null;
  const dailyRate = goal.current / elapsedDays;
  const projected = Math.round(dailyRate * periodDays);
  const pctOfTarget = goal.target > 0 ? (projected / goal.target) * 100 : 0;
  return { projected, willHit: projected >= goal.target, pctOfTarget };
}

function formatNumber(n: number, unit: string): string {
  if (unit === "S/") return `S/${n.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;
  return `${n.toLocaleString("es-PE")} ${unit}`;
}

function getStatusBorder(status: GoalStatus): string {
  switch (status) {
    case "completed": return "border-l-[var(--data-success)]";
    case "overdue":   return "border-l-[var(--data-error)]";
    case "urgent":    return "border-l-[var(--data-warning)]";
    default:          return "border-l-transparent";
  }
}

function StatusIcon({ status }: { status: GoalStatus }) {
  if (status === "completed") return <CheckCircle2 className="h-4 w-4 text-[var(--data-success-500)]" aria-label="Completada" />;
  if (status === "overdue")   return <AlertTriangle className="h-4 w-4 text-[var(--data-error-500)]" aria-label="Vencida" />;
  if (status === "urgent")    return <Clock className="h-4 w-4 text-[var(--data-warning-500)]" aria-label="Por vencer" />;
  return <Target className="h-4 w-4 text-[var(--text-tertiary)]" aria-label="Activa" />;
}

function ProgressBar({ current, target }: { current: number; target: number }) {
  const pct = Math.min(100, target > 0 ? Math.round((current / target) * 100) : 0);
  const barColor = pct >= 100 ? "bg-[var(--data-success-500)]" : pct >= 70 ? "bg-[var(--data-warning-500)]" : "bg-[var(--data-error-500)]";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="text-[var(--text-primary)]">{current.toLocaleString("es-PE")} / {target.toLocaleString("es-PE")}</span>
        <span className={cn(pct >= 100 ? "text-[var(--data-success-500)]" : pct >= 70 ? "text-[var(--data-warning-500)]" : "text-[var(--data-error-500)]")}>{pct}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-[var(--dur-slow)]", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function KPISummary({ goals }: { goals: Goal[] }) {
  const total     = goals.length;
  const completed = goals.filter(g => g.current >= g.target).length;
  const overdue   = goals.filter(g => computeStatus(g) === "overdue").length;
  const avgPct    = total > 0
    ? Math.round(goals.reduce((s, g) => s + Math.min(100, g.target > 0 ? (g.current / g.target) * 100 : 0), 0) / total)
    : 0;

  const cards = [
    { label: "Activas",        value: String(total - completed), icon: Target,          color: "text-primary" },
    { label: "Logradas",       value: String(completed),         icon: CheckCircle2,    color: "text-[var(--data-success-500)]" },
    { label: "Vencidas",       value: String(overdue),           icon: AlertTriangle,   color: "text-[var(--data-error-500)]" },
    { label: "Promedio global", value: `${avgPct}%`,             icon: BarChart3,       color: "text-primary" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{c.label}</p>
            <p className={cn("text-2xl font-extrabold tabular-nums leading-none mt-1.5", c.color)}>{c.value}</p>
          </div>
          <c.icon className={cn("h-5 w-5 shrink-0", c.color)} />
        </div>
      ))}
    </div>
  );
}

// FIX 2026-05-07 (D): histórico de metas cumplidas en períodos anteriores.
// Muestra "X metas cumplidas en abril" + tendencia vs mes anterior.
// Usa createdAt + dueDate para clasificar por período.
function HistoryCard({ goals }: { goals: Goal[] }) {
  const stats = useMemo(() => {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const lastMonthName = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleString("es-PE", {
      month: "long",
    });

    let lastMonthCompleted = 0;
    let lastMonthTotal = 0;
    let twoMonthsCompleted = 0;
    let twoMonthsTotal = 0;

    for (const g of goals) {
      const created = g.createdAt ? new Date(g.createdAt).getTime() : 0;
      if (created >= lastMonthStart && created < thisMonthStart) {
        lastMonthTotal++;
        if (g.current >= g.target) lastMonthCompleted++;
      } else if (created < lastMonthStart) {
        twoMonthsTotal++;
        if (g.current >= g.target) twoMonthsCompleted++;
      }
    }

    const trend =
      twoMonthsTotal > 0
        ? Math.round((lastMonthCompleted / Math.max(1, lastMonthTotal)) * 100) -
          Math.round((twoMonthsCompleted / Math.max(1, twoMonthsTotal)) * 100)
        : 0;

    return { lastMonthCompleted, lastMonthTotal, lastMonthName, trend };
  }, [goals]);

  if (stats.lastMonthTotal === 0) return null;

  return (
    <div className="bg-linear-to-br from-[var(--accent-soft)] to-white dark:from-[var(--accent-soft)]/30 dark:to-card border-2 border-[var(--accent)]/30 rounded-2xl p-4 sm:p-5 flex items-center gap-4">
      <div className="shrink-0 h-14 w-14 rounded-2xl bg-[var(--accent)]/15 flex items-center justify-center">
        <Sparkles className="h-7 w-7 text-[var(--accent)]" strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          Tu racha del mes pasado
        </p>
        <p className="text-base font-extrabold text-[var(--text-primary)] mt-0.5 capitalize">
          Cumpliste {stats.lastMonthCompleted} de {stats.lastMonthTotal} metas en {stats.lastMonthName}
        </p>
        {stats.trend !== 0 && (
          <p
            className={cn(
              "text-xs font-bold mt-1",
              stats.trend > 0
                ? "text-[var(--data-success-500)]"
                : "text-[var(--data-warning-500)]",
            )}
          >
            {stats.trend > 0 ? "▲" : "▼"} {Math.abs(stats.trend)}% vs el mes anterior
          </p>
        )}
      </div>
    </div>
  );
}

interface GoalFormData { name: string; category: GoalCategory; period: GoalPeriod; target: string; unit: string; dueDate: string; current: string; }
const EMPTY_FORM: GoalFormData = { name: "", category: "ventas", period: "mensual", target: "", unit: "S/", dueDate: "", current: "0" };

type FilterKey = "todas" | "activas" | "completadas" | "vencidas";

const STATUS_PRIORITY: Record<GoalStatus, number> = {
  overdue: 0, urgent: 1, active: 2, completed: 3,
};

export default function GoalsTab() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<GoalFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("todas");
  const [autoStats, setAutoStats] = useState<AutoStats>(ZERO_STATS);
  const [showTemplates, setShowTemplates] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/goals");
      if (res.ok) setGoals(await res.json());
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  // Auto-track: cargar ventas + clientes + dashboard para sincronización auto
  const loadAutoStats = useCallback(async () => {
    try {
      const [salesRes, customersRes] = await Promise.all([
        fetch("/api/sales?limit=500", { credentials: "include" }),
        fetch("/api/customers", { credentials: "include" }),
      ]);

      const sales: Array<{ total?: number; createdAt?: string }> = salesRes.ok
        ? await salesRes.json()
        : [];
      const customers: Array<{ createdAt?: string }> = customersRes.ok
        ? await customersRes.json().then((d) => Array.isArray(d) ? d : (d.customers ?? []))
        : [];

      const now = new Date();
      const todayStart   = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const monthStart   = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const weekStart    = todayStart - (now.getDay() === 0 ? 6 : now.getDay() - 1) * 86_400_000;

      let ventasMes = 0, ventasDia = 0, ventasSemana = 0;
      let pedidosMes = 0, pedidosDia = 0, pedidosSemana = 0;

      for (const s of Array.isArray(sales) ? sales : []) {
        const t = s.createdAt ? new Date(s.createdAt).getTime() : 0;
        const total = Number(s.total ?? 0);
        if (t >= monthStart) { ventasMes += total; pedidosMes += 1; }
        if (t >= weekStart)  { ventasSemana += total; pedidosSemana += 1; }
        if (t >= todayStart) { ventasDia += total; pedidosDia += 1; }
      }

      let clientesMes = 0, clientesSemana = 0, clientesDia = 0;
      for (const c of customers) {
        const t = c.createdAt ? new Date(c.createdAt).getTime() : 0;
        if (t >= monthStart) clientesMes += 1;
        if (t >= weekStart)  clientesSemana += 1;
        if (t >= todayStart) clientesDia += 1;
      }

      // FIX 2026-05-07 (C): ticket promedio = facturación / pedidos.
      // Si no hubo pedidos en el período, queda en 0 (no NaN).
      const ticketPromedioMes    = pedidosMes    > 0 ? Math.round(ventasMes    / pedidosMes    * 100) / 100 : 0;
      const ticketPromedioSemana = pedidosSemana > 0 ? Math.round(ventasSemana / pedidosSemana * 100) / 100 : 0;
      const ticketPromedioDia    = pedidosDia    > 0 ? Math.round(ventasDia    / pedidosDia    * 100) / 100 : 0;

      // Retención: % de clientes que pidieron 2+ veces en el período.
      // Necesitamos contar pedidos por cliente — usamos sales con customerPhone.
      const phonesByPeriod = { mes: new Map<string, number>(), semana: new Map<string, number>(), dia: new Map<string, number>() };
      for (const s of Array.isArray(sales) ? sales : []) {
        const phone = (s as { customerPhone?: string }).customerPhone;
        if (!phone) continue;
        const t = s.createdAt ? new Date(s.createdAt).getTime() : 0;
        if (t >= monthStart) phonesByPeriod.mes.set(phone, (phonesByPeriod.mes.get(phone) ?? 0) + 1);
        if (t >= weekStart)  phonesByPeriod.semana.set(phone, (phonesByPeriod.semana.get(phone) ?? 0) + 1);
        if (t >= todayStart) phonesByPeriod.dia.set(phone, (phonesByPeriod.dia.get(phone) ?? 0) + 1);
      }
      const calcRetencion = (m: Map<string, number>) => {
        if (m.size === 0) return 0;
        const repeat = Array.from(m.values()).filter(c => c >= 2).length;
        return Math.round((repeat / m.size) * 100);
      };
      const retencionMes    = calcRetencion(phonesByPeriod.mes);
      const retencionSemana = calcRetencion(phonesByPeriod.semana);
      const retencionDia    = calcRetencion(phonesByPeriod.dia);

      setAutoStats({
        ventasMes, ventasDia, ventasSemana,
        pedidosMes, pedidosSemana, pedidosDia,
        clientesMes, clientesSemana, clientesDia,
        ticketPromedioMes, ticketPromedioSemana, ticketPromedioDia,
        retencionMes, retencionSemana, retencionDia,
      });
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void load(); void loadAutoStats(); }, [load, loadAutoStats]);

  // FIX 2026-05-07 (B): live update cada 30s mientras la pestaña está activa.
  // Si el dueño minimiza el navegador o cambia de pestaña, pausamos para ahorrar
  // requests al server. Reanuda al volver. Las metas se actualizan en tiempo
  // real conforme entran ventas — sin recargar.
  useEffect(() => {
    const REFRESH_MS = 30_000;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (intervalId) return;
      intervalId = setInterval(() => { void loadAutoStats(); }, REFRESH_MS);
    };
    const stop = () => {
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
    };

    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      start();
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadAutoStats]);

  // ─── Templates handler ────────────────────────────────────────────────────
  const applyTemplate = (t: Template) => {
    const today = new Date();
    const due = new Date(today);
    if (t.period === "diario")        due.setHours(23, 59, 59);
    else if (t.period === "semanal")  due.setDate(today.getDate() + 7);
    else                              due.setMonth(today.getMonth() + 1);
    const dueIso = due.toISOString().slice(0, 10);

    const auto = pickAutoCurrent(t.category, t.period, autoStats);
    setForm({
      name: t.namePrefix.trim(),
      category: t.category,
      period: t.period,
      target: String(t.defaultTarget),
      unit: t.unit,
      dueDate: dueIso,
      current: auto != null ? String(Math.round(auto)) : "0",
    });
    setEditId(null);
    setShowTemplates(false);
    setShowForm(true);
  };

  const openCreate = () => { setForm(EMPTY_FORM); setEditId(null); setShowTemplates(true); };
  const openEdit = (g: Goal) => {
    setForm({
      name: g.name, category: g.category, period: g.period,
      target: String(g.target), unit: g.unit,
      dueDate: g.dueDate ?? "",
      current: String(g.current),
    });
    setEditId(g.id);
    setShowTemplates(false);
    setShowForm(true);
  };

  // ─── Smart suggestions ────────────────────────────────────────────────────
  const suggestedTargets = useMemo(() => {
    const auto = pickAutoCurrent(form.category, form.period, autoStats);
    if (auto == null || auto === 0) return [];
    return [
      { label: "+10%",    value: Math.round(auto * 1.1) },
      { label: "+25%",    value: Math.round(auto * 1.25) },
      { label: "Doblar",  value: Math.round(auto * 2) },
    ];
  }, [form.category, form.period, autoStats]);

  const save = async () => {
    // BUG-FIX (audit 2026-05-05): guard contra doble-submit que creaba metas duplicadas
    if (saving) return;
    if (!form.name.trim() || !form.target) return;
    setSaving(true);
    const targetNum  = parseFloat(form.target);
    const currentNum = parseFloat(form.current) || 0;
    const wasCompleted = editId
      ? (goals.find(g => g.id === editId)?.current ?? 0) >= (goals.find(g => g.id === editId)?.target ?? 0)
      : false;
    const body = {
      name: form.name.trim(),
      category: form.category,
      period: form.period,
      target: targetNum,
      current: currentNum,
      unit: form.unit.trim() || "S/",
      dueDate: form.dueDate || undefined,
    };
    try {
      const res = editId
        ? await fetch(`/api/goals/${editId}`, { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) })
        : await fetch("/api/goals", { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) });
      // BUG-FIX (audit 2026-05-05): chequear res.ok — antes el modal se cerraba aunque el API fallara
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        toast.error(errBody?.error || `No se pudo guardar la meta (HTTP ${res.status})`);
        setSaving(false);
        return;
      }
      setShowForm(false);
      await load();

      // Celebración si meta recién alcanzada
      if (currentNum >= targetNum && !wasCompleted) {
        toast.success(`Meta alcanzada: ${body.name}`, {
          description: `Llegaste a ${formatNumber(currentNum, body.unit)} de ${formatNumber(targetNum, body.unit)}.`,
          duration: 4000,
        });
      } else if (editId) {
        toast.success("Meta actualizada");
      } else {
        toast.success("Meta creada");
      }
    } catch {
      toast.error("No se pudo guardar la meta");
    }
    setSaving(false);
  };

  const remove = async (id: string) => {
    const goal = goals.find(g => g.id === id);
    // BUG-FIX (audit 2026-05-05): optimistic update con rollback si el API falla
    const prevGoals = goals;
    setGoals(prev => prev.filter(g => g.id !== id));
    try {
      const res = await fetch(`/api/goals/${id}`, { method: "DELETE", headers: csrfHeaders() });
      if (!res.ok) {
        setGoals(prevGoals); // rollback
        toast.error("No se pudo eliminar la meta. Reintentá.");
        return;
      }
      if (goal) toast(`Meta eliminada: ${goal.name}`);
    } catch {
      setGoals(prevGoals); // rollback
      toast.error("Error de conexión. Reintentá.");
    }
  };

  const updateProgress = async (id: string, current: number) => {
    const goal = goals.find(g => g.id === id);
    if (!goal) return;
    const wasCompleted = goal.current >= goal.target;
    // BUG-FIX (audit 2026-05-05): rollback en error de PATCH
    const prevCurrent = goal.current;
    setGoals(prev => prev.map(g => g.id === id ? { ...g, current } : g));
    try {
      const res = await fetch(`/api/goals/${id}`, { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ current }) });
      if (!res.ok) {
        setGoals(prev => prev.map(g => g.id === id ? { ...g, current: prevCurrent } : g));
        toast.error("No se pudo actualizar el progreso");
        return;
      }
      if (current >= goal.target && !wasCompleted) {
        toast.success(`Meta alcanzada: ${goal.name}`, {
          description: `Llegaste a ${formatNumber(current, goal.unit)} de ${formatNumber(goal.target, goal.unit)}.`,
          duration: 4000,
        });
      }
    } catch {
      setGoals(prev => prev.map(g => g.id === id ? { ...g, current: prevCurrent } : g));
      toast.error("Error de conexión");
    }
  };

  const syncFromData = async (g: Goal) => {
    const auto = pickAutoCurrent(g.category, g.period, autoStats);
    if (auto == null) return;
    const value = Math.round(auto);
    await updateProgress(g.id, value);
    toast.success("Sincronizado con datos reales", {
      description: `${g.name}: ${formatNumber(value, g.unit)}.`,
      duration: 2500,
    });
  };

  // FIX 2026-05-07 (A): live current. Para metas trackables (ventas, pedidos,
  // clientes) reemplazamos el `current` del DB por el valor real calculado
  // desde autoStats. Math.max para no DECREMENTAR si el dueño puso un valor
  // manual mayor. Las metas no-trackables (productos, caja) quedan con su
  // current del DB intacto.
  const liveGoals = useMemo(() => {
    return goals.map(g => {
      const meta = CATEGORY_META[g.category];
      if (!meta?.trackable) return g;
      const auto = pickAutoCurrent(g.category, g.period, autoStats);
      if (auto == null) return g;
      return { ...g, current: Math.max(g.current, auto) };
    });
  }, [goals, autoStats]);

  // ─── Filtered + sorted ─────────────────────────────────────────────────────
  const visible = useMemo(() => {
    const enriched = liveGoals.map(g => ({ goal: g, status: computeStatus(g) }));
    const filtered = enriched.filter(({ status }) => {
      if (filter === "todas")        return true;
      if (filter === "activas")      return status === "active" || status === "urgent";
      if (filter === "completadas")  return status === "completed";
      if (filter === "vencidas")     return status === "overdue";
      return true;
    });
    filtered.sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]);
    return filtered;
  }, [liveGoals, filter]);

  const counts = useMemo(() => {
    const c = { todas: liveGoals.length, activas: 0, completadas: 0, vencidas: 0 };
    for (const g of liveGoals) {
      const s = computeStatus(g);
      if (s === "active" || s === "urgent") c.activas++;
      else if (s === "completed")           c.completadas++;
      else if (s === "overdue")             c.vencidas++;
    }
    return c;
  }, [liveGoals]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)]">Metas & Objetivos</SectionTitle>
          <p className="text-sm text-[var(--text-secondary)]">Trackea el progreso del negocio en tiempo real — auto-sync desde ventas, pedidos y clientes</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> Nueva Meta
        </button>
      </div>

      {/* KPI Summary — usa liveGoals para reflejar progreso real-time */}
      {liveGoals.length > 0 && <KPISummary goals={liveGoals} />}

      {/* Histórico — racha del mes pasado (FIX D, 2026-05-07) */}
      <HistoryCard goals={goals} />

      {/* Filter pills */}
      {goals.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {([
            { id: "todas",       label: "Todas",       count: counts.todas       },
            { id: "activas",     label: "Activas",     count: counts.activas     },
            { id: "completadas", label: "Logradas",    count: counts.completadas },
            { id: "vencidas",    label: "Vencidas",    count: counts.vencidas    },
          ] as const).map(p => (
            <button
              key={p.id}
              onClick={() => setFilter(p.id)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border",
                filter === p.id
                  ? "bg-[var(--text-primary)] text-white border-[var(--text-primary)]"
                  : "bg-white dark:bg-[var(--color-card)] text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)]"
              )}
            >
              {p.label}
              <span className={cn(
                "rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums min-w-[20px] text-center",
                filter === p.id ? "bg-white/25" : "bg-[var(--surface-sunken)]"
              )}>
                {p.count}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Goals list */}
      {loading ? (
        <div className="h-40 flex items-center justify-center text-[var(--text-tertiary)]">Cargando…</div>
      ) : goals.length === 0 ? (
        <EmptyStateWithTemplates onPick={applyTemplate} autoStats={autoStats} />
      ) : visible.length === 0 ? (
        <div className="bg-white dark:bg-[var(--color-card)] border-2 border-dashed border-[var(--rule-base)] rounded-xl p-10 text-center">
          <Target className="h-10 w-10 text-[var(--text-tertiary)] mx-auto mb-3" />
          <p className="text-[var(--text-secondary)] font-semibold">No hay metas en este filtro</p>
          <button onClick={() => setFilter("todas")} className="mt-3 text-sm text-primary font-semibold hover:underline">Ver todas</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map(({ goal: g, status }) => {
            const meta = CATEGORY_META[g.category];
            const Icon = meta.icon;
            const pct  = Math.min(100, g.target > 0 ? Math.round((g.current / g.target) * 100) : 0);
            const dueInfo = g.dueDate ? formatDaysRemaining(g.dueDate) : null;
            const forecast = computeForecast(g);
            const autoValue = pickAutoCurrent(g.category, g.period, autoStats);
            const showSync = meta.trackable && autoValue != null && Math.abs(autoValue - g.current) > 0.01;

            return (
              <div
                key={g.id}
                className={cn(
                  "bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] border-l-4 rounded-xl p-5 space-y-4 hover:shadow-sm transition-shadow",
                  getStatusBorder(status)
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", meta.bg)}>
                      <Icon className={cn("h-4 w-4", meta.color)} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-[var(--text-primary)] leading-tight truncate">{g.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs">
                        <span className={cn("font-bold", meta.color)}>{meta.label}</span>
                        <span className="text-[var(--rule-base)]">·</span>
                        <span className="text-[var(--text-tertiary)]">{PERIOD_LABELS[g.period]}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <StatusIcon status={status} />
                    <button onClick={() => openEdit(g)} aria-label="Editar" className="p-1 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors">
                      <Pencil className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                    </button>
                    <button onClick={() => remove(g.id)} aria-label="Eliminar" className="p-1 rounded-lg hover:bg-[var(--data-error-50)] transition-colors">
                      <Trash2 className="h-3.5 w-3.5 text-[var(--text-tertiary)] hover:text-[var(--data-error-500)]" />
                    </button>
                  </div>
                </div>

                <ProgressBar current={g.current} target={g.target} />

                {/* Forecast */}
                {forecast && status !== "completed" && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <TrendingUp className={cn("h-3.5 w-3.5", forecast.willHit ? "text-[var(--data-success-500)]" : "text-[var(--data-warning-500)]")} />
                    <span className="text-[var(--text-secondary)]">
                      A este ritmo:{" "}
                      <strong className={forecast.willHit ? "text-[var(--data-success-500)]" : "text-[var(--data-warning-500)]"}>
                        {formatNumber(forecast.projected, g.unit)}
                      </strong>
                      {forecast.willHit ? " — vas a superar" : ` (${Math.round(forecast.pctOfTarget)}% de la meta)`}
                    </span>
                  </div>
                )}

                {/* Days remaining */}
                {dueInfo && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <Calendar className={cn(
                      "h-3.5 w-3.5",
                      dueInfo.tone === "danger" ? "text-[var(--data-error-500)]" :
                      dueInfo.tone === "warn"   ? "text-[var(--data-warning-500)]" :
                      "text-[var(--text-tertiary)]"
                    )} />
                    <span className={cn(
                      "font-medium",
                      dueInfo.tone === "danger" ? "text-[var(--data-error-500)]" :
                      dueInfo.tone === "warn"   ? "text-[var(--data-warning-500)]" :
                      "text-[var(--text-tertiary)]"
                    )}>
                      {dueInfo.text}
                    </span>
                  </div>
                )}

                {/* Quick actions */}
                <div className="flex items-center gap-2 pt-1">
                  {showSync && (
                    <button
                      onClick={() => void syncFromData(g)}
                      title={`Auto-actualizar a ${formatNumber(Math.round(autoValue ?? 0), g.unit)}`}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Sync
                    </button>
                  )}
                  <input
                    type="number"
                    min={0}
                    defaultValue={g.current}
                    onBlur={e => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v !== g.current) void updateProgress(g.id, v);
                    }}
                    className="flex-1 min-w-0 px-3 py-1.5 text-xs rounded-lg border border-[var(--rule-base)] bg-[var(--surface-alt)] text-[var(--text-primary)] outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                    placeholder="Actualizar manualmente"
                  />
                  <span className="text-xs text-[var(--text-tertiary)] font-mono shrink-0">{g.unit}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Templates picker modal */}
      {showTemplates && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowTemplates(false)}>
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl w-full max-w-2xl p-6 space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-extrabold text-[var(--text-primary)]">¿Qué tipo de meta querés crear?</CardTitle>
              <button onClick={() => setShowTemplates(false)} aria-label="Cerrar" className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors">
                <X className="h-5 w-5 text-[var(--text-tertiary)]" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TEMPLATES.map(t => {
                const auto = pickAutoCurrent(t.category, t.period, autoStats);
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t)}
                    className="text-left p-4 rounded-xl border border-[var(--rule-base)] hover:border-primary hover:bg-primary/5 transition-colors flex gap-3"
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-[var(--text-primary)]">{t.label}</p>
                      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{t.description}</p>
                      {auto != null && auto > 0 && (
                        <p className="text-xs text-[var(--data-success-500)] mt-1.5 font-semibold">
                          Hoy llevás {formatNumber(Math.round(auto), t.unit)}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => { setShowTemplates(false); setForm(EMPTY_FORM); setEditId(null); setShowForm(true); }}
              className="w-full py-2.5 rounded-lg border border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-alt)] transition-colors"
            >
              Crear meta personalizada
            </button>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl w-full max-w-md p-6 space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-extrabold text-[var(--text-primary)]">{editId ? "Editar meta" : "Nueva meta"}</CardTitle>
              <button onClick={() => setShowForm(false)} aria-label="Cerrar" className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors">
                <X className="h-5 w-5 text-[var(--text-tertiary)]" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] mb-1 block">Nombre de la meta</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="ej. Ventas del mes"
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-[var(--rule-base)] bg-[var(--surface-alt)] text-[var(--text-primary)] outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[var(--text-secondary)] mb-1 block">Categoría</label>
                  <select
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value as GoalCategory }))}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-[var(--rule-base)] bg-[var(--surface-alt)] text-[var(--text-primary)] outline-none focus:border-primary transition-all"
                  >
                    {Object.entries(CATEGORY_META).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--text-secondary)] mb-1 block">Período</label>
                  <select
                    value={form.period}
                    onChange={e => setForm(f => ({ ...f, period: e.target.value as GoalPeriod }))}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-[var(--rule-base)] bg-[var(--surface-alt)] text-[var(--text-primary)] outline-none focus:border-primary transition-all"
                  >
                    {Object.entries(PERIOD_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[var(--text-secondary)] mb-1 block">Meta (cantidad)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.target}
                    onChange={e => setForm(f => ({ ...f, target: e.target.value }))}
                    placeholder="5000"
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-[var(--rule-base)] bg-[var(--surface-alt)] text-[var(--text-primary)] outline-none focus:border-primary transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--text-secondary)] mb-1 block">Unidad</label>
                  <input
                    type="text"
                    value={form.unit}
                    onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                    placeholder="S/ ó pedidos"
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-[var(--rule-base)] bg-[var(--surface-alt)] text-[var(--text-primary)] outline-none focus:border-primary transition-all"
                  />
                </div>
              </div>

              {suggestedTargets.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-[var(--text-secondary)]">Sugerencias basadas en tu período actual</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestedTargets.map(s => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, target: String(s.value) }))}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      >
                        <Sparkles className="h-3 w-3" />
                        {s.label}: {formatNumber(s.value, form.unit || "S/")}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] mb-1 block">Fecha límite (opcional)</label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-[var(--rule-base)] bg-[var(--surface-alt)] text-[var(--text-primary)] outline-none focus:border-primary transition-all"
                />
              </div>

              {editId && (
                <div>
                  <label className="text-xs font-bold text-[var(--text-secondary)] mb-1 block">Progreso actual</label>
                  <input
                    type="number"
                    min={0}
                    value={form.current}
                    onChange={e => setForm(f => ({ ...f, current: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-[var(--rule-base)] bg-[var(--surface-alt)] text-[var(--text-primary)] outline-none focus:border-primary transition-all"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-lg border border-[var(--rule-base)] text-[var(--text-primary)] text-sm font-semibold hover:bg-[var(--surface-alt)] transition-colors">
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving || !form.name.trim() || !form.target}
                className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
              >
                {saving ? "Guardando…" : <><Check className="h-4 w-4" />{editId ? "Guardar" : "Crear meta"}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Empty state with templates inline ─────────────────────────────────────────

function EmptyStateWithTemplates({ onPick, autoStats }: { onPick: (t: Template) => void; autoStats: AutoStats }) {
  return (
    <div className="bg-white dark:bg-[var(--color-card)] border-2 border-dashed border-[var(--rule-base)] rounded-xl p-8 space-y-6">
      <div className="text-center">
        <Target className="h-12 w-12 text-[var(--text-tertiary)] mx-auto mb-3" />
        <p className="text-[var(--text-primary)] font-bold mb-1">Empezá con una plantilla</p>
        <p className="text-[var(--text-secondary)] text-sm">Elegí lo que querés trackear — los datos se sincronizan solos con tu negocio.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {TEMPLATES.map(t => {
          const auto = pickAutoCurrent(t.category, t.period, autoStats);
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => onPick(t)}
              className="text-left p-4 rounded-xl border border-[var(--rule-base)] hover:border-primary hover:bg-primary/5 transition-colors flex gap-3"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm text-[var(--text-primary)]">{t.label}</p>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{t.description}</p>
                {auto != null && auto > 0 && (
                  <p className="text-xs text-[var(--data-success-500)] mt-1.5 font-semibold">
                    Hoy llevás {formatNumber(Math.round(auto), t.unit)}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
