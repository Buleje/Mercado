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
import { BarChart3, Eye, EyeOff, Check, Database } from "@buleje/design-system/icons";
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
  // Brandon mayo 2026 v6: bug del badge "3/8" — el contador no se
  // actualizaba cuando los charts montaban async (cohort, heatmap, churn
  // se registran después del primer paint del Button). Solución: un
  // version counter que incrementa en register/unregister, fuerza re-render
  // del consumidor (Button + Modal) y refleja el conteo real.
  const [, setRegistryVersion] = useState(0);

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

  // Brandon mayo 2026 v6: register/unregister incrementan `registryVersion`
  // para forzar re-render del Button (que usa useChartsVisibilityManager).
  // Antes, registry vivía solo en ref y el badge nunca se sincronizaba con
  // los charts que se montaban tarde — daba "3/8" siendo el real 8/8.
  // Cambios silenciosos (mismo meta) no incrementan version para evitar
  // loops.
  const register = useCallback((meta: ChartMeta) => {
    const cur = registryRef.current.get(meta.id);
    registryRef.current.set(meta.id, meta);
    const changed =
      !cur ||
      cur.label !== meta.label ||
      cur.hasData !== meta.hasData ||
      cur.defaultVisible !== meta.defaultVisible;
    if (changed) setRegistryVersion((v) => v + 1);
  }, []);

  const unregister = useCallback((id: string) => {
    if (registryRef.current.delete(id)) setRegistryVersion((v) => v + 1);
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

      <ChartsVisibilityModal
        open={open}
        onClose={() => setOpen(false)}
        charts={charts}
        setVisible={setVisible}
        visibleCount={visibleCount}
        totalCount={totalCount}
      />
    </>
  );
}

// ── Modal de gestion (rediseñado mayo 2026) ─────────────────────────────────

interface ModalProps {
  open: boolean;
  onClose: () => void;
  charts: Array<ChartMeta & { visible: boolean }>;
  setVisible: (id: string, v: boolean) => void;
  visibleCount: number;
  totalCount: number;
}

function ChartsVisibilityModal({ open, onClose, charts, setVisible, visibleCount, totalCount }: ModalProps) {
  // Separamos en 3 grupos para jerarquía visual clara:
  //  - Activos (visibles)
  //  - Disponibles (con datos pero ocultos por el user o defaultVisible=false)
  //  - Sin datos (hasData=false → no se pueden activar útilmente)
  const activos = charts.filter((c) => c.visible);
  const disponibles = charts.filter((c) => !c.visible && c.hasData);
  const sinDatos = charts.filter((c) => !c.visible && !c.hasData);

  function setAll(target: boolean) {
    charts.forEach((c) => {
      if (target && !c.hasData) return; // no activar charts sin datos
      if (c.visible !== target) setVisible(c.id, target);
    });
  }

  return (
    <Modal isOpen={open} onClose={onClose} title="Gestión de gráficos" size="md">
      <div className="flex flex-col max-h-[calc(100vh-8rem)]">
        {/* ── HEADER ───────────────────────────────────────────────────── */}
        <header className="px-5 sm:px-6 pt-5 sm:pt-6 pb-4 border-b-2 border-[var(--rule-soft)]">
          <div className="flex items-start gap-4">
            <div className="hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]">
              <BarChart3 className="h-6 w-6 text-[color:var(--accent,var(--text-primary))]" strokeWidth={2.5} aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
                Gestión de gráficos
              </h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)] leading-relaxed">
                Activá solo los gráficos que te sirven. Los que no tienen datos quedan automáticamente fuera.
              </p>
            </div>
          </div>

          {/* Contador + bulk actions */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 h-9 px-3.5 rounded-full bg-[var(--surface-sunken)] border-2 border-[var(--rule-base)]">
              <span className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">
                {visibleCount}/{totalCount}
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                activos
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAll(true)}
                disabled={activos.length === totalCount - sinDatos.length}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-extrabold uppercase tracking-wider border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Eye className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                Mostrar todos
              </button>
              <button
                type="button"
                onClick={() => setAll(false)}
                disabled={activos.length === 0}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-extrabold uppercase tracking-wider border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <EyeOff className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                Ocultar todos
              </button>
            </div>
          </div>
        </header>

        {/* ── BODY ─────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-6">
          {charts.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-10 text-center">
              <BarChart3 className="h-10 w-10 mx-auto text-[var(--text-tertiary)] mb-3" strokeWidth={2} aria-hidden />
              <p className="text-base font-bold text-[var(--text-secondary)]">
                No hay gráficos registrados en esta sección.
              </p>
            </div>
          )}

          {activos.length > 0 && (
            <ChartGroup
              title="Activos"
              count={activos.length}
              tone="success"
              charts={activos}
              setVisible={setVisible}
            />
          )}

          {disponibles.length > 0 && (
            <ChartGroup
              title="Disponibles"
              hint="Tenés datos para mostrarlos."
              count={disponibles.length}
              tone="neutral"
              charts={disponibles}
              setVisible={setVisible}
            />
          )}

          {sinDatos.length > 0 && (
            <ChartGroup
              title="Sin datos"
              hint="No hay info suficiente en el período actual."
              count={sinDatos.length}
              tone="muted"
              charts={sinDatos}
              setVisible={setVisible}
            />
          )}
        </div>

        {/* ── FOOTER ───────────────────────────────────────────────────── */}
        <footer className="px-5 sm:px-6 py-4 border-t-2 border-[var(--rule-soft)] bg-[var(--surface-sunken)] flex items-center justify-between gap-3">
          <p className="text-xs sm:text-sm text-[var(--text-tertiary)] font-bold">
            Tus preferencias se guardan automáticamente.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 h-11 px-5 rounded-xl bg-[var(--text-primary)] text-[var(--surface-raised)] text-sm font-extrabold hover:opacity-90 transition-opacity"
          >
            <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
            Listo
          </button>
        </footer>
      </div>
    </Modal>
  );
}

