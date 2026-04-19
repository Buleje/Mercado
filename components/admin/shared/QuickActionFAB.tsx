"use client";

/**
 * components/admin/shared/QuickActionFAB.tsx
 *
 * Floating Action Button con menu de acciones rapidas para el admin.
 * Posicion: esquina inferior-derecha, fixed.
 * Acciones: Nueva venta, Agregar producto, Ver pedidos, Chat IA.
 */

import { useState, useEffect, useRef, useCallback, type ComponentType } from "react";
import { Plus, Receipt, PackagePlus, ClipboardCheck, BotMessageSquare } from "@buleje/design-system/icons";
import { m, AnimatePresence } from "@/components/admin/providers";
import { cn } from "@/lib/utils";

interface QuickAction {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  iconColor: string;
  onClick: () => void;
}

interface QuickActionFABProps {
  onNavigate: (tab: string) => void;
}

export default function QuickActionFAB({ onNavigate }: QuickActionFABProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const actions: QuickAction[] = [
    {
      id: "nueva-venta",
      label: "Nueva venta",
      icon: Receipt,
      iconColor: "text-[var(--data-success)]",
      onClick: () => { onNavigate("ventas-caja"); setOpen(false); },
    },
    {
      id: "agregar-producto",
      label: "Agregar producto",
      icon: PackagePlus,
      iconColor: "text-[var(--data-warning)]",
      onClick: () => { onNavigate("inventario"); setOpen(false); },
    },
    {
      id: "ver-pedidos",
      label: "Ver pedidos",
      icon: ClipboardCheck,
      iconColor: "text-[var(--data-success)]",
      onClick: () => { onNavigate("pedidos"); setOpen(false); },
    },
    {
      id: "chat-ia",
      label: "Chat IA",
      icon: BotMessageSquare,
      iconColor: "text-[var(--text-secondary)]",
      onClick: () => { onNavigate("asistente-ia"); setOpen(false); },
    },
  ];

  // Cerrar con click fuera
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Cerrar con Escape
  const handleKeydown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape" && open) setOpen(false);
  }, [open]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [handleKeydown]);

  return (
    <div ref={containerRef} className="fixed bottom-6 right-6 z-50 hidden sm:block">
      {/* Menu de acciones */}
      <AnimatePresence>
        {open && (
          <div className="absolute bottom-18 right-0 flex flex-col gap-3 items-end">
            {actions.map((action, index) => {
              const Icon = action.icon;
              return (
                <m.div
                  key={action.id}
                  initial={{ opacity: 0, scale: 0, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0, y: 10 }}
                  transition={{
                    duration: 0.2,
                    delay: (actions.length - 1 - index) * 0.05,
                  }}
                  className="flex items-center gap-3"
                >
                  {/* Tooltip / label */}
                  <m.span
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.15, delay: (actions.length - 1 - index) * 0.05 + 0.05 }}
                    className="px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-zinc-700 text-white text-xs font-medium whitespace-nowrap"
                  >
                    {action.label}
                  </m.span>

                  {/* Boton de accion */}
                  <button
                    onClick={action.onClick}
                    className="w-12 h-12 rounded-full bg-white dark:bg-zinc-800 flex items-center justify-center hover:scale-110 transition-transform border border-[var(--rule-soft)] dark:border-zinc-700"
                    title={action.label}
                  >
                    <Icon className={cn("h-5 w-5", action.iconColor)} />
                  </button>
                </m.div>
              );
            })}
          </div>
        )}
      </AnimatePresence>

      {/* Boton FAB principal */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "w-14 h-14 rounded-full bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] text-white",
          "flex items-center justify-center transition-all duration-[var(--dur-base)]",
          open && "bg-[var(--accent-soft)]"
        )}
        aria-label={open ? "Cerrar acciones rapidas" : "Acciones rapidas"}
        title="Acciones rapidas"
      >
        <m.div
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <Plus className="h-6 w-6" />
        </m.div>
      </button>
    </div>
  );
}
