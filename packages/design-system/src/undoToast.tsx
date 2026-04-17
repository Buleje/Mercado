"use client";

import { toast } from "sonner";
import { Check, Undo2 } from "lucide-react";

/**
 * undoToast — helper para toasts de acciones destructivas con undo.
 *
 * Cialdini commitment: el usuario ya completo la accion (confianza + velocidad).
 * Regla UX: 5 segundos de ventana undo. Si no hace nada, accion permanente.
 * Esto elimina dialogs "¿seguro?" intermedios.
 *
 * @example
 *   await deleteProduct(id);
 *   undoToast({
 *     message: "Producto eliminado",
 *     onUndo: () => restoreProduct(id),
 *   });
 */
interface UndoToastOptions {
  message: string;
  description?: string;
  onUndo: () => void | Promise<void>;
  durationSeconds?: number;
}

export function undoToast({
  message,
  description,
  onUndo,
  durationSeconds = 5,
}: UndoToastOptions) {
  toast.custom(
    (t) => (
      <div className="flex items-center gap-3 rounded-xl bg-[var(--text-primary)] text-[var(--surface-canvas)] px-4 py-3 elev-3 min-w-72 max-w-md">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface-canvas)]/10">
          <Check className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{message}</p>
          {description && (
            <p className="text-xs opacity-70 mt-0.5">{description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={async () => {
            toast.dismiss(t);
            await onUndo();
            toast.success("Deshecho");
          }}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-canvas)]/10 hover:bg-[var(--surface-canvas)]/20 px-3 py-1.5 text-xs font-bold transition-colors duration-[var(--dur-fast)]"
        >
          <Undo2 className="h-3 w-3" strokeWidth={2} />
          Deshacer
        </button>
      </div>
    ),
    { duration: durationSeconds * 1000 },
  );
}
