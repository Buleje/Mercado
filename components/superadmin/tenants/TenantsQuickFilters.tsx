"use client";

import { etiquetaDePlan } from "@/lib/billing/plan-tiers";
import { useState } from "react";
import { ChevronDown } from "@buleje/design-system/icons";
import type { PlanId } from "@/lib/superadmin-types";

// ── QuickFilters — 4 chips principales + "Más ▾" para Plan/Estado ──────
export function QuickFilters({
  quickFilter,
  applyQuickFilter,
  stats,
  filterPlan,
  setFilterPlan,
  filterActive,
  setFilterActive,
}: {
  quickFilter: string;
  applyQuickFilter: (v: "all" | "active" | "inactive" | "pro" | "enterprise" | "trial" | "pending" | "at-risk") => void;
  stats: { total: number; active: number; inactive: number; trial: number; tenantsWithPending: number; atRisk: number; byPlan: Record<PlanId, number> };
  filterPlan: "all" | PlanId;
  setFilterPlan: (v: "all" | PlanId) => void;
  filterActive: "all" | "active" | "inactive";
  setFilterActive: (v: "all" | "active" | "inactive") => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const principalChips = [
    { id: "all" as const,      label: "Todos",          count: stats.total },
    { id: "active" as const,   label: "Activas",        count: stats.active },
    { id: "trial" as const,    label: "En prueba",      count: stats.trial },
    { id: "at-risk" as const,  label: "En riesgo",      count: stats.atRisk },
    { id: "pending" as const,  label: "Con pendientes", count: stats.tenantsWithPending },
  ];
  const isMoreActive =
    filterPlan !== "all" ||
    filterActive === "inactive" ||
    quickFilter === "pro" ||
    quickFilter === "enterprise" ||
    quickFilter === "inactive";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {principalChips.map((qf) => {
        const isActive = quickFilter === qf.id;
        return (
          <button
            key={qf.id}
            type="button"
            onClick={() => applyQuickFilter(qf.id)}
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold border-2 transition-colors ${
              isActive
                ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
            }`}
          >
            {qf.label}
            <span className={`tabular-nums font-bold ${isActive ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]"}`}>
              {qf.count}
            </span>
          </button>
        );
      })}

      {/* "Más ▾" — popover con plan + estado granulares */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold border-2 transition-colors ${
            isMoreActive || moreOpen
              ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
              : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
          }`}
          aria-expanded={moreOpen}
        >
          Más filtros
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
        </button>
        {moreOpen && (
          <>
            {/* Backdrop para cerrar al clickear afuera */}
            <button
              type="button"
              aria-label="Cerrar"
              onClick={() => setMoreOpen(false)}
              className="fixed inset-0 z-10"
              tabIndex={-1}
            />
            <div className="absolute z-20 mt-2 right-0 sm:left-0 sm:right-auto w-64 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-xl p-3 space-y-3">
              {/* Plan */}
              <div>
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">
                  Plan
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(["all", "free", "pro", "business", "enterprise"] as const).map((p) => {
                    const label = p === "all" ? "Todos" : etiquetaDePlan(p);
                    const count = p === "all" ? stats.total : stats.byPlan[p as PlanId] ?? 0;
                    const isActive = filterPlan === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setFilterPlan(p)}
                        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold transition-colors ${
                          isActive
                            ? "bg-[var(--accent)] text-white"
                            : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--rule-soft)]"
                        }`}
                      >
                        {label}
                        <span className={`tabular-nums text-[length:var(--ts-2xs)] ${isActive ? "text-white/80" : "text-[var(--text-tertiary)]"}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Estado */}
              <div>
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">
                  Estado
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { id: "all", label: "Todos", count: stats.total },
                    { id: "active", label: "Activas", count: stats.active },
                    { id: "inactive", label: "Suspendidas", count: stats.inactive },
                  ] as const).map((s) => {
                    const isActive = filterActive === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setFilterActive(s.id)}
                        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold transition-colors ${
                          isActive
                            ? "bg-[var(--accent)] text-white"
                            : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--rule-soft)]"
                        }`}
                      >
                        {s.label}
                        <span className={`tabular-nums text-[length:var(--ts-2xs)] ${isActive ? "text-white/80" : "text-[var(--text-tertiary)]"}`}>
                          {s.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
