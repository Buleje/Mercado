"use client";

import {
  createContext,
  useContext,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, X, ShoppingBag } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type Toast = {
  id: number;
  name: string;
  image: string;
  exiting?: boolean;
};

type ToastCtx = {
  showToast: (name: string, image: string) => void;
  dismissToast: (id: number) => void;
};

const ToastContext = createContext<ToastCtx | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timerMap = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: number) => {
    const t = timerMap.current.get(id);
    if (t) { clearTimeout(t); timerMap.current.delete(id); }
    setToasts((prev) => prev.map((t) => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 300);
  }, []);

  const showToast = useCallback((name: string, image: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev.slice(-3), { id, name, image }]);

    const t = setTimeout(() => {
      setToasts((prev) => prev.map((t) => t.id === id ? { ...t, exiting: true } : t));
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 300);
      timerMap.current.delete(id);
    }, 2800);

    timerMap.current.set(id, t);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}

      {/* Brandon 2026-07-05 (audit comprador): el ToastProvider ANTES no
          renderizaba nada (_toasts muerto) → showToast() era un no-op y el
          cliente no veía ninguna confirmación al agregar al carrito. Ahora
          pinta un toast "Agregado al carrito" con la foto del producto.
          Fixed abajo-derecha (desktop) / abajo-centro (mobile), sobre el
          bottom-nav; auto-dismiss 2.8s (ya codeado); click para cerrar. */}
      {toasts.length > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] pointer-events-none sm:inset-x-auto sm:right-4 sm:bottom-4 sm:items-end sm:px-0 sm:pb-0"
          aria-live="polite"
          aria-atomic="false"
        >
          {toasts.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label={`${t.name} agregado al carrito. Tocá para cerrar`}
              className={cn(
                "pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 py-3 text-left shadow-[var(--shadow-lg)] transition-all duration-300",
                t.exiting ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100",
              )}
            >
              <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-[var(--surface-sunken)]">
                {t.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- thumb chico no crítico
                  <img src={t.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ShoppingBag
                    className="absolute inset-0 m-auto h-5 w-5 text-[var(--text-tertiary)]"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                )}
                <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--accent)] text-white ring-2 ring-[var(--surface-raised)]">
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-[var(--text-primary)]">
                  Agregado al carrito
                </span>
                <span className="block truncate text-xs font-semibold text-[var(--text-secondary)]">
                  {t.name}
                </span>
              </span>
              <X className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
            </button>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  // No-op si se usa fuera del provider (degradación segura, sin crash).
  if (!ctx) return { showToast: () => {}, dismissToast: () => {} };
  return ctx;
}
