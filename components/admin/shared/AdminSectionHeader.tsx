"use client";

import React from "react";
import { SectionTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";

interface AdminSectionHeaderTab {
  id: string;
  label: string;
  active?: boolean;
  onClick: () => void;
}

interface AdminSectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  iconColor?: string;
  actions?: React.ReactNode;
  tabs?: AdminSectionHeaderTab[];
}

const iconBgMap: Record<string, string> = {
  emerald: "bg-primary/10 dark:bg-primary/15",
  blue: "bg-primary/10 dark:bg-primary/15",
  amber: "bg-amber-50 dark:bg-amber-900/20",
  red: "bg-red-50 dark:bg-red-900/20",
  violet: "bg-[var(--surface-sunken)]",
  gray: "bg-[var(--surface-alt)] dark:bg-zinc-800",
};

function getIconBg(color?: string): string {
  if (!color) return iconBgMap.gray;
  const lower = color.toLowerCase();
  for (const [key, val] of Object.entries(iconBgMap)) {
    if (lower.includes(key)) return val;
  }
  return iconBgMap.gray;
}

function AdminSectionHeader({ title, subtitle, icon: Icon, iconColor, actions, tabs }: AdminSectionHeaderProps) {
  return (
    // @container + rem explícitos, igual que AdminModuleHeader: con las acciones
    // en `shrink-0` y el título sin espacio, el subtítulo se parte por palabra.
    // (Los tokens `--container-*` están redefinidos en @theme, por eso no se usan
    // las variantes con nombre `@sm/@md`.)
    <div className="@container space-y-3">
      <div className="flex flex-col gap-3 @min-[40rem]:flex-row @min-[40rem]:items-center @min-[40rem]:justify-between @min-[40rem]:gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {Icon && (
            <div
              className={cn(
                "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                getIconBg(iconColor),
              )}
            >
              <Icon className="h-5 w-5" style={{ color: iconColor || "#6b7280" }} />
            </div>
          )}
          <div className="min-w-0">
            <SectionTitle className="text-xl truncate">
              {title}
            </SectionTitle>
            {/* Igual que en AdminModuleHeader: en angosto manda el título. */}
            {subtitle && (
              <p className="hidden @min-[28rem]:block text-sm text-[var(--text-secondary)] dark:text-zinc-400 truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {actions && (
          <div className="flex flex-wrap items-center gap-2 @min-[40rem]:shrink-0">
            {actions}
          </div>
        )}
      </div>

      {tabs && tabs.length > 0 && (
        <div className="flex items-center gap-1 border-b border-[var(--rule-soft)] dark:border-zinc-800">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={tab.onClick}
              className={cn(
                "px-3 py-2 text-sm font-medium transition-colors relative",
                tab.active
                  ? "text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] dark:text-zinc-400 hover:text-[var(--text-primary)] dark:hover:text-zinc-300",
              )}
            >
              {tab.label}
              {tab.active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 dark:bg-white rounded-full" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default React.memo(AdminSectionHeader);
