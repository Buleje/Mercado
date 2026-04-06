"use client";

import { useState, useEffect } from "react";
import { TrendingUp, ShoppingCart, Users, Package, Bell, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

const KPIS = [
  { label: "Ventas hoy", target: 2450, prefix: "S/ ", suffix: "", icon: <TrendingUp className="h-4 w-4" />, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30", change: "+18%" },
  { label: "Pedidos", target: 47, prefix: "", suffix: "", icon: <ShoppingCart className="h-4 w-4" />, color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30", change: "+12%" },
  { label: "Clientes nuevos", target: 8, prefix: "", suffix: "", icon: <Users className="h-4 w-4" />, color: "text-violet-600 bg-violet-50 dark:bg-violet-950/30", change: "+3" },
  { label: "Productos activos", target: 342, prefix: "", suffix: "", icon: <Package className="h-4 w-4" />, color: "text-orange-600 bg-orange-50 dark:bg-orange-950/30", change: "342" },
];

const CHART_DATA = [35, 42, 38, 55, 48, 62, 58, 72, 65, 78, 70, 85];
const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const ALERTS = [
  { text: "Atun A1 170g se agota en 2 dias", type: "warn" },
  { text: "Leche Gloria 1L vence el viernes", type: "critical" },
  { text: "Nuevo pedido #1847 de Maria Lopez", type: "info" },
  { text: "Meta de ventas diaria alcanzada!", type: "success" },
];

function useAnimatedNumber(target: number, duration: number = 1500) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        setValue(target);
        clearInterval(timer);
      } else {
        setValue(Math.round(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return value;
}

function AnimatedKPI({ kpi }: { kpi: typeof KPIS[number] }) {
  const value = useAnimatedNumber(kpi.target);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", kpi.color)}>
          {kpi.icon}
        </div>
        <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
          <ArrowUpRight className="h-3 w-3" />{kpi.change}
        </span>
      </div>
      <p className="text-xl font-extrabold text-gray-900 dark:text-white">
        {kpi.prefix}{value.toLocaleString()}{kpi.suffix}
      </p>
      <p className="text-[10px] text-gray-400 mt-0.5">{kpi.label}</p>
    </div>
  );
}

export default function SaasDashboardDemo() {
  const [visibleAlerts, setVisibleAlerts] = useState(0);
  const maxBar = Math.max(...CHART_DATA);

  useEffect(() => {
    const timers = ALERTS.map((_, i) =>
      setTimeout(() => setVisibleAlerts(i + 1), 2000 + i * 800)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <section className="py-20 sm:py-28 bg-white dark:bg-background overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full mb-4">
            <TrendingUp className="h-3 w-3" /> Dashboard en vivo
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white">
            Asi se ve tu negocio digitalizado
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-2">Datos que se actualizan en tiempo real. Esto es lo que veras cada dia.</p>
        </div>

        {/* Mock dashboard */}
        <div className="bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6 shadow-xl">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {KPIS.map((kpi) => (
              <AnimatedKPI key={kpi.label} kpi={kpi} />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Chart */}
            <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-bold text-gray-700 dark:text-gray-300">Ventas mensuales</p>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-full">+23% vs anterior</span>
              </div>
              <div className="flex items-end gap-1.5 h-32">
                {CHART_DATA.map((val, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t transition-all duration-1000 ease-out bg-gradient-to-t from-teal-500 to-teal-400"
                      style={{
                        height: `${(val / maxBar) * 100}%`,
                        animationDelay: `${i * 100}ms`,
                      }}
                    />
                    <span className="text-[8px] text-gray-400">{MONTHS[i]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Alertas */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-3">
                <Bell className="h-4 w-4 text-amber-500" />
                <p className="text-xs font-bold text-gray-700 dark:text-gray-300">Alertas del dia</p>
              </div>
              <div className="space-y-2">
                {ALERTS.slice(0, visibleAlerts).map((alert, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-start gap-2 p-2.5 rounded-lg text-xs transition-all duration-300",
                      alert.type === "critical" && "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400",
                      alert.type === "warn" && "bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400",
                      alert.type === "info" && "bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400",
                      alert.type === "success" && "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400",
                    )}
                  >
                    <div className={cn(
                      "h-1.5 w-1.5 rounded-full mt-1 shrink-0",
                      alert.type === "critical" && "bg-red-500",
                      alert.type === "warn" && "bg-amber-500",
                      alert.type === "info" && "bg-blue-500",
                      alert.type === "success" && "bg-emerald-500",
                    )} />
                    {alert.text}
                  </div>
                ))}
                {visibleAlerts < ALERTS.length && (
                  <div className="flex items-center gap-2 p-2 text-[10px] text-gray-300">
                    <div className="h-2 w-2 rounded-full bg-gray-200 animate-pulse" />
                    Cargando alertas...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
