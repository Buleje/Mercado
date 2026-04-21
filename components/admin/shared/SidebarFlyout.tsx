"use client";

import React from "react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────
export type FlyoutTheme = "light" | "dark" | "cristal";

interface SidebarFlyoutProps {
  category: { id: string; label: string; tabs: string[] };
  tabs: Array<{
    id: string;
    label: string;
    icon: React.ElementType;
  }>;
  activeTab: string;
  onNavigate: (tabId: string) => void;
  position: { top: number };
  onClose: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  /** Tema heredado del sidebar. Default: cristal. */
  theme?: FlyoutTheme;
}

// ─── Component ───────────────────────────────────────────────────────────────
export function SidebarFlyout({
  category,
  tabs,
  activeTab,
  onNavigate,
  position,
  onClose,
  onMouseEnter,
  onMouseLeave,
  theme = "cristal",
}: SidebarFlyoutProps) {
  const [visible, setVisible] = React.useState(false);

  // Trigger enter animation on mount
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  /* Paleta del flyout coherente con el sidebar. */
  const themeStyles = {
    cristal: {
      /* Flyout blanco sobre sidebar primary — mejor legibilidad que
         flotar otro primary encima. */
      bg: "bg-white dark:bg-[var(--surface-raised)]",
      arrow: "bg-white dark:bg-[var(--surface-raised)] border-primary/20",
      border: "border-primary/25 shadow-lg shadow-primary/10",
      header: "bg-primary/5 dark:bg-primary/10",
      divider: "border-primary/10",
      activeBg: "bg-primary text-white",
      inactiveText: "text-[var(--text-secondary)]",
      hoverBg: "hover:bg-primary/5 dark:hover:bg-white/[0.04] hover:text-primary",
      indicator: "bg-primary",
      activeIcon: "text-white",
      inactiveIcon: "text-[var(--text-tertiary)]",
    },
    dark: {
      bg: "bg-zinc-900",
      arrow: "bg-zinc-900 border-white/10",
      border: "border-white/10",
      header: "bg-white/[0.03]",
      divider: "border-white/[0.06]",
      activeBg: "bg-white/[0.08] text-white",
      inactiveText: "text-zinc-300",
      hoverBg: "hover:bg-white/[0.04] hover:text-white",
      indicator: "bg-[var(--data-success)]",
      activeIcon: "text-[var(--data-success)]",
      inactiveIcon: "text-zinc-500",
    },
    light: {
      bg: "bg-white dark:bg-card",
      arrow: "bg-white dark:bg-card border-[var(--rule-soft)]",
      border: "border-[var(--rule-soft)]",
      header: "bg-gray-50 dark:bg-zinc-800/50",
      divider: "border-[var(--rule-soft)]",
      activeBg: "bg-[var(--accent-soft)] text-primary",
      inactiveText: "text-[var(--text-secondary)]",
      hoverBg: "hover:bg-gray-50 dark:hover:bg-zinc-800/40 hover:text-[var(--text-primary)]",
      indicator: "bg-primary",
      activeIcon: "text-primary",
      inactiveIcon: "text-[var(--text-tertiary)]",
    },
  }[theme];

  return (
    <div
      style={{
        position: "fixed",
        top: position.top - 20,
        left: 268, // sidebar width (260) + 8px gap
        zIndex: 100,
      }}
      className={cn(
        "rounded-xl border min-w-[220px] overflow-hidden shadow-lg",
        themeStyles.bg,
        themeStyles.border,
        "transition-all duration-[var(--dur-fast)]",
        visible
          ? "opacity-100 translate-x-0"
          : "opacity-0 translate-x-1"
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Arrow pointing left */}
      <div
        className={cn(
          "absolute top-6 -left-[6px] w-3 h-3 border-l border-b rotate-45",
          themeStyles.arrow,
        )}
      />

      {/* Header */}
      <div className={cn("px-4 py-2", themeStyles.header)}>
        <span className={cn("text-sm font-semibold", themeStyles.inactiveText)}>
          {category.label}
        </span>
      </div>

      {/* Divider */}
      <div className={cn("border-t", themeStyles.divider)} />

      {/* Tab options */}
      <div className="py-1">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => {
                onNavigate(id);
                onClose();
              }}
              className={cn(
                "relative w-full flex items-center gap-2.5 px-4 py-2 text-[length:var(--ts-sm)] font-medium transition-colors",
                isActive
                  ? themeStyles.activeBg
                  : cn(themeStyles.inactiveText, themeStyles.hoverBg),
              )}
            >
              {isActive && (
                <span className={cn("absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 rounded-r-full", themeStyles.indicator)} />
              )}
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  isActive ? themeStyles.activeIcon : themeStyles.inactiveIcon,
                )}
              />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
