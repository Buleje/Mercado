"use client";

import { useEffect } from "react";

// Global counter so multiple overlays stacking don't fight each other
let lockCount = 0;

/**
 * useScrollLock — bloquea scroll del body cuando active=true.
 *
 * Soporta stacking de multiples overlays (modal dentro de modal).
 * Solo remueve el overflow: hidden cuando el ultimo overlay se cierra.
 *
 * @example
 * const [open, setOpen] = useState(false);
 * useScrollLock(open);
 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    lockCount++;
    if (lockCount === 1) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        document.body.style.overflow = "";
      }
    };
  }, [active]);
}
