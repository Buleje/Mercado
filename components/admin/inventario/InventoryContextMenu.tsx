"use client";

/**
 * InventoryContextMenu — menú contextual (click derecho) de las filas de
 * producto. Extraído de InventoryTab.tsx (2026-06-13). Editar/Ver/Duplicar/
 * Eliminar. Cierra con click-fuera o Escape.
 */

import { useEffect, useRef } from "react";
import { Pencil, Eye, Copy, Trash2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DbProduct } from "@/lib/jsondb";

interface InventoryContextMenuProps {
  product: DbProduct;
  x: number;
  y: number;
  onClose: () => void;
  onEdit: (p: DbProduct) => void;
  onView: (p: DbProduct) => void;
  onDuplicate: (p: DbProduct) => void;
  onDelete: (p: DbProduct) => void;
}

export function InventoryContextMenu({ product, x, y, onClose, onEdit, onView, onDuplicate, onDelete }: InventoryContextMenuProps) {
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

  const items: Array<{ label: string; icon: typeof Pencil; onClick: () => void; variant?: "default" | "danger"; divider?: boolean }> = [
    { label: "Editar producto", icon: Pencil, onClick: () => onEdit(product) },
    { label: "Ver detalles", icon: Eye, onClick: () => onView(product) },
    { label: "Duplicar", icon: Copy, onClick: () => onDuplicate(product) },
    { label: "Eliminar", icon: Trash2, onClick: () => onDelete(product), variant: "danger", divider: true },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-white dark:bg-zinc-900 rounded-xl border border-[var(--rule-soft)] dark:border-zinc-800 min-w-[180px] py-1 animate-in fade-in zoom-in-95 duration-[var(--dur-fast)]"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <div key={i}>
            {item.divider && (
              <div className="my-1 border-t border-[var(--rule-soft)] dark:border-zinc-800" />
            )}
            <button
              onClick={item.onClick}
              className={cn(
                "w-full px-3 py-2 text-sm flex items-center gap-2 cursor-pointer transition-colors",
                item.variant === "danger"
                  ? "text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/20"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-alt)] dark:hover:bg-zinc-800",
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
