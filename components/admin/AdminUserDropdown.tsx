"use client";

import React, { useState, useRef, useEffect } from "react";
import { m, AnimatePresence } from "@/components/admin/providers";
import { Settings, CreditCard, UserCircle, LogOut, ChevronDown } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface AdminUserDropdownProps {
  userName: string;
  userRole: string;
  onNavigate: (tab: string) => void;
  onLogout: () => void;
}

export default function AdminUserDropdown({ userName, userRole, onNavigate, onLogout }: AdminUserDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open]);

  const initials = userName
    .split(" ")
    .map(w => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "U";

  const MENU_ITEMS = [
    { id: "config", label: "Configuración", icon: Settings, color: "text-[var(--text-secondary)]" },
    { id: "plan", label: "Mi Plan", icon: CreditCard, color: "text-[var(--text-secondary)]" },
    { id: "mi-perfil", label: "Mi Perfil", icon: UserCircle, color: "text-[var(--text-secondary)]" },
  ];

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded-xl transition-all duration-[var(--dur-base)]",
          "hover:bg-gray-100 dark:hover:bg-accent",
          open && "bg-gray-100 dark:bg-accent"
        )}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <div className="h-8 w-8 rounded-full bg-primary/90 flex items-center justify-center shrink-0 ">
          <span className="text-white text-xs font-bold">{initials}</span>
        </div>
        <ChevronDown className={cn(
          "h-3.5 w-3.5 text-[var(--text-tertiary)] transition-transform duration-[var(--dur-base)] hidden sm:block",
          open && "rotate-180"
        )} />
      </button>

      {/* Dropdown menu */}
      <AnimatePresence>
        {open && (
          <m.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden z-100"
          >
            {/* User info header */}
            <div className="px-4 py-3.5 border-b border-[var(--rule-soft)] dark:border-white/5 bg-gray-50/50 dark:bg-surface/50">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/90 flex items-center justify-center shrink-0">
                  <span className="text-white text-sm font-bold">{initials}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate capitalize">{userName}</p>
                  <p className="text-xs text-[var(--text-secondary)] dark:text-muted capitalize">{userRole}</p>
                </div>
              </div>
            </div>

            {/* Menu items */}
            <div className="py-1.5 px-1.5">
              {MENU_ITEMS.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => { onNavigate(item.id); setOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", item.color)} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Logout divider */}
            <div className="border-t border-[var(--rule-soft)] dark:border-white/5 py-1.5 px-1.5">
              <button
                onClick={() => { onLogout(); setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[var(--data-error)] hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/20 transition-colors"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Cerrar sesión</span>
              </button>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
