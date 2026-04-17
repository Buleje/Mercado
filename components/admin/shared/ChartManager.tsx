"use client";

import { useState, useCallback, useEffect, type ReactNode } from "react";
import { Plus, X, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import AdminModal from "./AdminModal";

// ── Types ───────────────────────────────────────────────────────────────────

export interface ChartDefinition {
  id: string;
  label: string;
  description?: string;
  component: ReactNode;
}

interface ChartManagerProps {
  /** Unique key per module for localStorage persistence */
  moduleId: string;
  /** All available charts for this module */
  charts: ChartDefinition[];
  /** Optional className for the grid container */
  className?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getStorageKey(moduleId: string) {
  return `chart_manager_visible_${moduleId}`;
}

function loadVisibleIds(moduleId: string, allIds: string[]): string[] {
  if (typeof window === "undefined") return allIds;
  try {
    const raw = localStorage.getItem(getStorageKey(moduleId));
    if (!raw) return allIds;
    const parsed = JSON.parse(raw) as string[];
    // Only keep IDs that exist in current chart definitions
    const valid = parsed.filter(id => allIds.includes(id));
    return valid.length > 0 ? valid : allIds;
  } catch {
    return allIds;
  }
}

function saveVisibleIds(moduleId: string, ids: string[]) {
  try {
    localStorage.setItem(getStorageKey(moduleId), JSON.stringify(ids));
  } catch { /* quota exceeded, ignore */ }
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ChartManager({ moduleId, charts, className }: ChartManagerProps) {
  const allIds = charts.map(c => c.id);
  const [visibleIds, setVisibleIds] = useState<string[]>(() => loadVisibleIds(moduleId, allIds));
  const [modalOpen, setModalOpen] = useState(false);

  // Persist on change
  useEffect(() => {
    saveVisibleIds(moduleId, visibleIds);
  }, [moduleId, visibleIds]);

  const removeChart = useCallback((id: string) => {
    setVisibleIds(prev => prev.filter(v => v !== id));
  }, []);

  const addChart = useCallback((id: string) => {
    setVisibleIds(prev => prev.includes(id) ? prev : [...prev, id]);
  }, []);

  const visibleCharts = charts.filter(c => visibleIds.includes(c.id));
  const hiddenCharts = charts.filter(c => !visibleIds.includes(c.id));

  return (
    <>
      {/* Chart grid */}
      <div className={cn("space-y-4", className)}>
        {visibleCharts.map(chart => (
          <div key={chart.id} className="group relative">
            {/* Remove button on hover */}
            <button
              onClick={() => removeChart(chart.id)}
              className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-white/90 dark:bg-gray-900/90 border border-[var(--rule-base)] hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-300 dark:hover:border-red-800 text-gray-400 hover:text-red-500 "
              title="Quitar gráfico"
            >
              <X className="h-4 w-4" />
            </button>
            {chart.component}
          </div>
        ))}

        {/* Add chart button */}
        <button
          onClick={() => setModalOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-dashed border-[var(--rule-base)] text-gray-400 dark:text-gray-500 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Agregar gráfico
        </button>
      </div>

      {/* Add chart modal */}
      <AdminModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Agregar gráfico"
      >
        <div className="space-y-2 py-2">
          {hiddenCharts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-gray-400 dark:text-gray-500">
              <LayoutGrid className="h-8 w-8" />
              <p className="text-sm font-medium">Todos los gráficos están visibles</p>
              <p className="text-xs">Pasa el mouse sobre un gráfico y presiona X para quitarlo</p>
            </div>
          ) : (
            hiddenCharts.map(chart => (
              <button
                key={chart.id}
                onClick={() => {
                  addChart(chart.id);
                  if (hiddenCharts.length <= 1) setModalOpen(false);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-[var(--rule-base)] hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
              >
                <div className="h-9 w-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                  <Plus className="h-4 w-4 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{chart.label}</p>
                  {chart.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{chart.description}</p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </AdminModal>
    </>
  );
}
