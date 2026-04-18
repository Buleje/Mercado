"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";

import { useState } from "react";
import { Trophy, Target, Star, Flame, Download } from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

type Goal = {
  id: string; title: string; description: string; metric: string; currentValue: number;
  targetValue: number; unit: string; deadline: string; category: string;
  status: "pendiente" | "en-progreso" | "completado" | "vencido"; priority: "alta" | "media" | "baja";
  milestones: { label: string; value: number; reached: boolean }[];
};

const SEED: Goal[] = [];

const PRIORITY_COLORS = { alta: "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-[var(--data-error)]/30 dark:text-[var(--data-error)]", media: "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/30 dark:text-[var(--data-warning)]", baja: "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]" };
const STATUS_COLORS = { pendiente: "bg-gray-100 text-[var(--text-secondary)] dark:bg-gray-700/30 dark:text-[var(--text-tertiary)]", "en-progreso": "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]", completado: "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]", vencido: "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-[var(--data-error)]/30 dark:text-[var(--data-error)]" };

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
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2"><Trophy className="h-6 w-6 text-primary" /> Tablero de Metas</SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Seguimiento visual de objetivos del negocio</p>
        </div>
        <button onClick={() => exportToCSV(goals.map(g => ({ titulo: g.title, actual: g.currentValue, meta: g.targetValue, unidad: g.unit, estado: g.status, prioridad: g.priority, fecha_limite: fmtDate(g.deadline) })), "metas")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-primary hover:bg-primary/10"><Download className="h-3.5 w-3.5" /> CSV</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Metas totales", value: goals.length, color: "text-[var(--data-success)]", icon: Target },
          { label: "En progreso", value: inProgress, color: "text-[var(--data-warning)]", icon: Flame },
          { label: "Completadas", value: completed, color: "text-[var(--data-success)]", icon: Trophy },
          { label: "Tasa de éxito", value: `${goals.length > 0 ? Math.round((completed / goals.length) * 100) : 0}%`, color: "text-[var(--text-secondary)]", icon: Star },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-4 flex flex-wrap items-center gap-3">
            <k.icon className={cn("h-5 w-5", k.color)} />
            <div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">{k.label}</p>
              <p className={cn("text-xl font-extrabold", k.color)}>{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-6">
        {goals.map(g => {
          const inverse = g.title.includes("Agotamiento") || g.title.includes("Tiempo");
          const progress = inverse
            ? g.currentValue <= g.targetValue ? 100 : Math.max(0, Math.min(((g.targetValue / g.currentValue) * 100), 100))
            : Math.min((g.currentValue / g.targetValue) * 100, 100);

          return (
            <div key={g.id} className={cn("bg-white dark:bg-card rounded-xl border p-3 sm:p-5", g.status === "completado" ? "border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30" : "border-[var(--rule-base)] dark:border-card-border")}>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground">{g.title}</CardTitle>
                    <span className={cn("text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full", STATUS_COLORS[g.status])}>{g.status}</span>
                    <span className={cn("text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full", PRIORITY_COLORS[g.priority])}>{g.priority}</span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{g.description}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground">{Math.round(progress)}%</p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Fecha límite: {fmtDate(g.deadline)}</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="relative">
                <div className="h-3 bg-gray-100 dark:bg-surface rounded-full overflow-hidden mb-2">
                  <div className={cn("h-full rounded-full transition-all", g.status === "completado" ? "bg-[var(--accent-soft)]" : progress >= 80 ? "bg-[var(--accent-soft)]" : progress >= 50 ? "bg-[var(--data-warning)]" : "bg-[var(--data-error)]")} style={{ width: `${progress}%` }} />
                </div>
                {/* Milestones */}
                <div className="flex justify-between">
                  {g.milestones.map((m, i) => (
                    <div key={i} className="flex flex-col items-center">
                      <div className={cn("h-3 w-3 rounded-full border-2", m.reached ? "bg-[var(--accent-soft)] border-[var(--data-success)]/30" : "bg-white dark:bg-card border-[var(--rule-base)] dark:border-card-border")} />
                      <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">{m.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--rule-soft)] dark:border-card-border text-xs text-[var(--text-secondary)] dark:text-muted">
                <span>{g.category}</span>
                <span>Actual: <b className="text-[var(--text-primary)] dark:text-foreground">{fmt(g.currentValue, g.unit)}</b> / Meta: <b className="text-primary">{fmt(g.targetValue, g.unit)}</b></span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
