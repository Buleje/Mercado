"use client";

import React, { useState, useEffect, useCallback, useRef, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────────

export interface ContextMenuItem {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onClick: () => void;
  variant?: "default" | "danger";
  divider?: boolean; // linea separadora antes de este item
}

export interface ContextMenuProps {
  items: ContextMenuItem[];
  children: React.ReactNode; // elemento que trigger el context menu
}

// ── Menu Overlay (shared between wrapper and hook) ──────────────────────────

interface MenuOverlayProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

function MenuOverlay({ items, position, onClose }: MenuOverlayProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
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

  return createPortal(
    <div
      ref={menuRef}
      className={cn(
        "fixed z-[9999] bg-white dark:bg-zinc-900 rounded-xl",
        "border border-[var(--rule-soft)] dark:border-zinc-800 min-w-[180px] py-1",
        "animate-in fade-in zoom-in-95 duration-[var(--dur-fast)]",
      )}
      style={{ left: position.x, top: position.y }}
    >
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <React.Fragment key={i}>
            {item.divider && (
              <div className="my-1 border-t border-[var(--rule-soft)] dark:border-zinc-800" />
            )}
            <button
              onClick={() => {
                item.onClick();
                onClose();
              }}
              className={cn(
                "w-full px-3 py-2 text-sm flex items-center gap-2 cursor-pointer transition-colors",
                item.variant === "danger"
                  ? "text-[var(--data-error)] hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error)]/20"
                  : "text-[var(--text-secondary)] hover:bg-gray-50 dark:hover:bg-zinc-800",
              )}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0" />}
              <span>{item.label}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>,
    document.body,
  );
}

// ── Hook: useContextMenu ────────────────────────────────────────────────────
// Usar cuando no se puede envolver con <ContextMenu> (ej. filas de tabla <tr>)
//
// Ejemplo:
//   const { onContextMenu, contextMenuPortal } = useContextMenu(items);
//   return (
//     <>
//       <tr onContextMenu={onContextMenu}>...</tr>
//       {contextMenuPortal}
//     </>
//   );

export function useContextMenu(items: ContextMenuItem[]) {
  const [state, setState] = useState<{ open: boolean; x: number; y: number }>({
    open: false,
    x: 0,
    y: 0,
  });

  const close = useCallback(() => {
    setState(s => ({ ...s, open: false }));
  }, []);

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      let x = e.clientX;
      let y = e.clientY;

      const menuWidth = 200;
      const menuHeight = items.length * 40 + 8;

      if (x + menuWidth > window.innerWidth) {
        x = window.innerWidth - menuWidth - 8;
      }
      if (y + menuHeight > window.innerHeight) {
        y = window.innerHeight - menuHeight - 8;
      }

      setState({ open: true, x, y });
    },
    [items.length],
  );

  const contextMenuPortal = state.open ? (
    <MenuOverlay items={items} position={{ x: state.x, y: state.y }} onClose={close} />
  ) : null;

  return { onContextMenu, contextMenuPortal };
}

// ── Wrapper Component ───────────────────────────────────────────────────────

function ContextMenu({ items, children }: ContextMenuProps) {
  const { onContextMenu, contextMenuPortal } = useContextMenu(items);

  return (
    <div onContextMenu={onContextMenu} className="contents">
      {children}
      {contextMenuPortal}
    </div>
  );
}

export default React.memo(ContextMenu);
