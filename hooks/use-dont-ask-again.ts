"use client";

/**
 * useDontAskAgain — patron reusable para acciones admin que muestran un
 * dialog de confirmacion. Permite al user marcar "no preguntar de nuevo"
 * y persistir la preferencia en localStorage por accion.
 *
 * Uso tipico:
 * ```ts
 * const { dontAsk, setDontAsk, shouldSkip, persist } = useDontAskAgain("bulk-delete-products");
 *
 * function handleClick() {
 *   if (shouldSkip()) {
 *     executeAction();
 *   } else {
 *     setConfirmModalOpen(true);
 *   }
 * }
 *
 * function handleConfirm() {
 *   if (dontAsk) persist();
 *   executeAction();
 * }
 *
 * // En el modal:
 * <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} />
 * ```
 */

import { useCallback, useState } from "react";

const KEY_PREFIX = "admin-skip-confirm:";

export function useDontAskAgain(actionKey: string) {
  const [dontAsk, setDontAsk] = useState(false);

  /** Lee localStorage y devuelve true si el user dijo "no preguntar". */
  const shouldSkip = useCallback((): boolean => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(KEY_PREFIX + actionKey) === "1";
    } catch {
      return false;
    }
  }, [actionKey]);

  /** Persiste la preferencia (solo si dontAsk esta marcado). */
  const persist = useCallback(() => {
    if (typeof window === "undefined" || !dontAsk) return;
    try {
      localStorage.setItem(KEY_PREFIX + actionKey, "1");
    } catch {
      /* silent */
    }
  }, [actionKey, dontAsk]);

  /** Limpia la preferencia (re-activa el dialog). */
  const reset = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(KEY_PREFIX + actionKey);
    } catch {
      /* silent */
    }
    setDontAsk(false);
  }, [actionKey]);

  return { dontAsk, setDontAsk, shouldSkip, persist, reset };
}
