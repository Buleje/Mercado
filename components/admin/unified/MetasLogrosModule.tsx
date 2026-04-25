"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  Target, Trophy, Flame, TrendingUp, TrendingDown, Pencil, Check, X, Calendar,
  Award, Rocket, Zap, Coins, Users, Star, Landmark, Sunrise, Smile,
  Lock, Sparkles, ShoppingCart, BarChart3,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";

// ─── Dynamic imports (sin SSR) ────────────────────────────────────────────────

const Spinner = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const GoalsTab = dynamic(() => import("@/components/admin/GoalsTab"), { ssr: false, loading: Spinner });
const DailyGoalTracker = dynamic(() => import("@/components/admin/DailyGoalTracker"), { ssr: false, loading: Spinner });
const WeeklyGoalCard = dynamic(() => import("@/components/admin/WeeklyGoalCard"), { ssr: false, loading: Spinner });

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TabId = "mis-metas" | "hoy" | "semana-mes" | "logros";

interface Goal {
  id: string;
  target: number;
  current: number;
}

type AchievementCategory = "ventas" | "clientes" | "rachas" | "operacion";

interface AchievementDef {
  id: string;
  Icon: LucideIcon;
  name: string;
  desc: string;
  category: AchievementCategory;
  threshold?: number;
  unit?: string;
  computeProgress?: (ctx: AchCtx) => { current: number; target: number };
}

interface SaleRecord {
  id?: string;
  total?: number;
  createdAt?: string;
}

interface AchCtx {
  totalOrders: number;
  totalCustomers: number;
  todayTotal: number;
  streak: number;
  collectedFiados: number;
  goalsAchievedThisMonth: number;
  earlyOpens: number;
}

// ─── Constantes de logros ─────────────────────────────────────────────────────

