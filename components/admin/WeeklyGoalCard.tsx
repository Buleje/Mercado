"use client";

import { useState, useEffect, useMemo } from "react";
import { Target, Pencil, Check, X, Trophy } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { Sale } from "@/types/erp";

interface WeeklyGoalCardProps {
  sales: Sale[];
}

const MAX_WEEKLY_GOAL = 50_000_000; // S/50M cap defensa contra inputs absurdos

// FIX 2026-05-07: tenant-scoped localStorage key — mismo patrón que daily/monthly.
function getWeeklyGoalKey(): string {
  if (typeof window === "undefined") return "weekly-goal:main";
  const m = window.location.pathname.match(/^\/t\/([^/]+)/);
  return `weekly-goal:${m ? decodeURIComponent(m[1]) : "main"}`;
}

function getMonday(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(diff);
  return monday;
}

export default function WeeklyGoalCard({ sales }: WeeklyGoalCardProps) {
  const [goal, setGoal] = useState(5000);
  const [editing, setEditing] = useState(false);
  const [tempGoal, setTempGoal] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  // FIX 2026-05-07 (B1): tenant-scoped + migración soft del valor viejo.
  useEffect(() => {
    try {
      const tenantKey = getWeeklyGoalKey();
      const stored = localStorage.getItem(tenantKey) ?? localStorage.getItem("weekly-goal");
      if (stored) {
        const parsed = Number(stored);
        if (parsed > 0) {
          setGoal(parsed);
          if (!localStorage.getItem(tenantKey)) {
            localStorage.setItem(tenantKey, String(parsed));
            localStorage.removeItem("weekly-goal");
          }
        }
      }
    } catch { /* ignore */ }
  }, []);

  const weeklySales = useMemo(() => {
    const monday = getMonday();
    return sales
      .filter((s) => {
        try {
          return new Date(s.createdAt) >= monday;
        } catch {
          return false;
        }
      })
      .reduce((acc, s) => acc + (s.total ?? 0), 0);
  }, [sales]);

  const percentage = goal > 0 ? Math.min(100, (weeklySales / goal) * 100) : 0;
  const exceeded = weeklySales > goal;
  const extra = weeklySales - goal;

  // FIX 2026-05-07 (B10): thresholds consistentes con daily/monthly (50/80/100)
  const barColor =
    percentage >= 100 ? "bg-[var(--data-success-500)]" :
    percentage >= 80  ? "bg-primary" :
    percentage >= 50  ? "bg-[var(--data-warning-500)]" :
    "bg-[var(--data-error-500)]";

  // FIX 2026-05-07 (B8): validación visible con cap.
  const handleSave = () => {
    const val = Number(tempGoal);
    if (!Number.isFinite(val) || val <= 0) {
      setEditError("Ingresá un monto mayor a 0");
      return;
    }
    if (val > MAX_WEEKLY_GOAL) {
      setEditError(`Máximo: S/${MAX_WEEKLY_GOAL.toLocaleString("es-PE")}`);
      return;
    }
    setEditError(null);
    setGoal(val);
    try { localStorage.setItem(getWeeklyGoalKey(), String(val)); } catch { /* ignore */ }
    setEditing(false);
  };

  return (
    <div className="rounded-xl border border-[var(--rule-soft)] dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 col-span-2 sm:col-span-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
            <Target className="w-4 h-4 text-primary" />
          </span>
          <div>
            <span className="text-xs font-medium text-[var(--text-secondary)] dark:text-zinc-400">
              Meta de la semana
            </span>
          </div>
        </div>
        {!editing ? (
          <button
            onClick={() => { setTempGoal(String(goal)); setEditing(true); }}
            className="flex items-center gap-1 text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)] dark:text-zinc-500 hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700"
          >
            <Pencil className="w-3 h-3" />
            Editar meta
          </button>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1">
              <span className="text-xs text-[var(--text-secondary)] mr-1">S/</span>
              <input
                type="number"
                value={tempGoal}
                onChange={(e) => { setTempGoal(e.target.value); if (editError) setEditError(null); }}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                min={1}
                max={MAX_WEEKLY_GOAL}
                autoFocus
                aria-invalid={!!editError}
                aria-describedby={editError ? "weekly-goal-error" : undefined}
                className={cn(
                  "w-24 px-2 py-1 text-xs rounded-lg border bg-white dark:bg-zinc-700 text-[var(--text-primary)] dark:text-zinc-100 outline-none",
                  editError ? "border-[var(--data-error-500)] focus:border-[var(--data-error-500)]" : "border-[var(--rule-base)] dark:border-zinc-600 focus:border-primary",
                )}
              />
              <button onClick={handleSave} aria-label="Guardar" className="p-1 rounded-lg hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] text-[var(--data-success-500)]">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => { setEditing(false); setEditError(null); }} aria-label="Cancelar" className="p-1 rounded-lg hover:bg-[var(--data-error-500)]/10 text-[var(--data-error-500)]">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {editError && (
              <p id="weekly-goal-error" role="alert" className="text-xs font-semibold text-[var(--data-error-500)]">
                {editError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Progress bar — D2: tokens DS en vez de gray-100 */}
      <div className="h-4 rounded-full bg-[var(--surface-sunken)] overflow-hidden mb-2">
        <div
          className={cn("h-full rounded-full transition-all duration-[var(--dur-slower)] ease-out", barColor)}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Values */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-[var(--text-primary)] dark:text-zinc-100">
          S/{weeklySales.toFixed(2)}{" "}
          <span className="text-xs font-normal text-[var(--text-tertiary)] dark:text-zinc-500">
            de S/{goal.toFixed(2)} ({percentage.toFixed(0)}%)
          </span>
        </p>
        {exceeded && (
          <span className="flex items-center gap-1 text-xs font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] px-2 py-1 rounded-full">
            <Trophy className="w-3.5 h-3.5" />
            Meta alcanzada! +S/{extra.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  );
}
