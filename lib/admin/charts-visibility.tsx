"use client";

// Sistema de visibility de gráficos para los dashboards del admin.
// Brandon mayo 2026: cada gráfico se registra con un id estable. El usuario
// puede abrir un modal y togglear cuáles ver. Los gráficos sin datos se
// ocultan por default (defaultVisible=false). Persiste en localStorage por
// moduleId (resumen, ventas, caja, inventario, compras, clientes).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BarChart3, Eye, EyeOff, GripVertical } from "@buleje/design-system/icons";
import { Modal } from "@/components/Modal";

// ── Types ──────────────────────────────────────────────────────────────────

interface ChartMeta {
  id: string;
  label: string;
  /** Por defecto true. Si el chart no tiene datos suficientes, pasa false. */
  hasData: boolean;
  /**
   * Por defecto true. Si false, el chart está oculto al inicio (charts
   * avanzados/secundarios). El user puede mostrarlo desde el modal.
   * Brandon mayo 2026 v3: fix bug — antes el manager NO usaba este campo,
   * causando que el modal dijera "VISIBLE" pero el chart no se mostraba
   * hasta el segundo click.
   */
  defaultVisible: boolean;
}

interface ChartsVisibilityState {
  /** Mapa chartId -> visible */
  visibility: Record<string, boolean>;
  /**
   * Ref mutable al registry (charts registrados al mount). El modal lee
   * `registryRef.current` al abrir — no usamos state para evitar ciclos
   * de re-render cuando cada chart se registra.
   */
  registryRef: { current: Map<string, ChartMeta> };
  /** Setter público para que el usuario toggle */
  setVisible: (id: string, visible: boolean) => void;
  /** Llamado por cada chart para registrarse */
  register: (meta: ChartMeta) => void;
  /** Llamado por cada chart al unmount */
  unregister: (id: string) => void;
}

const Ctx = createContext<ChartsVisibilityState | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────

interface ProviderProps {
  /** Id del módulo (resumen, ventas, caja, …) — usado en localStorage key. */
  moduleId: string;
  children: ReactNode;
}

export function ChartsVisibilityProvider({ moduleId, children }: ProviderProps) {
  const storageKey = `bsm-charts-visibility:${moduleId}`;
  const registryRef = useRef<Map<string, ChartMeta>>(new Map());
  const [visibility, setVisibilityState] = useState<Record<string, boolean>>({});

  // Cargar prefs del localStorage al mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        if (parsed && typeof parsed === "object") setVisibilityState(parsed);
      }
    } catch {
      /* localStorage no disponible o JSON malformado */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setVisible = useCallback(
    (id: string, visible: boolean) => {
      setVisibilityState((prev) => {
        const next = { ...prev, [id]: visible };
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* silent */
        }
        return next;
      });
    },
    [storageKey],
  );

  // Setters estables — no causan re-renders del provider. El registry vive
  // en una ref; el modal lee `registryRef.current` cuando se abre.
  const register = useCallback((meta: ChartMeta) => {
    registryRef.current.set(meta.id, meta);
  }, []);

  const unregister = useCallback((id: string) => {
    registryRef.current.delete(id);
  }, []);

  // Solo `visibility` cambia y dispara re-renders. register/unregister/
  // setVisible son estables.
  const value = useMemo<ChartsVisibilityState>(
    () => ({
      visibility,
      registryRef,
      setVisible,
      register,
      unregister,
    }),
    [visibility, setVisible, register, unregister],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ── Chart-side hook ────────────────────────────────────────────────────────

interface RegistrationOptions {
  /** Label legible del gráfico, mostrado en el modal. */
  label: string;
  /** Si false, el chart se considera sin datos y queda oculto por default. */
  hasData?: boolean;
  /** Default visible cuando hay datos. Por defecto true. */
  defaultVisible?: boolean;
}

/**
 * Hook que un gráfico llama para registrarse en el sistema de visibility.
 * Devuelve `visible: boolean`. Si el contexto no existe (legacy), siempre true.
 */
export function useChartRegistration(
  id: string,
  options: RegistrationOptions,
): { visible: boolean } {
  const ctx = useContext(Ctx);
  const { label, hasData = true, defaultVisible = true } = options;

  // Registrar/actualizar metadata. Skip si id sentinel "__none__" — usado
  // por DashboardSection cuando el caller no pasó chartId.
  useEffect(() => {
    if (!ctx || id === "__none__") return;
    ctx.register({ id, label, hasData, defaultVisible });
    return () => ctx.unregister(id);
  }, [ctx, id, label, hasData, defaultVisible]);

  if (!ctx) return { visible: true };

  // Prioridad: pref explícita del user > defaultVisible (si tiene datos) > false
  const userPref = ctx.visibility[id];
  if (typeof userPref === "boolean") return { visible: userPref };
  return { visible: hasData && defaultVisible };
}

// ── Modal-side hook ────────────────────────────────────────────────────────

/**
 * Hook para leer la lista de charts registrados — usado por el modal.
 * Lee `registryRef.current` directamente (no usa state, no se sincroniza
 * automáticamente). Si necesitás refresh, abrí/cerrá el modal.
 */
export function useChartsVisibilityManager() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return {
      charts: [] as Array<ChartMeta & { visible: boolean }>,
      setVisible: () => {},
      visibleCount: 0,
      totalCount: 0,
    };
  }
  const charts = Array.from(ctx.registryRef.current.values()).map((m) => {
    const userPref = ctx.visibility[m.id];
    // Misma lógica que el hook: userPref > (hasData && defaultVisible) > false.
    // Sin esto, el modal mostraba "VISIBLE" para charts con defaultVisible=false
    // pero el DashboardSection retornaba null — inconsistencia que forzaba
    // doble click en el toggle.
    const visible =
      typeof userPref === "boolean" ? userPref : m.hasData && m.defaultVisible;
    return { ...m, visible };
  });
  return {
    charts,
    setVisible: ctx.setVisible,
    visibleCount: charts.filter((c) => c.visible).length,
    totalCount: charts.length,
  };
}