const ACHIEVEMENTS_DEF: AchievementDef[] = [
  { id: "primera-venta",     Icon: Target,      name: "Primera Venta",     desc: "Registrar la primera venta",            category: "ventas",   threshold: 1,    unit: "ventas",
    computeProgress: (c) => ({ current: c.totalOrders, target: 1 }) },
  { id: "100-ventas",        Icon: Award,       name: "100 Ventas",        desc: "Llegar a 100 ventas",                   category: "ventas",   threshold: 100,  unit: "ventas",
    computeProgress: (c) => ({ current: c.totalOrders, target: 100 }) },
  { id: "1000-ventas",       Icon: Rocket,      name: "1000 Ventas",       desc: "Mil ventas — leyenda",                  category: "ventas",   threshold: 1000, unit: "ventas",
    computeProgress: (c) => ({ current: c.totalOrders, target: 1000 }) },
  { id: "mejor-dia",         Icon: TrendingUp,  name: "Mejor Día",         desc: "Superar tu récord de ventas diarias",   category: "ventas",   threshold: 5000, unit: "S/",
    computeProgress: (c) => ({ current: c.todayTotal, target: 5000 }) },
  { id: "racha-3",           Icon: Flame,       name: "Racha 3",           desc: "3 días seguidos vendiendo",             category: "rachas",   threshold: 3,    unit: "días",
    computeProgress: (c) => ({ current: c.streak, target: 3 }) },
  { id: "racha-7",           Icon: Flame,       name: "Racha 7",           desc: "7 días seguidos vendiendo",             category: "rachas",   threshold: 7,    unit: "días",
    computeProgress: (c) => ({ current: c.streak, target: 7 }) },
  { id: "racha-30",          Icon: Zap,         name: "Racha 30",          desc: "30 días seguidos vendiendo",            category: "rachas",   threshold: 30,   unit: "días",
    computeProgress: (c) => ({ current: c.streak, target: 30 }) },
  { id: "todo-cobrado",      Icon: Check,       name: "Todo Cobrado",      desc: "Todos los fiados al día",               category: "operacion",threshold: 1,    unit: "veces",
    computeProgress: (c) => ({ current: c.collectedFiados >= 1 ? 1 : 0, target: 1 }) },
  { id: "cobrador",          Icon: Coins,       name: "Cobrador",          desc: "Cobrar +S/1.000 en fiados",             category: "operacion",threshold: 1000, unit: "S/",
    computeProgress: (c) => ({ current: c.collectedFiados, target: 1000 }) },
  { id: "50-clientes",       Icon: Users,       name: "50 Clientes",       desc: "Llegar a 50 clientes registrados",      category: "clientes", threshold: 50,   unit: "clientes",
    computeProgress: (c) => ({ current: c.totalCustomers, target: 50 }) },
  { id: "100-clientes",      Icon: Users,       name: "100 Clientes",      desc: "Llegar a 100 clientes",                 category: "clientes", threshold: 100,  unit: "clientes",
    computeProgress: (c) => ({ current: c.totalCustomers, target: 100 }) },
  { id: "vendedor-estrella", Icon: Star,        name: "Vendedor Estrella", desc: "Cumplir meta diaria 5 veces seguidas",  category: "rachas",   threshold: 5,    unit: "días",
    computeProgress: (c) => ({ current: Math.min(c.streak, 5), target: 5 }) },
  { id: "caja-perfecta",     Icon: Landmark,    name: "Caja Perfecta",     desc: "Arqueo sin diferencias 3x seguidas",    category: "operacion",threshold: 3,    unit: "veces",
    computeProgress: () => ({ current: 0, target: 3 }) },
  { id: "madrugador",        Icon: Sunrise,     name: "Madrugador",        desc: "Abrir caja antes de las 7 AM",          category: "operacion",threshold: 1,    unit: "veces",
    computeProgress: (c) => ({ current: c.earlyOpens, target: 1 }) },
  { id: "cliente-feliz",     Icon: Smile,       name: "Cliente Feliz",     desc: "Recibir 5 reseñas de 5 estrellas",      category: "clientes", threshold: 5,    unit: "reseñas",
    computeProgress: () => ({ current: 0, target: 5 }) },
  { id: "meta-cumplida",     Icon: Trophy,      name: "Meta Cumplida",     desc: "Alcanzar tu meta mensual",              category: "operacion",threshold: 1,    unit: "veces",
    computeProgress: (c) => ({ current: c.goalsAchievedThisMonth, target: 1 }) },
];

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  ventas: "Ventas", clientes: "Clientes", rachas: "Rachas", operacion: "Operación",
};

const LS_ACHIEVEMENTS = "achievements";
const LS_STREAK       = "daily-streak";
const LS_MONTHLY_GOAL = "monthly-goal";

// ─── Confetti ─────────────────────────────────────────────────────────────────

function Confetti() {
  const colors = ["var(--color-primary)", "#f97316", "#2dd4bf", "#f4d03f", "#e76f51"];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl z-10">
      {Array.from({ length: 24 }).map((_, i) => (
        <div
          key={i}
          className="absolute top-0 animate-bounce"
          style={{
            left: `${(i * 4.2) % 100}%`,
            backgroundColor: colors[i % colors.length],
            width: 6 + (i % 4) * 2,
            height: 6 + (i % 4) * 2,
            borderRadius: i % 2 === 0 ? "50%" : "2px",
            animationDelay: `${(i * 0.12) % 1.2}s`,
            animationDuration: `${0.8 + (i % 4) * 0.2}s`,
            opacity: 0.85,
          }}
        />
      ))}
    </div>
  );
}

// ─── Sub-tab Semana/Mes ───────────────────────────────────────────────────────

