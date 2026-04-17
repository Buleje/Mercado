"use client";

import { useState, useEffect, useMemo } from "react";
import { Target, Pencil, Check, X, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Sale } from "@/types/erp";

interface WeeklyGoalCardProps {
  sales: Sale[];
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

  useEffect(() => {
    try {
      const stored = localStorage.getItem("weekly-goal");
      if (stored) {
        const parsed = Number(stored);
        if (parsed > 0) setGoal(parsed);
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

  const barColor =
    percentage >= 70
      ? "bg-emerald-500"
      : percentage >= 30
      ? "bg-amber-500"
      : "bg-red-500";

  const handleSave = () => {
    const val = Number(tempGoal);
    if (val > 0) {
      setGoal(val);
      localStorage.setItem("weekly-goal", String(val));
    }
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
            <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">
              Meta de la semana
            </span>
          </div>
        </div>
        {!editing ? (
          <button
            onClick={() => { setTempGoal(String(goal)); setEditing(true); }}
            className="flex items-center gap-1 text-[length:var(--ts-2xs)] font-semibold text-gray-400 dark:text-zinc-500 hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700"
          >
            <Pencil className="w-3 h-3" />
            Editar meta
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 mr-1">S/</span>
            <input
              type="number"
              value={tempGoal}
              onChange={(e) => setTempGoal(e.target.value)}
              className="w-20 px-2 py-1 text-xs rounded-lg border border-[var(--rule-base)] dark:border-zinc-600 bg-white dark:bg-zinc-700 text-gray-900 dark:text-zinc-100 outline-none focus:border-primary"
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              autoFocus
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

      {/* Progress bar */}
      <div className="h-4 rounded-full bg-gray-100 dark:bg-zinc-700 overflow-hidden mb-2">
        <div
          className={cn("h-full rounded-full transition-all duration-[var(--dur-slower)] ease-out", exceeded ? "bg-emerald-500" : barColor)}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Values */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-gray-900 dark:text-zinc-100">
          S/{weeklySales.toFixed(2)}{" "}
          <span className="text-xs font-normal text-gray-400 dark:text-zinc-500">
            de S/{goal.toFixed(2)} ({percentage.toFixed(0)}%)
          </span>
        </p>
        {exceeded && (
          <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-full">
            <Trophy className="w-3.5 h-3.5" />
            Meta alcanzada! +S/{extra.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  );
}
