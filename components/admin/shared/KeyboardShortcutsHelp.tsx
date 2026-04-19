"use client";

/**
 * KeyboardShortcutsHelp — modal con todos los atajos de teclado del admin.
 *
 * Se abre con `Ctrl+?` (o `Cmd+?`). Lista agrupada por categoría:
 *   · Navegación (Ctrl+K, G+número, etc.)
 *   · Acciones (Ctrl+N, Ctrl+S, Ctrl+D)
 *   · Listas (J/K, X selecciona, etc.)
 *
 * Uso:
 *   const { show, toggle } = useKeyboardShortcuts();
 *   <KeyboardShortcutsHelp open={show} onClose={toggle} />
 *
 * Integrar con listener global:
 *   useEffect(() => {
 *     const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "?") toggle(); };
 *     document.addEventListener("keydown", h);
 *     return () => document.removeEventListener("keydown", h);
 *   }, [toggle]);
 */

import * as Dialog from "@radix-ui/react-dialog";
import { X, Keyboard } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Shortcut {
  keys: string[];
  description: string;
}

interface Section {
  title: string;
  items: Shortcut[];
}

const DEFAULT_SECTIONS: Section[] = [
  {
    title: "Navegación",
    items: [
      { keys: ["Ctrl", "K"], description: "Abrir búsqueda global (Command Palette)" },
      { keys: ["Ctrl", "?"], description: "Abrir / cerrar esta ayuda" },
      { keys: ["G", "I"], description: "Ir a Inicio" },
      { keys: ["G", "V"], description: "Ir a Ventas" },
      { keys: ["G", "P"], description: "Ir a Productos e inventario" },
      { keys: ["G", "C"], description: "Ir a Clientes" },
      { keys: ["G", "F"], description: "Ir a Gráficos" },
    ],
  },
  {
    title: "Acciones",
    items: [
      { keys: ["Ctrl", "N"], description: "Nuevo (producto/cliente/pedido según módulo)" },
      { keys: ["Ctrl", "S"], description: "Guardar cambios" },
      { keys: ["Ctrl", "Shift", "C"], description: "Cerrar día / arqueo de caja" },
      { keys: ["Ctrl", "Shift", "P"], description: "Modo presentación (pantalla limpia)" },
      { keys: ["F"], description: "Modo enfoque (ocultar sidebar)" },
      { keys: ["Esc"], description: "Cerrar modal / deseleccionar" },
    ],
  },
  {
    title: "Listas y tablas",
    items: [
      { keys: ["J"], description: "Siguiente fila" },
      { keys: ["K"], description: "Fila anterior" },
      { keys: ["X"], description: "Seleccionar fila actual (checkbox)" },
      { keys: ["Shift", "X"], description: "Seleccionar todo en pantalla" },
      { keys: ["Enter"], description: "Abrir detalle de la fila activa" },
      { keys: ["Delete"], description: "Eliminar fila(s) seleccionada(s)" },
    ],
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
  /** Secciones custom. Si no se pasa, usa DEFAULT_SECTIONS. */
  sections?: Section[];
}

export function KeyboardShortcutsHelp({ open, onClose, sections = DEFAULT_SECTIONS }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50",
            "max-w-2xl w-[calc(100vw-2rem)] max-h-[85vh]",
            "bg-[var(--surface-canvas)] rounded-xl shadow-2xl border border-[var(--rule-base)] flex flex-col outline-none",
          )}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-base)] shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-[var(--surface-sunken)] flex items-center justify-center text-[var(--text-secondary)]">
                <Keyboard className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div>
                <Dialog.Title className="font-display text-lg font-normal text-[var(--text-primary)] tracking-tight">
                  Atajos de teclado
                </Dialog.Title>
                <Dialog.Description className="text-xs text-[var(--text-tertiary)]">
                  Manejá el admin sin salir del teclado
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Cerrar"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {sections.map((section) => (
              <section key={section.title}>
                <h3 className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-3">
                  {section.title}
                </h3>
                <dl className="divide-y divide-[var(--rule-soft)]">
                  {section.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between gap-4 py-2">
                      <dt className="text-sm text-[var(--text-primary)] flex-1 min-w-0">
                        {item.description}
                      </dt>
                      <dd className="flex items-center gap-1 shrink-0">
                        {item.keys.map((k, ki) => (
                          <kbd
                            key={ki}
                            className="inline-flex items-center justify-center min-w-[1.75rem] h-6 px-1.5 rounded-md border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-xs font-mono font-semibold text-[var(--text-secondary)]"
                          >
                            {k}
                          </kbd>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default KeyboardShortcutsHelp;
