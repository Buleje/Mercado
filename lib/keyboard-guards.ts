/**
 * lib/keyboard-guards.ts
 *
 * Guardas compartidas para atajos de teclado GLOBALES (listeners en
 * window/document). Evitan el anti-patrón de que un shortcut se dispare
 * mientras el usuario escribe o tiene un modal abierto — el bug del reporte QA
 * 2026-07-08 (Escape navegaba fuera de Compras; "n" abría notificaciones al
 * teclear en zona vacía). Todo handler global de una sola tecla debe llamar a
 * `shouldIgnoreShortcut(e)` antes de actuar.
 */

/** El foco está en un campo editable (input/textarea/select/contenteditable). */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable === true
  );
}

/**
 * Hay un modal/diálogo abierto en el DOM. Convención del repo:
 * `.modal-backdrop`, `[role="dialog"]` o `[aria-modal="true"]`.
 */
export function isModalOpen(): boolean {
  if (typeof document === "undefined") return false;
  return !!document.querySelector(
    '.modal-backdrop, [role="dialog"], [aria-modal="true"]',
  );
}

/**
 * True si un atajo global NO debería dispararse: el usuario está escribiendo en
 * un campo, hay un modal abierto, o se está usando un modificador del navegador
 * (Ctrl/Cmd/Alt) — salvo que el handler quiera un combo, en cuyo caso NO usa
 * esta guarda para su rama de combo.
 */
export function shouldIgnoreShortcut(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return true;
  if (isEditableTarget(e.target)) return true;
  if (isModalOpen()) return true;
  return false;
}
