"use client";

import React from "react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────
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
}: SidebarFlyoutProps) {
  const [visible, setVisible] = React.useState(false);

  // Trigger enter animation on mount
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        top: position.top - 20,
        left: 268, // sidebar width (260) + 8px gap
        zIndex: 100,
      }}
      className={cn(
        "bg-white dark:bg-zinc-900 rounded-xl border border-[var(--rule-soft)] dark:border-zinc-800 min-w-[220px] overflow-hidden",
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
        className="absolute top-6 -left-[6px] w-3 h-3 bg-white dark:bg-zinc-900 border-l border-b border-[var(--rule-soft)] dark:border-zinc-800 rotate-45"
      />

      {/* Header */}
      <div className="bg-gray-50 dark:bg-zinc-800/50 px-4 py-2">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          {category.label}
        </span>
      </div>

      {/* Divider */}
      <div className="border-t border-[var(--rule-soft)] dark:border-zinc-800" />

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
                  ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800/40 hover:text-gray-900 dark:hover:text-gray-200"
              )}
            >
              {/* Active indicator bar */}
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-emerald-500 rounded-r-full" />
              )}
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  isActive ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400"
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
