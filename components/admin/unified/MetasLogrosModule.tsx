"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { Target, Trophy, Flame, TrendingUp, Pencil, Check, X, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Dynamic imports (sin SSR) ────────────────────────────────────────────────

const Spinner = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-[#0f766e] border-t-transparent rounded-full animate-spin" />
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

interface Achievement {
  id: string;
  emoji: string;
  name: string;
  desc: string;
  unlockedAt?: string;
}

// ─── Constantes de logros ─────────────────────────────────────────────────────

const ACHIEVEMENTS_DEF: Omit<Achievement, "unlockedAt">[] = [
  { id: "primera-venta",    emoji: "🎯", name: "Primera Venta",      desc: "Registraste tu primera venta" },
  { id: "100-ventas",       emoji: "💯", name: "100 Ventas",          desc: "Llegaste a 100 ventas" },
  { id: "1000-ventas",      emoji: "🚀", name: "1000 Ventas",         desc: "Mil ventas! Increíble" },
  { id: "mejor-dia",        emoji: "📈", name: "Mejor Día",           desc: "Superaste tu récord de ventas diarias" },
  { id: "racha-7",          emoji: "🔥", name: "Racha 7",             desc: "7 días seguidos vendiendo" },
  { id: "racha-30",         emoji: "⚡", name: "Racha 30",            desc: "30 días seguidos vendiendo" },
  { id: "todo-cobrado",     emoji: "✅", name: "Todo Cobrado",        desc: "Todos los fiados al día" },
  { id: "cobrador",         emoji: "💰", name: "Cobrador",            desc: "Cobraste más de S/ 1000 en fiados" },
  { id: "50-clientes",      emoji: "👥", name: "50 Clientes",         desc: "Llegaste a 50 clientes registrados" },
  { id: "vendedor-estrella",emoji: "⭐", name: "Vendedor Estrella",   desc: "Meta diaria alcanzada 5 veces en una semana" },
  { id: "caja-perfecta",    emoji: "🏦", name: "Caja Perfecta",       desc: "Arqueo sin diferencias 3 veces seguidas" },
  { id: "madrugador",       emoji: "🌅", name: "Madrugador",          desc: "Abriste caja antes de las 7am" },
  { id: "cliente-feliz",    emoji: "😊", name: "Cliente Feliz",       desc: "Recibiste 5 reseñas de 5 estrellas" },
  { id: "meta-cumplida",    emoji: "🏆", name: "Meta Cumplida",       desc: "Alcanzaste tu meta mensual" },
];

const LS_ACHIEVEMENTS = "achievements";
const LS_STREAK       = "daily-streak";
const LS_MONTHLY_GOAL = "monthly-goal";

// ─── Confetti simple (igual que DailyGoalTracker) ─────────────────────────────

function Confetti() {
  const colors = ["#0f766e", "#f97316", "#14b8a6", "#f4d03f", "#e76f51"];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl z-10">
      {Array.from({ length: 24 }).map((_, i) => {
        const color = colors[i % colors.length];
        return (
          <div
            key={i}
            className="absolute top-0 animate-bounce"
            style={{
              left: `${(i * 4.2) % 100}%`,
              backgroundColor: color,
              width: 6 + (i % 4) * 2,
              height: 6 + (i % 4) * 2,
              borderRadius: i % 2 === 0 ? "50%" : "2px",
              animationDelay: `${(i * 0.12) % 1.2}s`,
              animationDuration: `${0.8 + (i % 4) * 0.2}s`,
              opacity: 0.85,
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Sub-tab Semana/Mes ───────────────────────────────────────────────────────

function SemaMesTab() {
  const [monthlyGoal, setMonthlyGoal] = useState(50000);
  const [editing, setEditing]         = useState(false);
  const [tempGoal, setTempGoal]       = useState("");
  const [monthTotal, setMonthTotal]   = useState(0);
  const [dailyHits, setDailyHits]     = useState<Record<string, boolean>>({});

  // Cargar meta mensual y datos del mes desde /api/sales
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_MONTHLY_GOAL);
      if (stored) {
        const n = Number(stored);
        if (n > 0) setMonthlyGoal(n);
      }
    } catch { /* ignore */ }

    void (async () => {
      try {
        const res = await fetch("/api/sales?limit=500", { credentials: "include" });
        if (!res.ok) return;
        const data: { total: number; createdAt: string }[] = await res.json();
        const now   = new Date();
        const year  = now.getFullYear();
        const month = now.getMonth();

        const dailyMap: Record<string, number> = {};
        let total = 0;

        for (const s of Array.isArray(data) ? data : []) {
          const d = new Date(s.createdAt);
          if (d.getFullYear() !== year || d.getMonth() !== month) continue;
          total += s.total ?? 0;
          const key = d.toISOString().slice(0, 10);
          dailyMap[key] = (dailyMap[key] ?? 0) + (s.total ?? 0);
        }

        // Meta diaria aprox = monthly / días del mes
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const dailyTarget = monthlyGoal / daysInMonth;
        const hits: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(dailyMap)) {
          hits[k] = v >= dailyTarget;
        }

        setMonthTotal(total);
        setDailyHits(hits);
      } catch { /* silent */ }
    })();
  }, [monthlyGoal]);

  const pct = Math.min(100, monthlyGoal > 0 ? (monthTotal / monthlyGoal) * 100 : 0);
  const barColor = pct >= 70 ? "bg-emerald-500" : pct >= 30 ? "bg-amber-500" : "bg-red-500";

  const handleSave = () => {
    const val = Number(tempGoal);
    if (val > 0) {
      setMonthlyGoal(val);
      localStorage.setItem(LS_MONTHLY_GOAL, String(val));
    }
    setEditing(false);
  };

  // Mini-calendario del mes actual
  const calendarDays = useMemo(() => {
    const now       = new Date();
    const year      = now.getFullYear();
    const month     = now.getMonth();
    const total     = new Date(year, month + 1, 0).getDate();
    const firstDay  = new Date(year, month, 1).getDay(); // 0=dom
    // Ajustar para que lunes sea columna 0
    const offset    = firstDay === 0 ? 6 : firstDay - 1;
    return { total, offset, year, month };
  }, []);

  return (
    <div className="space-y-4">
      {/* WeeklyGoalCard necesita prop sales — se pasa array vacío como fallback */}
      <WeeklyGoalCard sales={[]} />

      {/* Card mensual */}
      <div className="rounded-2xl border border-gray-200 dark:border-card-border bg-white dark:bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#0f766e]/10">
              <Calendar className="w-4 h-4 text-[#0f766e] dark:text-emerald-400" />
            </span>
            <span className="text-xs font-semibold text-gray-500 dark:text-muted uppercase tracking-wide">
              Meta del mes
            </span>
          </div>
          {!editing ? (
            <button
              onClick={() => { setTempGoal(String(monthlyGoal)); setEditing(true); }}
              className="flex items-center gap-1 text-[10px] font-semibold text-gray-400 hover:text-[#0f766e] transition-colors px-2 py-1 rounded-lg hover:bg-gray-50 dark:hover:bg-surface"
            >
              <Pencil className="w-3 h-3" /> Editar
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500 mr-1">S/</span>
              <input
                type="number"
                value={tempGoal}
                onChange={(e) => setTempGoal(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                autoFocus
                className="w-20 px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-gray-900 dark:text-foreground outline-none focus:border-[#0f766e]"
              />
              <button onClick={handleSave} className="p-1 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-600">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setEditing(false)} className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Barra de progreso */}
        <div className="h-4 rounded-full bg-gray-100 dark:bg-surface overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-700 ease-out", barColor)}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-bold text-gray-900 dark:text-foreground">
            S/{monthTotal.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
            <span className="text-xs font-normal text-gray-400 dark:text-muted ml-1">
              de S/{monthlyGoal.toLocaleString("es-PE")} ({pct.toFixed(0)}%)
            </span>
          </span>
          {pct >= 100 && (
            <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-full">
              <Trophy className="w-3.5 h-3.5" /> Meta alcanzada!
            </span>
          )}
        </div>

        {/* Mini-calendario */}
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-2 uppercase tracking-wide">
            Días con meta alcanzada
          </p>
          <div className="grid grid-cols-7 gap-1">
            {["L","M","M","J","V","S","D"].map((d, i) => (
              <div key={i} className="text-[9px] text-center text-gray-400 dark:text-muted font-bold pb-0.5">{d}</div>
            ))}
            {/* Celdas vacías de offset */}
            {Array.from({ length: calendarDays.offset }).map((_, i) => (
              <div key={`off-${i}`} />
            ))}
            {/* Días del mes */}
            {Array.from({ length: calendarDays.total }).map((_, i) => {
              const day = i + 1;
              const key = `${calendarDays.year}-${String(calendarDays.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const hit = dailyHits[key];
              const today = new Date();
              const isPast = new Date(calendarDays.year, calendarDays.month, day) <= today;
              return (
                <div
                  key={day}
                  title={key}
                  className={cn(
                    "aspect-square rounded flex items-center justify-center text-[10px] font-semibold",
                    hit
                      ? "bg-emerald-500 text-white"
                      : isPast
                      ? "bg-red-100 dark:bg-red-900/20 text-red-400"
                      : "bg-gray-100 dark:bg-surface text-gray-400 dark:text-muted"
                  )}
                >
                  {day}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-tab Logros ───────────────────────────────────────────────────────────

function LogrosTab() {
  const [unlocked, setUnlocked]     = useState<Record<string, string>>({});
  const [showConfetti, setConfetti] = useState(false);

  // Cargar logros desde localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_ACHIEVEMENTS);
      if (stored) setUnlocked(JSON.parse(stored) as Record<string, string>);
    } catch { /* ignore */ }
  }, []);

  // Verificar nuevos logros con datos del dashboard
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/dashboard", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json() as {
          totalOrders?: number;
          totalCustomers?: number;
          totalSalesToday?: number;
        };

        const streak  = Number(localStorage.getItem(LS_STREAK) ?? 0);
        const current = (() => {
          try { return JSON.parse(localStorage.getItem(LS_ACHIEVEMENTS) ?? "{}") as Record<string, string>; }
          catch { return {} as Record<string, string>; }
        })();
        const now     = new Date().toLocaleDateString("es-PE");
        let changed   = false;
        const next    = { ...current };

        const unlock = (id: string) => {
          if (!next[id]) { next[id] = now; changed = true; }
        };

        if ((data.totalOrders ?? 0) >= 1)    unlock("primera-venta");
        if ((data.totalOrders ?? 0) >= 100)  unlock("100-ventas");
        if ((data.totalOrders ?? 0) >= 1000) unlock("1000-ventas");
        if ((data.totalCustomers ?? 0) >= 50) unlock("50-clientes");
        if (streak >= 7)  unlock("racha-7");
        if (streak >= 30) unlock("racha-30");

        if (changed) {
          localStorage.setItem(LS_ACHIEVEMENTS, JSON.stringify(next));
          setUnlocked(next);
          setConfetti(true);
          setTimeout(() => setConfetti(false), 3500);
        }
      } catch { /* silent */ }
    })();
  }, []);

  const totalUnlocked = Object.keys(unlocked).length;

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-muted">
          <span className="font-bold text-gray-900 dark:text-foreground">{totalUnlocked}</span>
          {" "}de{" "}
          <span className="font-bold text-gray-900 dark:text-foreground">{ACHIEVEMENTS_DEF.length}</span>
          {" "}logros desbloqueados
        </p>
        <div className="h-2 w-32 rounded-full bg-gray-100 dark:bg-surface overflow-hidden">
          <div
            className="h-full rounded-full bg-[#0f766e] transition-all duration-500"
            style={{ width: `${(totalUnlocked / ACHIEVEMENTS_DEF.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Grid de badges */}
      <div className="relative">
        {showConfetti && <Confetti />}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {ACHIEVEMENTS_DEF.map((a) => {
            const isUnlocked = Boolean(unlocked[a.id]);
            return (
              <div
                key={a.id}
                className={cn(
                  "relative rounded-2xl border p-4 flex flex-col items-center text-center gap-2 transition-all duration-300",
                  isUnlocked
                    ? "border-[#0f766e]/40 dark:border-emerald-700/50 bg-gradient-to-b from-[#0f766e]/5 to-[#0f766e]/10 dark:from-emerald-900/20 dark:to-emerald-900/10 shadow-sm"
                    : "border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface opacity-40"
                )}
              >
                {/* Efecto brillo si desbloqueado */}
                {isUnlocked && (
                  <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                    <div className="absolute -inset-full animate-[spin_4s_linear_infinite] bg-gradient-conic from-transparent via-[#0f766e]/10 to-transparent" />
                  </div>
                )}
                <span className="text-3xl leading-none">{a.emoji}</span>
                <div>
                  <p className={cn(
                    "text-xs font-bold leading-tight",
                    isUnlocked ? "text-gray-900 dark:text-foreground" : "text-gray-600 dark:text-muted"
                  )}>
                    {a.name}
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-muted mt-0.5 leading-tight">
                    {a.desc}
                  </p>
                </div>
                {isUnlocked ? (
                  <span className="text-[9px] font-semibold text-[#0f766e] dark:text-emerald-400 bg-[#0f766e]/10 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
                    {unlocked[a.id]}
                  </span>
                ) : (
                  <span className="text-[9px] font-semibold text-gray-400 dark:text-muted uppercase tracking-wide">
                    Bloqueado
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

const TABS = [
  { id: "mis-metas"  as TabId, label: "Mis Metas",   icon: Target    },
  { id: "hoy"        as TabId, label: "Hoy",          icon: TrendingUp },
  { id: "semana-mes" as TabId, label: "Semana/Mes",   icon: Calendar  },
  { id: "logros"     as TabId, label: "Logros",       icon: Trophy    },
];

interface Props {
  tenantId?: string;
}

export default function MetasLogrosModule({ tenantId: _tenantId }: Props) {
  const [tab, setTab] = useState<TabId>("mis-metas");

  // KPIs desde /api/goals
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

  const kpis = useMemo(() => {
    const active   = goals.length;
    const achieved = goals.filter((g) => g.current >= g.target).length;
    const rate     = active > 0 ? Math.round((achieved / active) * 100) : 0;
    return { active, achieved, streak, rate };
  }, [goals, streak]);

  const kpiCards = [
    { label: "Metas activas",   value: String(kpis.active),   icon: Target,      color: "text-[#0f766e] dark:text-emerald-400", bg: "bg-[#0f766e]/10 dark:bg-emerald-900/20" },
    { label: "Logradas",        value: String(kpis.achieved), icon: Trophy,       color: "text-amber-600 dark:text-amber-400",   bg: "bg-amber-50 dark:bg-amber-900/20"        },
    { label: "Racha (días)",    value: String(kpis.streak),   icon: Flame,        color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-900/20"      },
    { label: "Tasa de éxito",   value: `${kpis.rate}%`,       icon: TrendingUp,   color: "text-blue-600 dark:text-blue-400",     bg: "bg-blue-50 dark:bg-blue-900/20"          },
  ] as const;

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-[#0f766e] text-white flex items-center justify-center shadow-sm shrink-0">
          <Target className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Metas y Logros</h1>
          <p className="text-xs text-gray-500 dark:text-muted">Trackea objetivos, racha y desbloquea logros</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {kpiCards.map((k) => {
          const Icon = k.icon;
          return (
            <div
              key={k.label}
              className="rounded-2xl border border-gray-200 dark:border-card-border bg-white dark:bg-card p-3 sm:p-4 flex items-center gap-3"
            >
              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", k.bg)}>
                <Icon className={cn("h-4 w-4", k.color)} />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-extrabold text-gray-900 dark:text-foreground leading-none">{k.value}</p>
                <p className="text-[10px] text-gray-400 dark:text-muted mt-0.5 leading-tight">{k.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pill-tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-surface rounded-xl p-1 overflow-x-auto scrollbar-none">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors min-h-[44px]",
                tab === t.id
                  ? "bg-[#0f766e] text-white shadow-sm"
                  : "text-gray-600 dark:text-muted hover:bg-gray-200 dark:hover:bg-gray-700"
              )}
              aria-current={tab === t.id ? "page" : undefined}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Contenido del tab activo */}
      <div>
        {tab === "mis-metas"  && <GoalsTab />}
        {tab === "hoy"        && <DailyGoalTracker />}
        {tab === "semana-mes" && <SemaMesTab />}
        {tab === "logros"     && <LogrosTab />}
      </div>
    </div>
  );
}
