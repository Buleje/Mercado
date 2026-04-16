"use client";

import React from "react";
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
  emerald: "bg-emerald-50 dark:bg-emerald-900/20",
  blue: "bg-blue-50 dark:bg-blue-900/20",
  amber: "bg-amber-50 dark:bg-amber-900/20",
  red: "bg-red-50 dark:bg-red-900/20",
  violet: "bg-violet-50 dark:bg-violet-900/20",
  gray: "bg-gray-50 dark:bg-zinc-800",
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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
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
            <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate">
              {title}
            </h2>
            {subtitle && (
              <p className="text-sm text-gray-500 dark:text-zinc-400 truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {actions && (
          <div className="flex items-center gap-2 shrink-0">
            {actions}
          </div>
        )}
      </div>

      {tabs && tabs.length > 0 && (
        <div className="flex items-center gap-1 border-b border-gray-100 dark:border-zinc-800">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={tab.onClick}
              className={cn(
                "px-3 py-2 text-sm font-medium transition-colors relative",
                tab.active
                  ? "text-gray-900 dark:text-white"
                  : "text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300",
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