// ── Button + Modal UI ──────────────────────────────────────────────────────

export function ChartsVisibilityButton({ label = "Gráficos" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const { charts, setVisible, visibleCount, totalCount } = useChartsVisibilityManager();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-extrabold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] hover:border-[color:var(--accent,var(--rule-base))] transition-colors whitespace-nowrap"
        aria-label="Abrir gestor de gráficos"
      >
        <BarChart3 className="h-4 w-4 text-[var(--text-secondary)]" strokeWidth={2.5} aria-hidden />
        {label}
        {totalCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-6 h-5 px-1.5 rounded-full bg-[var(--surface-sunken)] text-xs font-extrabold tabular-nums text-[var(--text-secondary)]">
            {visibleCount}/{totalCount}
          </span>
        )}
      </button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Gráficos de la sección" size="md">
        <div className="p-5 sm:p-6">
          <header className="mb-5">
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
              Gráficos de la sección
            </h2>
            <p className="mt-1.5 text-sm sm:text-base text-[var(--text-secondary)]">
              Elegí qué gráficos querés ver. Los gráficos sin datos están ocultos por defecto.
            </p>
          </header>

          {charts.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-[var(--rule-base)] p-8 text-center">
              <p className="text-base font-semibold text-[var(--text-secondary)]">
                No hay gráficos registrados en esta sección.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {charts.map((chart) => {
                const Icon = chart.visible ? Eye : EyeOff;
                return (
                  <li key={chart.id}>
                    <button
                      type="button"
                      onClick={() => setVisible(chart.id, !chart.visible)}
                      aria-pressed={chart.visible}
                      className="w-full flex items-center gap-3 p-3.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] hover:bg-[var(--surface-sunken)] transition-colors text-left"
                    >
                      <GripVertical
                        className="h-4 w-4 text-[var(--text-tertiary)] shrink-0"
                        strokeWidth={2}
                        aria-hidden
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm sm:text-base font-extrabold text-[var(--text-primary)] leading-snug">
                          {chart.label}
                        </p>
                        {!chart.hasData && (
                          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mt-0.5">
                            Sin datos en el período actual
                          </p>
                        )}
                      </div>
                      <span
                        className={
                          "inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-extrabold uppercase tracking-wider border-2 shrink-0 " +
                          (chart.visible
                            ? "bg-[color:var(--data-success-500)]/10 text-[color:var(--data-success-500)] border-[color:var(--data-success-500)]/35"
                            : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] border-[var(--rule-base)]")
                        }
                      >
                        <Icon className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                        {chart.visible ? "Visible" : "Oculto"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <footer className="mt-5 flex items-center justify-between gap-3 pt-4 border-t-2 border-[var(--rule-soft)]">
            <p className="text-xs sm:text-sm text-[var(--text-tertiary)] font-semibold">
              {visibleCount} de {totalCount} {totalCount === 1 ? "gráfico" : "gráficos"}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center h-10 px-5 rounded-xl bg-[var(--text-primary)] text-[var(--surface-raised)] text-sm font-extrabold hover:opacity-90 transition-opacity"
            >
              Listo
            </button>
          </footer>
        </div>
      </Modal>
    </>
  );
}
