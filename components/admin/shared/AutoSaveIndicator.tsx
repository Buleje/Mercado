"use client";

/**
 * AutoSaveIndicator — muestra estado del auto-save del formulario.
 *
 * Estados:
 *   · idle: sin cambios (no se muestra)
 *   · dirty: hay cambios sin guardar → "Cambios sin guardar"
 *   · saving: guardando → spinner + "Guardando..."
 *   · saved: guardado exitoso → check verde + "Guardado"
 *   · error: falló → error rojo + mensaje
 *
 * Uso con hook:
 *   const { status, trigger } = useAutoSave(formData, async () => { await save(); });
 *   <AutoSaveIndicator status={status} />
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { Check, Loader2, AlertCircle, Clock } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export type AutoSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

interface Props {
  status: AutoSaveStatus;
  errorMessage?: string;
  /** Ocultar cuando idle. Default true. */
  hideIdle?: boolean;
  className?: string;
}

const STATUS_META: Record<AutoSaveStatus, { icon: typeof Check; label: string; color: string }> = {
  idle: { icon: Check, label: "Guardado", color: "text-[var(--text-tertiary)]" },
  dirty: { icon: Clock, label: "Cambios sin guardar", color: "text-[var(--data-warning-500)]" },
  saving: { icon: Loader2, label: "Guardando...", color: "text-[var(--text-secondary)]" },
  saved: { icon: Check, label: "Guardado", color: "text-[var(--data-success-500)]" },
  error: { icon: AlertCircle, label: "Error al guardar", color: "text-[var(--data-error-500)]" },
};

export function AutoSaveIndicator({ status, errorMessage, hideIdle = true, className }: Props) {
  if (hideIdle && status === "idle") return null;

  const meta = STATUS_META[status];
  const Icon = meta.icon;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        meta.color,
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Icon
        className={cn("h-3 w-3 shrink-0", status === "saving" && "animate-spin")}
        strokeWidth={1.75}
        aria-hidden
      />
      <span>{status === "error" && errorMessage ? errorMessage : meta.label}</span>
    </div>
  );
}

/**
 * useAutoSave — debounced auto-save con status tracking.
 *
 * Uso:
 *   const { status, trigger } = useAutoSave(formData, async () => {
 *     await api.saveForm(formData);
 *   }, 1000);
 *
 *   // Cuando cambia el formulario, llamar trigger()
 *   <input onChange={(e) => { setName(e.target.value); trigger(); }} />
 *   <AutoSaveIndicator status={status} />
 */
export function useAutoSave(
  _data: unknown,
  saveFn: () => Promise<void>,
  delayMs: number = 1000,
): {
  status: AutoSaveStatus;
  trigger: () => void;
  flush: () => Promise<void>;
} {
  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSave = useCallback(async () => {
    setStatus("saving");
    try {
      await saveFn();
      setStatus("saved");
      // Volver a idle después de 2s
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }, [saveFn]);

  const trigger = useCallback(() => {
    setStatus("dirty");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void doSave(), delayMs);
  }, [doSave, delayMs]);

  const flush = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    await doSave();
  }, [doSave]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  return { status, trigger, flush };
}

export default AutoSaveIndicator;
