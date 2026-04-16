"use client";

import { useState } from "react";
import { Trophy, Target, Star, Flame, Download } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

type Goal = {
  id: string; title: string; description: string; metric: string; currentValue: number;
  targetValue: number; unit: string; deadline: string; category: string;
  status: "pendiente" | "en-progreso" | "completado" | "vencido"; priority: "alta" | "media" | "baja";
  milestones: { label: string; value: number; reached: boolean }[];
};

const SEED: Goal[] = [];

const PRIORITY_COLORS = { alta: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", media: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", baja: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" };
const STATUS_COLORS = { pendiente: "bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400", "en-progreso": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", completado: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", vencido: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" };

function fmt(v: number, unit: string) { return unit === "S/" ? `S/ ${v.toLocaleString("es-PE")}` : `${v} ${unit}`; }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }

export default function GoalTrackerTab() {
  const [goals] = useState(SEED);
  const completed = goals.filter(g => g.status === "completado").length;
  const inProgress = goals.filter(g => g.status === "en-progreso").length;

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2"><Trophy className="h-6 w-6 text-primary" /> Tablero de Metas</h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Seguimiento visual de objetivos del negocio</p>
        </div>
        <button onClick={() => exportToCSV(goals.map(g => ({ titulo: g.title, actual: g.currentValue, meta: g.targetValue, unidad: g.unit, estado: g.status, prioridad: g.priority, fecha_limite: fmtDate(g.deadline) })), "metas")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-primary hover:bg-primary/10"><Download className="h-3.5 w-3.5" /> CSV</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Metas totales", value: goals.length, color: "text-emerald-500", icon: Target },
          { label: "En progreso", value: inProgress, color: "text-amber-500", icon: Flame },
          { label: "Completadas", value: completed, color: "text-emerald-500", icon: Trophy },
          { label: "Tasa de éxito", value: `${goals.length > 0 ? Math.round((completed / goals.length) * 100) : 0}%`, color: "text-violet-500", icon: Star },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4 flex flex-wrap items-center gap-3">
            <k.icon className={cn("h-5 w-5", k.color)} />
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-muted">{k.label}</p>
              <p className={cn("text-xl font-extrabold", k.color)}>{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {goals.map(g => {
          const inverse = g.title.includes("Agotamiento") || g.title.includes("Tiempo");
          const progress = inverse
            ? g.currentValue <= g.targetValue ? 100 : Math.max(0, Math.min(((g.targetValue / g.currentValue) * 100), 100))
            : Math.min((g.currentValue / g.targetValue) * 100, 100);

          return (
            <div key={g.id} className={cn("bg-white dark:bg-card rounded-2xl border p-3 sm:p-5", g.status === "completado" ? "border-emerald-200 dark:border-emerald-900/30" : "border-gray-200 dark:border-card-border")}>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-extrabold text-gray-900 dark:text-foreground">{g.title}</h3>
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", STATUS_COLORS[g.status])}>{g.status}</span>
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", PRIORITY_COLORS[g.priority])}>{g.priority}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-muted">{g.description}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xl font-extrabold text-gray-900 dark:text-foreground">{Math.round(progress)}%</p>
                  <p className="text-[10px] text-gray-400">Fecha límite: {fmtDate(g.deadline)}</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="relative">
                <div className="h-3 bg-gray-100 dark:bg-surface rounded-full overflow-hidden mb-2">
                  <div className={cn("h-full rounded-full transition-all", g.status === "completado" ? "bg-emerald-500" : progress >= 80 ? "bg-emerald-500" : progress >= 50 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${progress}%` }} />
                </div>
                {/* Milestones */}
                <div className="flex justify-between">
                  {g.milestones.map((m, i) => (
                    <div key={i} className="flex flex-col items-center">
                      <div className={cn("h-3 w-3 rounded-full border-2", m.reached ? "bg-emerald-500 border-emerald-500" : "bg-white dark:bg-card border-gray-300 dark:border-card-border")} />
                      <span className="text-[9px] text-gray-400 mt-0.5">{m.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-card-border text-xs text-gray-500 dark:text-muted">
                <span>{g.category}</span>
                <span>Actual: <b className="text-gray-900 dark:text-foreground">{fmt(g.currentValue, g.unit)}</b> / Meta: <b className="text-primary">{fmt(g.targetValue, g.unit)}</b></span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
