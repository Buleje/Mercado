"use client";

/**
 * UndoToast — toast con acción de deshacer post-acción destructiva.
 *
 * Cuando el dueño elimina/archiva algo, aparece toast abajo con countdown
 * de 5s y botón "Deshacer". Si click, revierte. Si ignora, confirma.
 *
 * Uso (vía hook):
 *   const { showUndo } = useUndoToast();
 *   showUndo({
 *     message: "Producto eliminado",
 *     onUndo: () => restoreProduct(id),
 *     duration: 5000,
 *   });
 *
 * Integrar <UndoToastContainer /> en el layout del admin una vez.
 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Undo2, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface UndoToastData {
  id: number;
  message: string;
  detail?: string;
  onUndo?: () => void;
  duration: number;
  startedAt: number;
}

interface ShowUndoParams {
  message: string;
  detail?: string;
  /** Si se omite, el toast actúa como notificación de éxito sin botón undo. */
  onUndo?: () => void;
  /** ms. Default 5000. */
  duration?: number;
}

interface UndoContextValue {
  showUndo: (params: ShowUndoParams) => void;
}

const UndoContext = createContext<UndoContextValue | null>(null);
let nextId = 1;

export function UndoToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<UndoToastData[]>([]);

  const showUndo = useCallback((params: ShowUndoParams) => {
    const id = nextId++;
    const duration = params.duration ?? 5000;
    setToasts((prev) => [
      ...prev,
      {
        id,
        message: params.message,
        detail: params.detail,
        onUndo: params.onUndo,
        duration,
        startedAt: Date.now(),
      },
    ]);
    // Auto-dismiss
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const undo = useCallback(
    (id: number) => {
      const toast = toasts.find((t) => t.id === id);
      if (toast) {
        toast.onUndo?.();
        dismiss(id);
      }
    },
    [toasts, dismiss],
  );

  return (
    <UndoContext.Provider value={{ showUndo }}>
      {children}
      <UndoToastContainer toasts={toasts} onUndo={undo} onDismiss={dismiss} />
    </UndoContext.Provider>
  );
}

export function useUndoToast(): UndoContextValue {
  const ctx = useContext(UndoContext);
  if (!ctx) {
    throw new Error("useUndoToast must be used within UndoToastProvider");
  }
  return ctx;
}

// ── Container ──────────────────────────────────────────────────────────

function UndoToastContainer({
  toasts,
  onUndo,
  onDismiss,
}: {
  toasts: UndoToastData[];
  onUndo: (id: number) => void;
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <UndoToastItem key={t.id} toast={t} onUndo={() => onUndo(t.id)} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function UndoToastItem({
  toast,
  onUndo,
  onDismiss,
}: {
  toast: UndoToastData;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - toast.startedAt;
      const pct = Math.max(0, 100 - (elapsed / toast.duration) * 100);
      setProgress(pct);
    }, 50);
    return () => clearInterval(interval);
  }, [toast.startedAt, toast.duration]);

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--text-primary)] text-[var(--surface-canvas)] shadow-[var(--shadow-xl)]",
        "flex items-center gap-3 pr-2 pl-4 py-2.5 min-w-[320px] max-w-[480px]",
        "animate-undo-toast-in",
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{toast.message}</p>
        {toast.detail && <p className="text-xs text-[var(--surface-canvas)]/70 truncate mt-0.5">{toast.detail}</p>}
      </div>
      {toast.onUndo && (
        <button
          type="button"
          onClick={onUndo}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[var(--surface-canvas)]/10 hover:bg-[var(--surface-canvas)]/20 transition-colors"
        >
          <Undo2 className="h-3.5 w-3.5" strokeWidth={2} />
          Deshacer
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar"
        className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--surface-canvas)]/60 hover:bg-[var(--surface-canvas)]/10 transition-colors"
      >
        <X className="h-3.5 w-3.5" strokeWidth={1.75} />
      </button>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--surface-canvas)]/10 pointer-events-none">
        <div
          className="h-full bg-[var(--accent)] transition-all duration-50 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>

      <style jsx global>{`
        @keyframes undo-toast-in {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-undo-toast-in {
          position: relative;
          animation: undo-toast-in 200ms ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-undo-toast-in {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
