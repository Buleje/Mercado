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
  category: _category,
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

  /* Paleta del flyout coherente con el sidebar buleje (slate profundo + teal).
     "cristal" ahora replica el lenguaje editorial buleje: bg slate-deep,
     ring teal, active state con gradient pill + icono cyan glow. */
  const themeStyles = {
    cristal: {
      bg: "bg-[linear-gradient(180deg,#0b1f2b_0%,#091621_100%)]",
      arrow: "bg-[#0b1f2b] border-[rgba(0,180,166,0.2)]",
      border: "border-[rgba(0,180,166,0.2)] shadow-[var(--shadow-lg)] ring-1 ring-[rgba(52,212,190,0.08)]",
      activeBg: "bg-linear-to-r from-[rgba(52,212,190,0.22)] via-[rgba(0,180,166,0.14)] to-[rgba(0,180,166,0.04)] text-white font-semibold shadow-[inset_3px_0_0_#34d4be]",
      inactiveText: "text-white/70",
      hoverBg: "hover:bg-white/[0.05] hover:text-white",
      indicator: "bg-[#34d4be]",
      activeIcon: "text-[#5eead4] drop-shadow-[0_0_4px_rgba(52,212,190,0.5)]",
      inactiveIcon: "text-white/45",
    },
    dark: {
      bg: "bg-zinc-950",
      arrow: "bg-zinc-950 border-white/10",
      border: "border-white/10 shadow-xl",
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
      border: "border-[var(--rule-soft)] shadow-lg",
      activeBg: "bg-[var(--accent-soft)] text-primary font-semibold",
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
        top: position.top - 8,
        /* Pegado al sidebar (sin gap) — left: 260 = sidebar width exacto.
           El borde izquierdo del flyout queda touching con el border del sidebar. */
        left: 260,
        zIndex: 100,
      }}
      className={cn(
        "rounded-xl rounded-l-none border min-w-[220px] overflow-hidden py-1.5",
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
      {/* Tab options — sin header, solo enlaces */}
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
              "relative w-full flex items-center gap-2.5 px-4 py-2.5 text-[length:var(--ts-sm)] font-medium transition-all",
              isActive
                ? themeStyles.activeBg
                : cn(themeStyles.inactiveText, themeStyles.hoverBg),
            )}
          >
            {isActive && theme !== "cristal" && (
              <span className={cn("absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 rounded-r-full", themeStyles.indicator)} />
            )}
            <Icon
              className={cn(
                "h-4 w-4 shrink-0 transition-transform",
                isActive ? themeStyles.activeIcon : themeStyles.inactiveIcon,
              )}
            />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
