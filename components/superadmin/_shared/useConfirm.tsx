"use client";

import { useCallback, useState } from "react";
import { AlertTriangle } from "@buleje/design-system/icons";

/**
 * useConfirm — reemplaza `window.confirm()` nativo por un modal del DS.
 *
 * Uso (cambio mínimo en el callsite — solo agregar `await`):
 * ```tsx
 * const { confirm, confirmModal } = useConfirm();
 * // handler:
 * if (!(await confirm({ title: "Eliminar", message: "…", danger: true }))) return;
 * // render (una vez, al final del JSX):
 * {confirmModal}
 * ```
 *
 * El modal es accesible (Esc cancela, click fuera cancela), tap targets ≥44px
 * y tonos rose para acciones destructivas / emerald para confirmaciones.
 */

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** true → botón rojo (acción destructiva irreversible). */
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (result: boolean) => void;
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setState({ ...opts, resolve });
      }),
    [],
  );

  const close = useCallback(
    (result: boolean) => {
      setState((prev) => {
        prev?.resolve(result);
        return null;
      });
    },
    [],
  );

  const confirmModal = state ? (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={() => close(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") close(false);
      }}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] shadow-[var(--shadow-xl)] p-6"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label={state.title}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              state.danger
                ? "bg-rose-100 dark:bg-rose-950/40"
                : "bg-emerald-100 dark:bg-emerald-950/40"
            }`}
          >
            <AlertTriangle
              className={`h-5 w-5 ${
                state.danger
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              {state.title}
            </h2>
            <p className="mt-1 text-base text-[var(--text-secondary)]">
              {state.message}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => close(false)}
            className="h-11 px-4 rounded-xl text-sm font-bold bg-gray-200 dark:bg-gray-800 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            {state.cancelLabel ?? "Cancelar"}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => close(true)}
            className={`h-11 px-4 rounded-xl text-sm font-bold text-white ${
              state.danger
                ? "bg-rose-600 hover:bg-rose-700"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {state.confirmLabel ?? "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, confirmModal };
}
