"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { Target, Trophy, Flame, TrendingUp, Pencil, Check, X, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";

// ─── Dynamic imports (sin SSR) ────────────────────────────────────────────────

const Spinner = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-[#00B4A6] border-t-transparent rounded-full animate-spin" />
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
  const colors = ["#00B4A6", "#f97316", "#2dd4bf", "#f4d03f", "#e76f51"];
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
      <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#00B4A6]/10">
              <Calendar className="w-4 h-4 text-[#00B4A6]" />
            </span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Meta del mes
            </span>
          </div>
          {!editing ? (
            <button
              onClick={() => { setTempGoal(String(monthlyGoal)); setEditing(true); }}
              className="flex items-center gap-1 text-[10px] font-semibold text-gray-400 hover:text-[#00B4A6] transition-colors px-2 py-1 rounded-lg hover:bg-gray-50"
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
                className="w-20 px-2 py-1 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 outline-none focus:border-[#00B4A6]"
              />
              <button onClick={handleSave} className="p-1 rounded-lg hover:bg-emerald-50 text-emerald-600">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setEditing(false)} className="p-1 rounded-lg hover:bg-red-50 text-red-500">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Barra de progreso */}
        <div className="h-4 rounded-full bg-gray-100 overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-700 ease-out", barColor)}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className={cn("font-bold", monthTotal === 0 ? "text-gray-300" : "text-gray-900")}>
            {formatCurrency(monthTotal)}
            <span className="text-xs font-normal text-gray-400 ml-1">
              de {formatCurrency(monthlyGoal, { decimals: 0 })} ({pct.toFixed(0)}%)
            </span>
          </span>
          {pct >= 100 && (
            <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
              <Trophy className="w-3.5 h-3.5" /> Meta alcanzada!
            </span>
          )}
        </div>

        {/* Mini-calendario */}
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
            Días con meta alcanzada
          </p>
          <div className="grid grid-cols-7 gap-1">
            {["L","M","M","J","V","S","D"].map((d, i) => (
              <div key={i} className="text-[9px] text-center text-gray-400 font-bold pb-0.5">{d}</div>
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
                      ? "bg-red-100 text-red-400"
                      : "bg-gray-100 text-gray-400"
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
        <p className="text-sm text-gray-500">
          <span className="font-bold text-gray-900">{totalUnlocked}</span>
          {" "}de{" "}
          <span className="font-bold text-gray-900">{ACHIEVEMENTS_DEF.length}</span>
          {" "}logros desbloqueados
        </p>
        <div className="h-2 w-32 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#00B4A6] transition-all duration-500"
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
                    ? "border-[#00B4A6]/40 bg-gradient-to-b from-[#00B4A6]/5 to-[#00B4A6]/10 shadow-sm"
                    : "border-gray-200 bg-gray-50 opacity-40"
                )}
              >
                {/* Efecto brillo si desbloqueado */}
                {isUnlocked && (
                  <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                    <div className="absolute -inset-full animate-[spin_4s_linear_infinite] bg-gradient-conic from-transparent via-[#00B4A6]/10 to-transparent" />
                  </div>
                )}
                <span className="text-3xl leading-none">{a.emoji}</span>
                <div>
                  <p className={cn(
                    "text-xs font-bold leading-tight",
                    isUnlocked ? "text-gray-900" : "text-gray-600"
                  )}>
                    {a.name}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">
                    {a.desc}
                  </p>
                </div>
                {isUnlocked ? (
                  <span className="text-[9px] font-semibold text-[#00B4A6] bg-[#00B4A6]/10 px-2 py-0.5 rounded-full">
                    {unlocked[a.id]}
                  </span>
                ) : (
                  <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">
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

  const _kpiCards = [
    { label: "Metas activas",   value: String(kpis.active),   icon: Target,      color: "text-[#00B4A6]", bg: "bg-[#00B4A6]/10" },
    { label: "Logradas",        value: String(kpis.achieved), icon: Trophy,       color: "text-amber-600",   bg: "bg-amber-50"        },
    { label: "Racha (días)",    value: String(kpis.streak),   icon: Flame,        color: "text-orange-600", bg: "bg-orange-50"      },
    { label: "Tasa de éxito",   value: `${kpis.rate}%`,       icon: TrendingUp,   color: "text-blue-600",     bg: "bg-blue-50"          },
  ] as const;

  return (
    <div className="space-y-4">
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