function SemaMesTab() {
  const [monthlyGoal, setMonthlyGoal] = useState(50000);
  const [editing, setEditing]         = useState(false);
  const [tempGoal, setTempGoal]       = useState("");
  const [sales, setSales]             = useState<SaleRecord[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_MONTHLY_GOAL);
      const n = stored ? Number(stored) : NaN;
      if (Number.isFinite(n) && n > 0) setMonthlyGoal(n);
    } catch { /* ignore */ }

    void (async () => {
      try {
        const res = await fetch("/api/sales?limit=1000", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        setSales(Array.isArray(data) ? data : []);
      } catch { /* silent */ }
    })();
  }, []);

  // ─── Stats mensuales + comparativos ─────────────────────────────────────
  const stats = useMemo(() => {
    const now   = new Date();
    const year  = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();

    const lastMonthDate = new Date(year, month - 1, 1);
    const lastMonthYear = lastMonthDate.getFullYear();
    const lastMonth = lastMonthDate.getMonth();

    const dailyMap: Record<string, number> = {};
    const dailyCounts: Record<string, number> = {};
    let monthTotal = 0;
    let monthCount = 0;
    let lastMonthTotalUntilDay = 0;
    let lastMonthTotal = 0;

    for (const s of sales) {
      if (!s.createdAt) continue;
      const d = new Date(s.createdAt);
      const total = Number(s.total ?? 0);
      if (d.getFullYear() === year && d.getMonth() === month) {
        monthTotal += total;
        monthCount += 1;
        const key = d.toISOString().slice(0, 10);
        dailyMap[key] = (dailyMap[key] ?? 0) + total;
        dailyCounts[key] = (dailyCounts[key] ?? 0) + 1;
      } else if (d.getFullYear() === lastMonthYear && d.getMonth() === lastMonth) {
        lastMonthTotal += total;
        if (d.getDate() <= today) lastMonthTotalUntilDay += total;
      }
    }

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dailyTarget = monthlyGoal / daysInMonth;
    const hits: Record<string, boolean> = {};
    let bestDayKey: string | null = null;
    let bestDayValue = 0;
    let metDaysCount = 0;

    for (const [k, v] of Object.entries(dailyMap)) {
      hits[k] = v >= dailyTarget;
      if (v > bestDayValue) { bestDayValue = v; bestDayKey = k; }
      if (hits[k]) metDaysCount += 1;
    }

    // Forecast
    const elapsedDays = Math.max(1, today);
    const dailyRate = monthTotal / elapsedDays;
    const forecast = Math.round(dailyRate * daysInMonth);

    const aov = monthCount > 0 ? monthTotal / monthCount : 0;
    const deltaVsLastMonth = lastMonthTotalUntilDay > 0
      ? ((monthTotal - lastMonthTotalUntilDay) / lastMonthTotalUntilDay) * 100
      : null;

    return {
      year, month, today, daysInMonth,
      monthTotal, monthCount, aov,
      dailyMap, dailyCounts, hits,
      bestDayKey, bestDayValue, metDaysCount,
      lastMonthTotal, lastMonthTotalUntilDay, deltaVsLastMonth,
      forecast, dailyTarget,
    };
  }, [sales, monthlyGoal]);

  const pct = Math.min(100, monthlyGoal > 0 ? (stats.monthTotal / monthlyGoal) * 100 : 0);
  const barColor = pct >= 70 ? "bg-[var(--accent-soft)]" : pct >= 30 ? "bg-[var(--data-warning)]" : "bg-[var(--data-error)]";

  const handleSave = () => {
    const val = Number(tempGoal);
    if (Number.isFinite(val) && val > 0) {
      setMonthlyGoal(val);
      try { localStorage.setItem(LS_MONTHLY_GOAL, String(val)); } catch { /* ignore */ }
    }
    setEditing(false);
  };

  const calendarDays = useMemo(() => {
    const firstDay = new Date(stats.year, stats.month, 1).getDay();
    const offset   = firstDay === 0 ? 6 : firstDay - 1;
    return { offset };
  }, [stats.year, stats.month]);

  const bestDayLabel = stats.bestDayKey
    ? new Date(stats.bestDayKey).toLocaleDateString("es-PE", { day: "numeric", month: "short" })
    : "—";

  return (
    <div className="space-y-4">
      {/* Card semanal con datos reales */}
      <WeeklyGoalCard sales={sales as never} />

      {/* KPIs del mes */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPISimple label="Total mes"       value={formatCurrency(stats.monthTotal)} delta={stats.deltaVsLastMonth} sub="vs mes anterior al día" icon={TrendingUp} />
        <KPISimple label="Ticket promedio" value={stats.aov > 0 ? formatCurrency(stats.aov) : "Sin ventas"}            sub={`${stats.monthCount} transacciones`}        icon={ShoppingCart} />
        <KPISimple label="Mejor día"       value={bestDayLabel}                       sub={stats.bestDayValue > 0 ? formatCurrency(stats.bestDayValue) : "—"} icon={Star}       />
        <KPISimple label="Días con meta"   value={`${stats.metDaysCount}/${stats.today}`}                              sub={`Meta diaria ${formatCurrency(stats.dailyTarget, { decimals: 0 })}`} icon={Target} />
      </div>

      {/* Card mensual */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-white p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
              <Calendar className="w-4 h-4 text-primary" />
            </span>
            <span className="text-xs font-semibold text-[var(--text-secondary)]">Meta del mes</span>
          </div>
          {!editing ? (
            <button
              onClick={() => { setTempGoal(String(monthlyGoal)); setEditing(true); }}
              className="flex items-center gap-1 text-xs font-semibold text-[var(--text-tertiary)] hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-gray-50"
            >
              <Pencil className="w-3 h-3" /> Editar
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-xs text-[var(--text-secondary)] mr-1">S/</span>
              <input
                type="number"
                value={tempGoal}
                onChange={(e) => setTempGoal(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                autoFocus
                className="w-24 px-2 py-1 text-xs rounded-lg border border-[var(--rule-base)] bg-white outline-none focus:border-primary"
              />
              <button onClick={handleSave} aria-label="Guardar" className="p-1 rounded-lg hover:bg-[var(--accent-soft)] text-[var(--data-success)]">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setEditing(false)} aria-label="Cancelar" className="p-1 rounded-lg hover:bg-[var(--data-error-50)] text-[var(--data-error)]">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="h-4 rounded-full bg-gray-100 overflow-hidden">
          <div className={cn("h-full rounded-full transition-all duration-[var(--dur-slower)] ease-out", barColor)} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2 text-sm">
          <span className={cn("font-bold", stats.monthTotal === 0 ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]")}>
            {formatCurrency(stats.monthTotal)}
            <span className="text-xs font-normal text-[var(--text-tertiary)] ml-1">
              de {formatCurrency(monthlyGoal, { decimals: 0 })} ({pct.toFixed(0)}%)
            </span>
          </span>
          {pct >= 100 && (
            <span className="flex items-center gap-1 text-xs font-bold text-[var(--data-success)] bg-[var(--accent-soft)] px-2 py-1 rounded-full">
              <Trophy className="w-3.5 h-3.5" /> Meta alcanzada!
            </span>
          )}
        </div>

        {/* Forecast */}
        {stats.forecast > 0 && pct < 100 && (
          <div className={cn(
            "rounded-lg p-3 flex items-start gap-2 border",
            stats.forecast >= monthlyGoal
              ? "border-[var(--data-success)]/30 bg-[var(--accent-soft)]"
              : "border-[var(--data-warning)]/30 bg-[var(--data-warning-50)]"
          )}>
            <Sparkles className={cn(
              "h-4 w-4 shrink-0 mt-0.5",
              stats.forecast >= monthlyGoal ? "text-[var(--data-success)]" : "text-[var(--data-warning)]"
            )} />
            <div className="text-xs">
              <p className="font-bold text-[var(--text-primary)]">
                A este ritmo cerrás el mes con {formatCurrency(stats.forecast, { decimals: 0 })}
              </p>
              <p className="text-[var(--text-secondary)] mt-0.5">
                {stats.forecast >= monthlyGoal
                  ? `Vas a superar la meta por ${formatCurrency(stats.forecast - monthlyGoal, { decimals: 0 })}.`
                  : `Te van a faltar ${formatCurrency(Math.max(0, monthlyGoal - stats.forecast), { decimals: 0 })} para alcanzarla.`}
              </p>
            </div>
          </div>
        )}

        {/* Mini-calendario */}
        <div>
          <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Días con meta alcanzada</p>
          <div className="grid grid-cols-7 gap-1">
            {["L","M","M","J","V","S","D"].map((d, i) => (
              <div key={i} className="text-xs text-center text-[var(--text-tertiary)] font-bold pb-0.5">{d}</div>
            ))}
            {Array.from({ length: calendarDays.offset }).map((_, i) => <div key={`off-${i}`} />)}
            {Array.from({ length: stats.daysInMonth }).map((_, i) => {
              const day = i + 1;
              const key = `${stats.year}-${String(stats.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const hit = stats.hits[key];
              const isToday = day === stats.today;
              const isPast = day <= stats.today;
              return (
                <div
                  key={day}
                  title={`${key}${stats.dailyMap[key] ? ` · ${formatCurrency(stats.dailyMap[key], { decimals: 0 })}` : ""}`}
                  className={cn(
                    "aspect-square rounded flex items-center justify-center text-xs font-semibold border transition-colors",
                    isToday          ? "ring-2 ring-primary ring-offset-1 border-transparent" : "border-transparent",
                    hit              ? "bg-[var(--accent-soft)] text-[var(--data-success)] border-[var(--data-success)]/30" :
                    isPast && day > 0 ? "bg-[var(--data-error-50)] text-[var(--data-error)]" :
                    "bg-gray-50 text-[var(--text-tertiary)]"
                  )}
                >
                  {day}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-3 text-xs">
            <span className="flex items-center gap-1 text-[var(--text-secondary)]">
              <span className="inline-block w-3 h-3 rounded bg-[var(--accent-soft)] border border-[var(--data-success)]/30" /> Cumplió
            </span>
            <span className="flex items-center gap-1 text-[var(--text-secondary)]">
              <span className="inline-block w-3 h-3 rounded bg-[var(--data-error-50)]" /> No cumplió
            </span>
            <span className="flex items-center gap-1 text-[var(--text-secondary)]">
              <span className="inline-block w-3 h-3 rounded bg-gray-50" /> Próximo
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── KPI helper para Sema/Mes ─────────────────────────────────────────────────

interface KPISimpleProps {
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  icon: LucideIcon;
}

function KPISimple({ label, value, sub, delta, icon: Icon }: KPISimpleProps) {
  return (
    <div className="bg-white border border-[var(--rule-base)] rounded-xl p-4 flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] truncate">{label}</span>
        <Icon className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
      </div>
      <p className="text-xl font-extrabold tabular-nums leading-none truncate text-[var(--text-primary)]">{value}</p>
      <div className="flex items-center gap-1.5 text-xs">
        {delta != null && (
          <span className={cn(
            "inline-flex items-center gap-0.5 font-bold",
            delta >= 0 ? "text-[var(--data-success)]" : "text-[var(--data-error)]"
          )}>
            {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(Math.round(delta))}%
          </span>
        )}
        {sub && <span className="text-[var(--text-tertiary)] truncate">{sub}</span>}
      </div>
    </div>
  );
}

// ─── Sub-tab Logros ───────────────────────────────────────────────────────────

type AchFilter = "todos" | "desbloqueados" | "bloqueados";

function LogrosTab() {
  const [unlocked, setUnlocked]     = useState<Record<string, string>>({});
  const [showConfetti, setConfetti] = useState(false);
  const [ctx, setCtx]               = useState<AchCtx>({
    totalOrders: 0, totalCustomers: 0, todayTotal: 0, streak: 0,
    collectedFiados: 0, goalsAchievedThisMonth: 0, earlyOpens: 0,
  });
  const [filter, setFilter]         = useState<AchFilter>("todos");
  const [activeCategory, setActiveCategory] = useState<AchievementCategory | "all">("all");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_ACHIEVEMENTS);
      if (stored) setUnlocked(JSON.parse(stored) as Record<string, string>);
    } catch { /* ignore */ }
  }, []);

  // Cargar contexto de progreso (dashboard + goals + sales)
  useEffect(() => {
    void (async () => {
      try {
        const [dashRes, goalsRes, salesRes] = await Promise.all([
          fetch("/api/admin/dashboard", { credentials: "include" }),
          fetch("/api/goals", { credentials: "include" }),
          fetch("/api/sales?limit=200", { credentials: "include" }),
        ]);

        const dash = dashRes.ok ? await dashRes.json() as { totalOrders?: number; totalCustomers?: number; totalSalesToday?: number } : {};
        const goals = goalsRes.ok ? await goalsRes.json() as Array<{ target: number; current: number; period?: string }> : [];
        const sales = salesRes.ok ? await salesRes.json() as SaleRecord[] : [];

        const today = new Date().toDateString();
        const todayTotal = (Array.isArray(sales) ? sales : [])
          .filter((s) => s.createdAt && new Date(s.createdAt).toDateString() === today)
          .reduce((a, s) => a + Number(s.total ?? 0), 0);

        const goalsAchievedThisMonth = goals.filter(g => g.period === "mensual" && g.current >= g.target).length;

        const streak = Number(localStorage.getItem(LS_STREAK) ?? 0);
        const earlyOpens = Number(localStorage.getItem("early-opens") ?? 0);

        const newCtx: AchCtx = {
          totalOrders: dash.totalOrders ?? 0,
          totalCustomers: dash.totalCustomers ?? 0,
          todayTotal,
          streak,
          collectedFiados: 0,
          goalsAchievedThisMonth,
          earlyOpens,
        };
        setCtx(newCtx);

        // Detectar nuevos desbloqueos
        const current = (() => {
          try { return JSON.parse(localStorage.getItem(LS_ACHIEVEMENTS) ?? "{}") as Record<string, string>; }
          catch { return {}; }
        })();
        const now = new Date().toLocaleDateString("es-PE");
        let changed = false;
        const next = { ...current };

        for (const a of ACHIEVEMENTS_DEF) {
          const p = a.computeProgress?.(newCtx);
          if (p && p.current >= p.target && !next[a.id]) {
            next[a.id] = now;
            changed = true;
          }
        }

        if (changed) {
          localStorage.setItem(LS_ACHIEVEMENTS, JSON.stringify(next));
          setUnlocked(next);
          setConfetti(true);
          setTimeout(() => setConfetti(false), 3500);
        }
      } catch { /* silent */ }
    })();
  }, []);

  // Próximo logro: el más cerca de desbloquearse (menor pct restante)
  const nextAchievement = useMemo(() => {
    const candidates = ACHIEVEMENTS_DEF
      .filter(a => !unlocked[a.id] && a.computeProgress)
      .map(a => {
        const p = a.computeProgress!(ctx);
        const pct = p.target > 0 ? (p.current / p.target) * 100 : 0;
        return { def: a, current: p.current, target: p.target, pct };
      })
      .filter(x => x.pct < 100 && x.target > 0)
      .sort((a, b) => b.pct - a.pct);
    return candidates[0] ?? null;
  }, [unlocked, ctx]);

  const totalUnlocked = Object.keys(unlocked).length;
  const counts = useMemo(() => {
    const c = { todos: ACHIEVEMENTS_DEF.length, desbloqueados: totalUnlocked, bloqueados: ACHIEVEMENTS_DEF.length - totalUnlocked };
    return c;
  }, [totalUnlocked]);

  // Filtrar achievements
  const visible = useMemo(() => {
    return ACHIEVEMENTS_DEF.filter(a => {
      if (activeCategory !== "all" && a.category !== activeCategory) return false;
      if (filter === "desbloqueados" && !unlocked[a.id]) return false;
      if (filter === "bloqueados" && unlocked[a.id]) return false;
      return true;
    });
  }, [filter, activeCategory, unlocked]);

  return (
    <div className="space-y-6">
      {/* Resumen + barra global */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-white p-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-[var(--data-warning)]" />
          <p className="text-sm text-[var(--text-secondary)]">
            <span className="font-bold text-[var(--text-primary)]">{totalUnlocked}</span>
            {" "}de{" "}
            <span className="font-bold text-[var(--text-primary)]">{ACHIEVEMENTS_DEF.length}</span>
            {" "}logros
          </p>
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-[var(--dur-slow)]"
              style={{ width: `${(totalUnlocked / ACHIEVEMENTS_DEF.length) * 100}%` }}
            />
          </div>
        </div>
        <p className="text-xs font-bold text-[var(--text-secondary)] tabular-nums">
          {Math.round((totalUnlocked / ACHIEVEMENTS_DEF.length) * 100)}%
        </p>
      </div>

      {/* Próximo logro */}
      {nextAchievement && (() => {
        const NextIcon = nextAchievement.def.Icon;
        return (
        <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="text-xs font-bold uppercase tracking-wider text-primary">Próximo logro</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-white border border-primary/30 flex items-center justify-center shrink-0">
              <NextIcon className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[var(--text-primary)]">{nextAchievement.def.name}</p>
              <p className="text-xs text-[var(--text-tertiary)] mb-2">{nextAchievement.def.desc}</p>
              <div className="h-2 rounded-full bg-white overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-[var(--dur-slow)]"
                  style={{ width: `${Math.min(100, nextAchievement.pct)}%` }}
                />
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1.5 font-semibold">
                {Math.round(nextAchievement.current).toLocaleString("es-PE")} / {nextAchievement.target.toLocaleString("es-PE")} {nextAchievement.def.unit}
                {" — "}
                {Math.round(nextAchievement.pct)}%
              </p>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { id: "todos",         label: "Todos",         count: counts.todos         },
          { id: "desbloqueados", label: "Desbloqueados", count: counts.desbloqueados },
          { id: "bloqueados",    label: "Bloqueados",    count: counts.bloqueados    },
        ] as const).map(p => (
          <button
            key={p.id}
            onClick={() => setFilter(p.id)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border",
              filter === p.id
                ? "bg-[var(--text-primary)] text-white border-[var(--text-primary)]"
                : "bg-white text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)]"
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

        <span className="text-[var(--rule-base)] mx-1">|</span>

        <button
          onClick={() => setActiveCategory("all")}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border",
            activeCategory === "all"
              ? "bg-primary/10 text-primary border-primary/30"
              : "bg-white text-[var(--text-tertiary)] border-[var(--rule-base)] hover:text-[var(--text-primary)]"
          )}
        >
          Todas las categorías
        </button>
        {(Object.keys(CATEGORY_LABELS) as AchievementCategory[]).map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border",
              activeCategory === cat
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-white text-[var(--text-tertiary)] border-[var(--rule-base)] hover:text-[var(--text-primary)]"
            )}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Grid de badges */}
      <div className="relative">
        {showConfetti && <Confetti />}
        {visible.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-[var(--rule-base)] rounded-xl p-10 text-center">
            <Trophy className="h-10 w-10 text-[var(--text-tertiary)] mx-auto mb-3" />
            <p className="text-[var(--text-secondary)] font-semibold">No hay logros en este filtro</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {visible.map((a) => {
              const isUnlocked = Boolean(unlocked[a.id]);
              const progress = a.computeProgress?.(ctx);
              const pct = progress && progress.target > 0 ? Math.min(100, (progress.current / progress.target) * 100) : 0;
              return (
                <div
                  key={a.id}
                  className={cn(
                    "relative rounded-xl border p-4 flex flex-col items-center text-center gap-2 transition-all duration-[var(--dur-base)]",
                    isUnlocked
                      ? "border-[var(--data-warning)]/40 bg-white elev-1"
                      : "border-[var(--rule-base)] bg-[var(--surface-sunken)]"
                  )}
                >
                  {isUnlocked && (
                    <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
                      <div className="absolute -inset-full animate-[spin_4s_linear_infinite] bg-gradient-conic from-transparent via-primary/10 to-transparent" />
                    </div>
                  )}
                  <div className={cn(
                    "h-10 w-10 shrink-0 rounded-lg flex items-center justify-center border relative",
                    isUnlocked
                      ? "bg-[var(--data-warning-50)] border-[var(--data-warning)]/30 text-[var(--data-warning)]"
                      : "bg-gray-100 border-[var(--rule-base)] text-[var(--text-tertiary)]"
                  )}>
                    {isUnlocked ? <a.Icon className="h-5 w-5" strokeWidth={1.5} /> : <Lock className="h-4 w-4" />}
                  </div>
                  <div className="relative z-[1]">
                    <p className={cn("text-xs font-bold leading-tight", isUnlocked ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]")}>
                      {a.name}
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)] mt-0.5 leading-tight">{a.desc}</p>
                  </div>
                  {/* Progreso o fecha */}
                  {isUnlocked ? (
                    <span className="text-xs font-semibold text-[var(--data-warning)] bg-[var(--data-warning-50)] px-2 py-0.5 rounded-full">
                      {unlocked[a.id]}
                    </span>
                  ) : progress ? (
                    <div className="w-full mt-1 relative z-[1]">
                      <div className="h-1.5 rounded-full bg-white overflow-hidden">
                        <div className="h-full bg-primary transition-all duration-[var(--dur-slow)]" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-xs text-[var(--text-tertiary)] mt-1 tabular-nums">
                        {Math.round(progress.current).toLocaleString("es-PE")} / {progress.target.toLocaleString("es-PE")}
                      </p>
                    </div>
                  ) : (
                    <span className="text-xs font-semibold text-[var(--text-tertiary)]">Bloqueado</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

const MODULE_ID = "metas-logros";

const TABS = [
  { id: "mis-metas",  label: "Mis Metas",   icon: Target    },
  { id: "hoy",        label: "Hoy",          icon: TrendingUp },
  { id: "semana-mes", label: "Semana/Mes",   icon: Calendar  },
  { id: "logros",     label: "Logros",       icon: Trophy    },
];

interface Props {
  tenantId?: string;
}

export default function MetasLogrosModule({ tenantId: _tenantId }: Props) {
  const [tab, setTab] = useState<TabId>("mis-metas");

  const [goals, setGoals]   = useState<Goal[]>([]);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/goals", { credentials: "include" });
        if (res.ok) setGoals(await res.json() as Goal[]);
      } catch { /* silent */ }
    })();

    try {
      const s = Number(localStorage.getItem(LS_STREAK) ?? 0);
      setStreak(s);
    } catch { /* ignore */ }
  }, []);

  const _kpis = useMemo(() => {
    const active   = goals.length;
    const achieved = goals.filter((g) => g.current >= g.target).length;
    const rate     = active > 0 ? Math.round((achieved / active) * 100) : 0;
    return { active, achieved, streak, rate };
  }, [goals, streak]);

  return (
    <div className="space-y-6">
      <AdminModuleHeader
        title="Metas y Logros"
        description="Seguimiento de objetivos, racha diaria y logros desbloqueados"
        icon={Target}
      />
      <AdminTabBar
        tabs={TABS}
        activeTab={tab}
        onTabChange={(id) => setTab(id as TabId)}
        moduleId={MODULE_ID}
      >
        <div>
          {tab === "mis-metas"  && <GoalsTab />}
          {tab === "hoy"        && <DailyGoalTracker />}
          {tab === "semana-mes" && <SemaMesTab />}
          {tab === "logros"     && <LogrosTab />}
        </div>
      </AdminTabBar>
    </div>
  );
}
