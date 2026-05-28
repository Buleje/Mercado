"use client";

import { useState, useCallback, useEffect } from "react";
import { m, AnimatePresence } from "framer-motion";
import {
  Plus,
  Package,
  ShoppingCart,
  UserPlus,
  CreditCard,
  X,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { tapPress, EASE, DURATION } from "@/components/ui-system";
import Link from "next/link";
import { BTN } from "@/lib/copy";

/**
 * QuickActionsFab — boton flotante global para acciones admin frecuentes.
 *
 * Bottom-right fijo, siempre accesible. Al tap abre menu radial con 4 atajos:
 * nuevo producto, registrar venta, nuevo cliente, dar fiado.
 *
 * Research: Hick's law — 4 opciones max (5 con close). Thumb-reach bottom
 * para mobile. Cierra con ESC o click outside.
 *
 * Solo aparece en /admin/*, no en /admin/login, kiosk, pos-mobile.
 */

interface QuickAction {
  Icon: typeof Package;
  label: string;
  href?: string;
  onClick?: () => void;
  /** Atajo de teclado. Ej: "P" para producto */
  shortcut?: string;
}

// Brandon 2026-05-28: hrefs usaban `?module=` (legacy) cuando el admin lee
// `?tab=` (resolveInitialTab en useAdminTabs.ts). Resultado: las acciones del
// FAB no abrían el módulo correspondiente, el panel se quedaba en el tab
// activo. Ahora apuntan a los ids canónicos de tabs.types.ts.
const ACTIONS: QuickAction[] = [
  {
    Icon: ShoppingCart,
    label: BTN.createOrder, // Registrar venta — top 1 del bodeguero
    href: "/admin?tab=ventas-caja",
    shortcut: "V",
  },
  {
    Icon: Package,
    label: BTN.createProduct, // Nuevo producto
    href: "/admin?tab=productos&action=new",
    shortcut: "P",
  },
  {
    Icon: CreditCard,
    label: BTN.createCredit, // Cobrar / dar fiado
    href: "/admin?tab=fiados&action=new",
    shortcut: "F",
  },
  {
    Icon: UserPlus,
    label: BTN.createCustomer, // Nuevo cliente
    href: "/admin?tab=clientes&action=new",
    shortcut: "C",
  },
];

export function QuickActionsFab() {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      // Atajos rapidos con FAB abierto
      const match = ACTIONS.find((a) => a.shortcut?.toLowerCase() === e.key.toLowerCase());
      if (match?.href) window.location.href = match.href;
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Atajo global ⌘+K abre el FAB
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {/* Overlay cerrar */}
      <AnimatePresence>
        {open && (
          <m.div
            className="modal-backdrop" style={{ zIndex: 40 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.fast }}
            onClick={close}
            aria-hidden
          />
        )}
      </AnimatePresence>

      {/* Menu radial */}
      <AnimatePresence>
        {open && (
          <m.div
            className="fixed right-6 bottom-24 z-50 flex flex-col items-end gap-2 sm:bottom-28"
            initial="hidden"
            animate="show"
            exit="hidden"
            variants={{
              hidden: { opacity: 0 },
              show: {
                opacity: 1,
                transition: { staggerChildren: 0.04, staggerDirection: -1 },
              },
            }}
          >
            {ACTIONS.map((a) => {
              const AIcon = a.Icon;
              return (
                <m.div
                  key={a.label}
                  variants={{
                    hidden: { opacity: 0, y: 8, scale: 0.95 },
                    show: { opacity: 1, y: 0, scale: 1 },
                  }}
                  transition={{ duration: DURATION.fast, ease: EASE.entrance }}
                >
                  <Link
                    href={a.href || "#"}
                    onClick={close}
                    className="group flex items-center gap-3 rounded-full bg-[var(--surface-raised)] border border-[var(--rule-base)] shadow-xl pl-4 pr-5 py-2.5 hover:border-[var(--rule-strong)] transition-colors"
                  >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-base)] text-[var(--text-primary)]">
                      <AIcon className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                    <span className="text-sm font-semibold text-[var(--text-primary)] whitespace-nowrap">
                      {a.label}
                    </span>
                    {a.shortcut && (
                      <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-[var(--surface-sunken)] border border-[var(--rule-base)] px-1.5 text-[length:var(--ts-2xs)] font-mono tabular-nums text-[var(--text-tertiary)]">
                        {a.shortcut}
                      </kbd>
                    )}
                  </Link>
                </m.div>
              );
            })}
            {/* Hint teclado global */}
            <div className="mt-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/55 bg-black/40 backdrop-blur rounded-full px-3 py-1">
              ESC para cerrar · ⌘K para abrir
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* FAB button */}
      <m.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        whileTap={tapPress}
        className={cn(
          "fixed right-6 bottom-6 z-50 h-14 w-14 rounded-full shadow-xl transition-all",
          "flex items-center justify-center",
          "bg-[var(--text-primary)] text-[var(--surface-canvas)]",
          "hover:scale-105 active:scale-95",
          open && "rotate-45",
        )}
        style={{ transformOrigin: "center" }}
        aria-label={open ? "Cerrar acciones rápidas" : "Abrir acciones rápidas"}
        aria-expanded={open}
      >
        {open ? (
          <X className="h-5 w-5" strokeWidth={2} aria-hidden />
        ) : (
          <Plus className="h-5 w-5" strokeWidth={2} aria-hidden />
        )}
      </m.button>
    </>
  );
}
