"use client";

/**
 * UndoToast — Toast con acción "Deshacer" + countdown progress bar.
 *
 * Uso: dispatchedly al remover del carrito, eliminar favorito, etc.
 * El usuario tiene X segundos para deshacer antes de que la acción
 * se confirme silenciosamente.
 *
 * API:
 *   const { showUndo } = useUndoToast();
 *   showUndo({
 *     message: "Item eliminado",
 *     onUndo: () => restoreItem(),
 *     duration: 5000, // ms
 *   });
 *
 * Hook contextual + provider montable en layout raíz.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { Undo2, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface UndoToastData {
  id: string;
  message: string;
  onUndo: () => void;
  duration: number;
  startedAt: number;
}

interface UndoToastCtx {
  showUndo: (opts: { message: string; onUndo: () => void; duration?: number }) => void;
}

const Ctx = createContext<UndoToastCtx | null>(null);

export function useUndoToast(): UndoToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Silent fallback — no-op si provider no existe
    return {
      showUndo: () => {
        /* noop */
      },
    };
  }
  return ctx;
}

export function UndoToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<UndoToastData | null>(null);
  const [hovering, setHovering] = useState(false);

  const showUndo = useCallback(
    ({
      message,
      onUndo,
      duration = 5000,
    }: {
      message: string;
      onUndo: () => void;
      duration?: number;
    }) => {
      setToast({
        id: `undo-${Date.now()}`,
        message,
        onUndo,
        duration,
        startedAt: Date.now(),
      });
    },
    [],
  );

  // Auto-dismiss
  useEffect(() => {
    if (!toast) return;
    if (hovering) return; // pausa si hover
    const id = setTimeout(() => setToast(null), toast.duration);
    return () => clearTimeout(id);
  }, [toast, hovering]);

  const handleUndo = useCallback(() => {
    if (!toast) return;
    toast.onUndo();
    setToast(null);
  }, [toast]);

  const handleDismiss = useCallback(() => {
    setToast(null);
  }, []);

  return (
    <Ctx.Provider value={{ showUndo }}>
      {children}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-md"
        >
          <div className="rounded-2xl bg-[var(--text-primary)] text-[var(--surface-canvas)] shadow-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3">
              <p className="flex-1 text-sm font-medium">{toast.message}</p>
              <button
                type="button"
                onClick={handleUndo}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-canvas)] text-[var(--text-primary)] px-3 py-1 text-xs font-bold hover:bg-[var(--accent)] hover:text-white transition-colors"
              >
                <Undo2 className="h-3 w-3" strokeWidth={2} aria-hidden />
                Deshacer
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                aria-label="Cerrar"
                className="p-1 rounded-lg opacity-60 hover:opacity-100 transition-opacity"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </button>
            </div>
            {/* Progress bar countdown */}
            <div
              aria-hidden
              className={cn(
                "h-0.5 bg-[var(--accent)] origin-left",
                hovering ? "" : "animate-[undoShrink_linear_forwards]",
              )}
              style={{ animationDuration: `${toast.duration}ms` }}
            />
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
