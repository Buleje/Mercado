"use client";

/**
 * ShortcutHelpModal — Modal que muestra todos los atajos de teclado.
 *
 * Se abre con `?` (o el trigger que configurés). Lee del registry global
 * de useKeyboardShortcut, agrupando por seccion (opcional).
 *
 * Tambien permite listar shortcuts manualmente via prop `shortcuts`.
 *
 * Uso:
 *   // Opcion 1: registry automatico (todas las shortcuts con description)
 *   <ShortcutHelpModal />
 *
 *   // Opcion 2: lista manual (para control total de agrupado)
 *   <ShortcutHelpModal
 *     shortcuts={[
 *       { section: "Navegacion", items: [...] },
 *       { section: "Carrito", items: [...] },
 *     ]}
 *   />
 */

import { useMemo, useState } from "react";
import { X, Keyboard } from "@buleje/design-system/icons";
import {
  useKeyboardShortcut,
  getRegisteredShortcuts,
} from "@/hooks/use-keyboard-shortcuts";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { cn } from "@/lib/utils";

interface ShortcutItem {
  keys: string; // ej. "Ctrl+K" o "?"
  description: string;
}

interface ShortcutGroup {
  section: string;
  items: ShortcutItem[];
}

interface Props {
  /** Lista manual opcional. Si ausente, usa registry automatico. */
  shortcuts?: ShortcutGroup[];
  /** Mostrar el boton flotante abajo-derecha. Default true */
  showFab?: boolean;
  /** Tecla para abrir. Default "?" (shift+/) */
  triggerKey?: string;
}

export default function ShortcutHelpModal({ shortcuts, showFab = true, triggerKey = "?" }: Props) {
  const [open, setOpen] = useState(false);
  const focusTrapRef = useFocusTrap<HTMLDivElement>({ enabled: open, onEscape: () => setOpen(false) });

  useKeyboardShortcut({
    key: triggerKey.toLowerCase() === "?" ? "?" : triggerKey,
    modifiers: triggerKey === "?" ? ["shift"] : [],
    callback: () => setOpen((v) => !v),
    description: "Mostrar atajos de teclado",
  });

  // Registry derivado — recalcula al renderizar con modal abierto.
  // El registry devuelve { key, description }; lo mapeamos a ShortcutItem.
  const autoShortcuts = useMemo<ShortcutItem[]>(() => {
    if (!open) return [];
    return getRegisteredShortcuts().map((s) => ({
      keys: s.key,
      description: s.description,
    }));
  }, [open]);

  if (!open && !showFab) return null;

  return (
    <>
      {showFab && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ver atajos de teclado"
          title="Atajos (?)"
          className="fixed bottom-4 right-4 z-40 h-10 w-10 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] shadow-lg hover:bg-[var(--accent)] transition-colors inline-flex items-center justify-center"
        >
          <Keyboard className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcut-help-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 motion-safe:animate-[fadeIn_0.2s]"
        >
          <button
            type="button"
            aria-label="Cerrar modal"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-[var(--text-primary)]/60 backdrop-blur-sm"
          />
          <div
            ref={focusTrapRef}
            className={cn(
              "relative w-full max-w-md rounded-3xl bg-[var(--surface-raised)] shadow-2xl overflow-hidden",
              "motion-safe:animate-[scaleIn_0.25s_ease-out]",
            )}
          >
            <div className="px-6 pt-6 pb-4 border-b border-[var(--rule-base)] flex items-center justify-between">
              <div>
                <h2 id="shortcut-help-title" className="text-lg font-extrabold text-[var(--text-primary)] tracking-tight">
                  Atajos de teclado
                </h2>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Navegá más rápido sin mouse</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="p-2 -m-2 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-6 py-4 space-y-5">
              {shortcuts?.length ? (
                shortcuts.map((group) => (
                  <section key={group.section}>
                    <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                      {group.section}
                    </p>
                    <ul className="space-y-1.5">
                      {group.items.map((item) => (
                        <ShortcutRow key={item.keys + item.description} item={item} />
                      ))}
                    </ul>
                  </section>
                ))
              ) : autoShortcuts.length > 0 ? (
                <ul className="space-y-1.5">
                  {autoShortcuts.map((item) => (
                    <ShortcutRow key={item.keys + item.description} item={item} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[var(--text-tertiary)] text-center py-8">
                  No hay atajos registrados en esta pantalla.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ShortcutRow({ item }: { item: ShortcutItem }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-[var(--text-secondary)] flex-1">{item.description}</span>
      <kbd className="inline-flex items-center gap-0.5 shrink-0">
        {item.keys.split(/(?<!^)(?=[A-Z])|\+/).map((part, i) => (
          <span
            key={i}
            className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded bg-[var(--surface-sunken)] border border-[var(--rule-base)] text-[length:var(--ts-2xs)] font-bold text-[var(--text-primary)] tabular-nums"
          >
            {part.trim()}
          </span>
        ))}
      </kbd>
    </li>
  );
}