// ── Grupo de charts ────────────────────────────────────────────────────────

interface GroupProps {
  title: string;
  hint?: string;
  count: number;
  tone: "success" | "neutral" | "muted";
  charts: Array<ChartMeta & { visible: boolean }>;
  setVisible: (id: string, v: boolean) => void;
}

function ChartGroup({ title, hint, count, tone, charts, setVisible }: GroupProps) {
  const dotColor =
    tone === "success"
      ? "bg-[color:var(--data-success-500)]"
      : tone === "neutral"
        ? "bg-[var(--text-secondary)]"
        : "bg-[var(--text-tertiary)]";

  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2.5">
        <span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} aria-hidden />
        <h3 className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]">
          {title}
        </h3>
        <span className="text-xs font-bold tabular-nums text-[var(--text-tertiary)]">
          {count}
        </span>
        {hint && (
          <span className="ml-auto text-xs font-medium text-[var(--text-tertiary)] hidden sm:inline">
            {hint}
          </span>
        )}
      </div>
      <ul className="space-y-1.5">
        {charts.map((chart) => (
          <ChartRow key={chart.id} chart={chart} setVisible={setVisible} />
        ))}
      </ul>
    </section>
  );
}

// ── Fila individual con switch toggle ──────────────────────────────────────

interface RowProps {
  chart: ChartMeta & { visible: boolean };
  setVisible: (id: string, v: boolean) => void;
}

function ChartRow({ chart, setVisible }: RowProps) {
  const disabled = !chart.hasData;
  return (
    <li>
      <button
        type="button"
        onClick={() => {
          if (disabled && !chart.visible) return;
          setVisible(chart.id, !chart.visible);
        }}
        aria-pressed={chart.visible}
        disabled={disabled && !chart.visible}
        className={
          "group w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left " +
          (chart.visible
            ? "border-[color:var(--data-success-500)]/40 bg-[color:var(--data-success-500)]/5 hover:border-[color:var(--data-success-500)]/60"
            : disabled
              ? "border-[var(--rule-soft)] bg-[var(--surface-sunken)]/50 cursor-not-allowed"
              : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:bg-[var(--surface-sunken)] hover:border-[var(--text-tertiary)]")
        }
      >
        {/* Icono indicador */}
        <div
          className={
            "shrink-0 h-9 w-9 rounded-lg flex items-center justify-center border-2 " +
            (chart.visible
              ? "bg-[color:var(--data-success-500)]/15 border-[color:var(--data-success-500)]/40 text-[color:var(--data-success-500)]"
              : disabled
                ? "bg-transparent border-[var(--rule-soft)] text-[var(--text-tertiary)]"
                : "bg-[var(--surface-sunken)] border-[var(--rule-base)] text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]")
          }
          aria-hidden
        >
          {disabled ? (
            <Database className="h-4 w-4" strokeWidth={2.25} />
          ) : chart.visible ? (
            <Eye className="h-4 w-4" strokeWidth={2.5} />
          ) : (
            <EyeOff className="h-4 w-4" strokeWidth={2.25} />
          )}
        </div>

        {/* Label + estado */}
        <div className="flex-1 min-w-0">
          <p
            className={
              "text-sm sm:text-base font-extrabold leading-snug truncate " +
              (disabled ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]")
            }
            title={chart.label}
          >
            {chart.label}
          </p>
          {disabled && (
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mt-0.5">
              Sin datos en el período
            </p>
          )}
        </div>

        {/* Switch toggle */}
        <span
          className={
            "relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 transition-colors " +
            (chart.visible
              ? "bg-[color:var(--data-success-500)] border-[color:var(--data-success-500)]"
              : disabled
                ? "bg-[var(--surface-sunken)] border-[var(--rule-soft)]"
                : "bg-[var(--surface-sunken)] border-[var(--rule-base)]")
          }
          aria-hidden
        >
          <span
            className={
              "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all " +
              (chart.visible ? "left-[1.375rem]" : "left-0.5")
            }
          />
        </span>
      </button>
    </li>
  );
}
