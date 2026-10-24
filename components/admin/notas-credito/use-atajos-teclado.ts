import { useEffect } from "react";

/** Atajos de teclado de Notas de crédito. */
// ── Keyboard Shortcuts Hook ─────────────────────────────────────────────────

export function useKeyboardShortcuts(handlers: Record<string, () => void>) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const key = e.key.toLowerCase();
      if (handlers[key]) { e.preventDefault(); handlers[key](); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handlers]);
}
