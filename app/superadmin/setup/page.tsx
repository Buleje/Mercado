"use client";

/**
 * /superadmin/setup
 *
 * Panel central de "Setup Pendiente" — orquestador delgado tras el refactor
 * 2026-04-06. La lógica vive distribuida en:
 *   - lib/superadmin/setup-types.ts   — types, calcScore, PRIORITY_CONFIG, storage
 *   - lib/superadmin/setup-data.tsx   — SCORES, CATEGORY_ICON, SETUP_ITEMS
 *   - components/superadmin/setup/
 *       SetupStatsCard.tsx    — progreso global + celebración
 *       ScoreDashboard.tsx    — los 2 scoreboards
 *       SetupItemCard.tsx     — card individual de un item
 *
 * Esta página solo maneja:
 *   - Estado de statuses (localStorage)
 *   - Handlers toggleStatus + setBlocked
 *   - Memoization de filtered + stats + sorted
 *   - Layout + header + filter bar + lista renderizada
 */

import { useMemo, useState } from "react";
import { Filter, Wrench } from "lucide-react";
import {
  loadStatuses,
  saveStatuses,
  type Priority,
  type Status,
} from "@/lib/superadmin/setup-types";
import { SCORES, SETUP_ITEMS } from "@/lib/superadmin/setup-data";
import SetupStatsCard from "@/components/superadmin/setup/SetupStatsCard";
import ScoreDashboard from "@/components/superadmin/setup/ScoreDashboard";
import SetupItemCard from "@/components/superadmin/setup/SetupItemCard";

export default function SuperAdminSetupPage() {
  const [statuses, setStatuses] = useState<Record<string, Status>>(() => loadStatuses());
  const [filter, setFilter] = useState<"all" | Status>("all");

  const toggleStatus = (id: string) => {
    setStatuses((prev) => {
      const current = prev[id] ?? "pending";
      const next: Status = current === "done" ? "pending" : "done";
      const updated = { ...prev, [id]: next };
      saveStatuses(updated);
      return updated;
    });
  };

  const setBlocked = (id: string, blocked: boolean) => {
    setStatuses((prev) => {
      const updated = { ...prev, [id]: blocked ? "blocked" : "pending" } as Record<string, Status>;
      saveStatuses(updated);
      return updated;
    });
  };

  const filteredItems = useMemo(() => {
    if (filter === "all") return SETUP_ITEMS;
    return SETUP_ITEMS.filter((item) => (statuses[item.id] ?? "pending") === filter);
  }, [filter, statuses]);

  const stats = useMemo(() => {
    let pending = 0;
    let done = 0;
    let blocked = 0;
    let totalMinutes = 0;
    let pendingMinutes = 0;

    for (const item of SETUP_ITEMS) {
      const status = statuses[item.id] ?? "pending";
      totalMinutes += item.estimatedMinutes;
      if (status === "done") done++;
      else if (status === "blocked") blocked++;
      else {
        pending++;
        pendingMinutes += item.estimatedMinutes;
      }
    }

    return { pending, done, blocked, total: SETUP_ITEMS.length, totalMinutes, pendingMinutes };
  }, [statuses]);

  const allDone = stats.done === stats.total;

  // Sort: críticos pendientes primero, luego high, luego done al final
  const sortedItems = useMemo(() => {
    const priorityOrder: Priority[] = ["critical", "high", "medium", "low"];
    return [...filteredItems].sort((a, b) => {
      const sa = statuses[a.id] ?? "pending";
      const sb = statuses[b.id] ?? "pending";
      if (sa === "done" && sb !== "done") return 1;
      if (sb === "done" && sa !== "done") return -1;
      return priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority);
    });
  }, [filteredItems, statuses]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-600/10 flex items-center justify-center">
            <Wrench className="w-5 h-5 text-[var(--accent)]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Setup Pendiente</h1>
            <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
              Acciones que solo tú puedes hacer (tokens, OAuth, dashboards externos)
            </p>
          </div>
        </div>
      </div>

      {/* Stats + celebración */}
      <SetupStatsCard stats={stats} allDone={allDone} />

      {/* Scoreboards de buenas prácticas */}
      <ScoreDashboard scores={SCORES} />

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-gray-400" />
        <span className="text-xs text-[var(--text-tertiary)] mr-2">Filtrar:</span>
        {(["all", "pending", "done", "blocked"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={[
              "px-3 py-1 text-xs font-semibold rounded-full transition-colors",
              filter === f
                ? "bg-teal-600 text-white"
                : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-gray-200 dark:hover:bg-gray-700",
            ].join(" ")}
          >
            {f === "all" ? "Todos" : f === "pending" ? "Pendientes" : f === "done" ? "Hechos" : "Bloqueados"}
          </button>
        ))}
      </div>

      {/* Items list */}
      <div className="space-y-3">
        {sortedItems.map((item) => (
          <SetupItemCard
            key={item.id}
            item={item}
            status={statuses[item.id] ?? "pending"}
            onToggleStatus={toggleStatus}
            onSetBlocked={setBlocked}
          />
        ))}
      </div>

      {/* Footer info */}
      <div className="text-xs text-gray-400 dark:text-gray-600 text-center pt-4 border-t border-[var(--rule-base)]">
        El estado de cada item se guarda en tu navegador (localStorage) — no se sincroniza entre dispositivos.
      </div>
    </div>
  );
}
