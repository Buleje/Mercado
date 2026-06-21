"use client";

import {
  Fragment,
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { Plus, X, LayoutGrid } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import AdminModal from "./AdminModal";

// ── Types ───────────────────────────────────────────────────────────────────

export interface ChartDefinition {
  id: string;
  label: string;
  description?: string;
  /**
   * Optional section group — when set, charts with the same `section` render
   * under a shared header. Charts move with their section preserved.
   * Useful for organizing dashboard pages into "Crecimiento", "Operación", etc.
   */
  section?: string;
  component: ReactNode;
}

interface ChartManagerProps {
  /** Unique key per module for localStorage persistence */
  moduleId: string;
  /** All available charts for this module */
  charts: ChartDefinition[];
  /** Optional className for the grid container */
  className?: string;
  /**
   * Estado vacío UNIFICADO. Cuando TODOS los gráficos visibles reportan que no
   * tienen datos (vía `useReportChartEmpty`), en vez del muro de gráficos en
   * cero se muestra esto — igual que el empty-state de Inicio. Brandon 2026-06-21.
   * Si no se pasa, el grid se muestra igual (backward-compatible).
   */
  emptyState?: ReactNode;
}

// ── Reporte de vacío por gráfico (Brandon 2026-06-21) ────────────────────────
// Cada gráfico, una vez cargados sus datos, reporta si está vacío vía el hook
// `useReportChartEmpty`. ChartManager OCULTA los gráficos vacíos y, si TODOS los
// visibles están vacíos, muestra el `emptyState` unificado. Los gráficos que no
// usan el hook nunca se reportan → se muestran siempre (backward-compatible).
interface ChartSlotCtx {
  id: string;
  report: (id: string, isEmpty: boolean) => void;
}
const ChartSlotContext = createContext<ChartSlotCtx | null>(null);

/**
 * ChartSlot — provee el contexto de reporte a UN gráfico. El value se memoiza
 * por (id, report) para que sea ESTABLE entre renders; si no, el `useEffect` de
 * useReportChartEmpty se dispararía en cada render (loop "Maximum update depth").
 */
function ChartSlot({ id, report, children }: ChartSlotCtx & { children: ReactNode }) {
  const value = useMemo<ChartSlotCtx>(() => ({ id, report }), [id, report]);
  return <ChartSlotContext.Provider value={value}>{children}</ChartSlotContext.Provider>;
}

/**
 * useReportChartEmpty — desde dentro de un gráfico, reporta si está vacío.
 * @param isEmpty true cuando el gráfico no tiene datos reales que mostrar.
 * @param ready   false mientras carga (no se reporta vacío hasta tener la data).
 *
 * Mientras `ready` es false se reporta NO-vacío (se ve el skeleton del gráfico,
 * no se oculta). Al desmontar, limpia su reporte. Es no-op fuera de un
 * ChartManager (seguro de usar en gráficos standalone).
 */
export function useReportChartEmpty(isEmpty: boolean, ready: boolean = true) {
  const ctx = useContext(ChartSlotContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.report(ctx.id, ready ? isEmpty : false);
    return () => ctx.report(ctx.id, false);
  }, [ctx, isEmpty, ready]);
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

export default function ChartManager({ moduleId, charts, className, emptyState }: ChartManagerProps) {
  const allIds = charts.map(c => c.id);
  const [visibleIds, setVisibleIds] = useState<string[]>(() => loadVisibleIds(moduleId, allIds));
  const [modalOpen, setModalOpen] = useState(false);
  // Mapa id→vacío reportado por cada gráfico (ver useReportChartEmpty).
  const [emptyMap, setEmptyMap] = useState<Record<string, boolean>>({});

  const report = useCallback((id: string, isEmpty: boolean) => {
    setEmptyMap(prev => (prev[id] === isEmpty ? prev : { ...prev, [id]: isEmpty }));
  }, []);

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

  // Página entera vacía: TODOS los gráficos visibles reportaron vacío. Los que
  // no usan el hook quedan `undefined` → no cuentan como vacío → no se dispara.
  const allReportedEmpty =
    visibleCharts.length > 0 && visibleCharts.every(c => emptyMap[c.id] === true);
  const showEmptyState = Boolean(emptyState) && allReportedEmpty;

  return (
    <>
      {/* Empty-state unificado cuando no hay NINGÚN dato en la página */}
      {showEmptyState && emptyState}

      {/* Chart grid — se mantiene montado (oculto) cuando showEmptyState para
          que los gráficos sigan refrescando y reaparezcan al llegar datos. */}
      <div className={cn("space-y-6", showEmptyState && "hidden", className)}>
        {visibleCharts.map((chart, idx) => {
          const prevSection = idx > 0 ? visibleCharts[idx - 1].section : undefined;
          const showSectionHeader = chart.section && chart.section !== prevSection;
          const chartIsEmpty = emptyMap[chart.id] === true;
          return (
            <Fragment key={chart.id}>
              {showSectionHeader && !chartIsEmpty && (
                <h2 className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] mt-4 -mb-1 tracking-tight">
                  {chart.section}
                </h2>
              )}
              {/* El gráfico vacío se OCULTA (hidden), no se desmonta: sigue
                  fetcheando y reaparece si llegan datos. */}
              <div className={cn("group relative", chartIsEmpty && "hidden")}>
                {/* Remove button on hover */}
                <button
                  onClick={() => removeChart(chart.id)}
                  className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-white/90 dark:bg-gray-900/90 border border-[var(--rule-base)] hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/30 hover:border-[var(--data-error-500)] dark:hover:border-[var(--data-error-500)] text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] "
                  title="Quitar gráfico"
                >
                  <X className="h-4 w-4" />
                </button>
                <ChartSlot id={chart.id} report={report}>
                  {chart.component}
                </ChartSlot>
              </div>
            </Fragment>
          );
        })}

        {/* Add chart button */}
        <button
          onClick={() => setModalOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)] hover:border-gray-300 dark:hover:border-gray-600 hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-tertiary)] transition-colors text-sm font-medium"
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
            <div className="flex flex-col items-center gap-2 py-8 text-[var(--text-tertiary)]">
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
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-[var(--rule-base)] hover:border-gray-300 dark:hover:border-gray-600 hover:bg-[var(--surface-sunken)]/50 transition-colors text-left"
              >
                <div className="h-9 w-9 rounded-lg bg-[var(--surface-sunken)] flex items-center justify-center shrink-0">
                  <Plus className="h-4 w-4 text-[var(--text-secondary)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{chart.label}</p>
                  {chart.description && (
                    <p className="text-xs text-[var(--text-tertiary)] truncate">{chart.description}</p>
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
