"use client";

/**
 * Toasts flotantes de acción para el cubicador — feedback consistente al
 * agregar, eliminar, guardar, importar, etc. Autocontenido: un hook maneja la
 * pila y `<ActionToasts>` la pinta. Sin provider global ni dependencias de
 * layout, para poder montarlo dentro del propio componente.
 *
 * API:
 *   const { toasts, push, dismiss } = useActionToasts();
 *   push({ tono: "success", msg: "Cubicación guardada" });
 *   push({ tono: "warning", msg: "Fila eliminada", undo: () => restaurar() });
 *   …
 *   <ActionToasts toasts={toasts} onDismiss={dismiss} />
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, X, AlertTriangle, Info, RotateCcw } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export type ToastTono = "success" | "info" | "warning" | "error";

export interface ActionToast {
  id: number;
  tono: ToastTono;
  msg: string;
  detail?: string;
  /** Si viene, se muestra "Deshacer" y el toast dura un poco más. */
  undo?: () => void;
  exiting?: boolean;
}

let seq = 1;
const DUR = 3200;       // ms visible por defecto
const DUR_UNDO = 6000;  // ms si hay acción de deshacer (más tiempo para reaccionar)
const SALIDA = 260;     // ms de la animación de salida

export function useActionToasts() {
  const [toasts, setToasts] = useState<ActionToast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const quitar = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), SALIDA);
  }, []);

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
    quitar(id);
  }, [quitar]);

  const push = useCallback((t: Omit<ActionToast, "id" | "exiting">) => {
    const id = seq++;
    setToasts((prev) => [...prev.slice(-2), { ...t, id }]); // máx 3 en pantalla
    const timer = setTimeout(() => { quitar(id); timers.current.delete(id); }, t.undo ? DUR_UNDO : DUR);
    timers.current.set(id, timer);
    return id;
  }, [quitar]);

  // Limpieza de timers al desmontar.
  useEffect(() => {
    const map = timers.current;
    return () => { map.forEach((t) => clearTimeout(t)); map.clear(); };
  }, []);

  return { toasts, push, dismiss };
}

// ─── Estilo por tono (tokens del DS; variantes dark explícitas para no romper
//     contraste — los tints --data-*-50/100 aclaran de más en dark) ───────────
const TONO: Record<ToastTono, { icon: ReactNode; border: string; chip: string }> = {
  success: {
    icon: <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />,
    border: "border-[var(--data-success-500)]/45",
    chip: "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4" strokeWidth={2.5} aria-hidden />,
    border: "border-[var(--data-warning-500)]/45",
    chip: "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  },
  error: {
    icon: <AlertTriangle className="h-4 w-4" strokeWidth={2.5} aria-hidden />,
    border: "border-[var(--data-error-500)]/45",
    chip: "bg-[var(--data-error-500)]/15 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  },
  info: {
    icon: <Info className="h-4 w-4" strokeWidth={2.5} aria-hidden />,
    border: "border-[var(--accent)]/45",
    chip: "bg-[var(--accent-soft)] text-[var(--accent)]",
  },
};

function ToastItem({ t, onDismiss }: { t: ActionToast; onDismiss: (id: number) => void }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, []);
  const visible = shown && !t.exiting;
  const est = TONO[t.tono];
  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border-2 bg-[var(--surface-raised)] px-3.5 py-3 shadow-[var(--shadow-lg)] transition-all duration-[var(--dur-base)] ease-out",
        est.border,
        visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
      )}
    >
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", est.chip)}>{est.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black text-[var(--text-primary)]">{t.msg}</span>
        {t.detail && <span className="block truncate text-xs font-semibold text-[var(--text-secondary)]">{t.detail}</span>}
      </span>
      {t.undo && (
        <button
          type="button"
          onClick={() => { t.undo?.(); onDismiss(t.id); }}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border-2 border-[var(--rule-base)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Deshacer
        </button>
      )}
      <button type="button" onClick={() => onDismiss(t.id)} aria-label="Cerrar aviso" className="shrink-0 rounded-lg p-1 text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)]">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/** Pila flotante — abajo-derecha en desktop, abajo-centro en mobile; sobre modales. */
export function ActionToasts({ toasts, onDismiss }: { toasts: ActionToast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:inset-x-auto sm:bottom-4 sm:right-4 sm:items-end sm:px-0 sm:pb-0"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => <ToastItem key={t.id} t={t} onDismiss={onDismiss} />)}
    </div>
  );
}
