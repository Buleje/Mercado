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
 * El diálogo está a la vista. Un `[aria-modal="true"]` puede quedar montado y
 * cerrado: el cajón del menú móvil (`AdminMobileDrawer`) vive siempre en el DOM
 * — `display:none` en escritorio, corrido fuera de pantalla en el celular —;
 * contarlo dejaría muerto todo atajo del panel. Sin layout (jsdom) cuenta como
 * abierto.
 */
function estaALaVista(el: Element): boolean {
  if (typeof el.checkVisibility === "function" && !el.checkVisibility()) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return true;
  return r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight;
}

/**
 * Hay un modal ENCIMA del dueño de un atajo global: el último
 * `[aria-modal="true"]` a la vista (los portales se agregan al final del body,
 * así que el último es el de más arriba) no contiene a `dueno`.
 *
 * Por qué no basta `isModalOpen()`: un módulo puede vivir DENTRO de un modal
 * (los accesos rápidos de la cabecera abren módulos enteros en una ventana) y
 * sus atajos tienen que seguir andando ahí, pero el mismo módulo abierto en la
 * página de atrás no. Medido 10-10: con Cámaras abierto sobre el POS, una «a»
 * saltaba al buscador del POS de atrás (un lector de código cargaba el carrito
 * que no se ve). Sin dueño montado y con un modal abierto, se toma como encima.
 */
export function hayModalEncima(dueno: Element | null | undefined): boolean {
  if (typeof document === "undefined") return false;
  const modales = Array.from(document.querySelectorAll('[aria-modal="true"]')).filter(estaALaVista);
  const arriba = modales[modales.length - 1];
  if (!arriba) return false;
  return !dueno || !arriba.contains(dueno);
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
