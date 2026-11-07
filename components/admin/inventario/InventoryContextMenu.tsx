"use client";

/**
 * InventoryContextMenu — menú contextual (click derecho) de las filas de
 * producto. Extraído de InventoryTab.tsx (2026-06-13). Cierra con click-fuera
 * o Escape. Desde el 10-10 dibuja la MISMA lista que el ⋯ de la fila
 * (`useAccionesProducto`): antes tenía sus cuatro acciones propias y su
 * propia copia de «duplicar».
 */

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { MenuAccion } from "@/components/admin/shared/action-menu";

interface InventoryContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  acciones: MenuAccion[];
}

export function InventoryContextMenu({ x, y, onClose, acciones }: InventoryContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[9999] bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-soft)] min-w-[180px] py-1 animate-in fade-in zoom-in-95 duration-[var(--dur-fast)]"
      style={{ left: x, top: y }}
    >
      {acciones.map((item) => {
        const Icon = item.icon;
        const peligro = item.tone === "danger";
        return (
          <div key={item.id}>
            {peligro && (
              <div className="my-1 border-t border-[var(--rule-soft)] " />
            )}
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => { item.onSelect(); onClose(); }}
              className={cn(
                "w-full px-3 min-h-11 text-sm flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-50",
                peligro
                  ? "text-[var(--data-error-ink)] hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/20"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-alt)] ",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
