"use client";

import React, { useEffect, useRef, useState } from "react";
import { m, AnimatePresence } from "@/components/admin/providers";
import {
  Power,
  Maximize2,
  Minimize2,
  Eye,
  Sun,
  Moon,
  Monitor,
  Settings2,
  ChevronDown,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type ThemeMode = "light" | "dark" | "system";

interface Props {
  focusMode: boolean;
  resolvedTheme: "light" | "dark";
  themeMode: ThemeMode;
  onOpenCierreDiario: () => void;
  onToggleFocus: () => void;
  onTogglePresentation: () => void;
  onSetTheme: (t: ThemeMode) => void;
}

/**
 * AdminOptionsDropdown — menú consolidado del header admin.
 *
 * Agrupa:
 *   - Cerrar día (arqueo de caja)
 *   - Ampliar pantalla (focus mode toggle)
 *   - Modo presentación
 *   - Selector de tema (claro · oscuro · sistema) como segmented control
 *
 * Dark mode nativo: todos los colores usan tokens CSS con `dark:` variants.
 */
export default function AdminOptionsDropdown({
  focusMode,
  resolvedTheme,
  themeMode,
  onOpenCierreDiario,
  onToggleFocus,
  onTogglePresentation,
  onSetTheme,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open]);

  const ACTIONS: Array<{
    id: string;
    label: string;
    hint?: string;
    icon: typeof Power;
    tone?: "default" | "warning";
    onClick: () => void;
  }> = [
    {
      id: "cerrar-dia",
      label: "Cerrar día",
      hint: "Arqueo de caja · Ctrl+Shift+C",
      icon: Power,
      tone: "warning",
      onClick: () => {
        setOpen(false);
        onOpenCierreDiario();
      },
    },
    {
      id: "focus",
      label: focusMode ? "Reducir (salir de enfoque)" : "Ampliar pantalla",
      hint: focusMode ? "Restaurar sidebar" : "Oculta sidebar para enfocarte",
      icon: focusMode ? Minimize2 : Maximize2,
      onClick: () => {
        setOpen(false);
        onToggleFocus();
      },
    },
    {
      id: "presentacion",
      label: "Modo presentación",
      hint: "Pantalla limpia · Ctrl+Shift+P",
      icon: Eye,
      onClick: () => {
        setOpen(false);
        onTogglePresentation();
      },
    },
  ];

  const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
    { value: "light", label: "Claro", icon: Sun },
    { value: "dark", label: "Oscuro", icon: Moon },
    { value: "system", label: "Sistema", icon: Monitor },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Opciones del panel"
        className={cn(
          "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold transition-colors border",
          "text-[var(--text-secondary)] border-[var(--rule-base)]",
          "dark:text-[var(--text-secondary)] dark:border-[var(--rule-base)]",
          "hover:bg-gray-100 dark:hover:bg-[var(--surface-sunken)] hover:text-primary",
          open && "bg-gray-100 dark:bg-[var(--surface-sunken)] text-primary",
        )}
      >
        <Settings2 className="h-4 w-4" />
        <span className="hidden md:inline">Opciones</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <m.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            role="menu"
            className={cn(
              "absolute right-0 top-full mt-2 w-80 rounded-xl z-50",
              "bg-white dark:bg-[var(--surface-raised)]",
              "border border-[var(--rule-base)]",
              "shadow-lg shadow-black/5 dark:shadow-black/40",
              "overflow-hidden",
            )}
          >
            <div className="px-4 py-3 border-b border-[var(--rule-soft)]">
              <p className="text-[length:var(--ts-3xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Panel
              </p>
              <p className="text-sm font-semibold text-[var(--text-primary)] mt-0.5">
                Opciones rápidas
              </p>
            </div>

            <div className="p-1.5">
              {ACTIONS.map((it) => {
                const Icon = it.icon;
                return (
                  <button
                    key={it.id}
                    type="button"
                    role="menuitem"
                    onClick={it.onClick}
                    className={cn(
                      "w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                      "hover:bg-gray-50 dark:hover:bg-[var(--surface-sunken)]",
                      it.tone === "warning" &&
                        "hover:bg-[var(--data-warning-50)] dark:hover:bg-amber-950/20",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg shrink-0 transition-colors",
                        it.tone === "warning"
                          ? "bg-[var(--data-warning-50)] dark:bg-amber-950/30 text-[var(--data-warning-500)]"
                          : "bg-gray-50 dark:bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span
                        className={cn(
                          "block text-sm font-semibold",
                          it.tone === "warning"
                            ? "text-[var(--data-warning-500)]"
                            : "text-[var(--text-primary)]",
                        )}
                      >
                        {it.label}
                      </span>
                      {it.hint && (
                        <span className="block text-[length:var(--ts-xs)] text-[var(--text-tertiary)] mt-0.5">
                          {it.hint}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Theme segmented control */}
            <div className="px-3 pb-3 pt-1 border-t border-[var(--rule-soft)]">
              <p className="text-[length:var(--ts-3xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
                Tema
              </p>
              <div
                role="radiogroup"
                aria-label="Seleccionar tema"
                className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-gray-50 dark:bg-[var(--surface-sunken)] border border-[var(--rule-soft)]"
              >
                {THEME_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = themeMode === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => onSetTheme(opt.value)}
                      className={cn(
                        "relative flex flex-col items-center gap-1 py-2 rounded-md text-xs font-semibold transition-all duration-150",
                        active
                          ? "bg-white dark:bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm border border-[var(--rule-base)]"
                          : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[length:var(--ts-xs)] text-[var(--text-tertiary)] text-center">
                {themeMode === "system"
                  ? `Siguiendo sistema · actualmente ${resolvedTheme === "dark" ? "oscuro" : "claro"}`
                  : `Tema actual: ${themeMode === "dark" ? "oscuro" : "claro"}`}
              </p>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
