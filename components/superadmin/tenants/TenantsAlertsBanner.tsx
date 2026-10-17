"use client";

import { useState } from "react";
import { ChevronDown, AlertTriangle, type LucideIcon } from "@buleje/design-system/icons";

// ── AlertsBanner — colapsable, 1 línea cuando hay alertas ──────────────
export type AlertItemShape = {
  id: string;
  icon: LucideIcon;
  tone: "amber" | "rose" | "sky";
  label: string;
  count: number;
  onClick: () => void;
};

export function AlertsBanner({ alerts }: { alerts: AlertItemShape[] }) {
  const [expanded, setExpanded] = useState(false);
  const totalCount = alerts.reduce((s, a) => s + a.count, 0);
  const worstTone = alerts.some((a) => a.tone === "rose")
    ? "rose"
    : alerts.some((a) => a.tone === "amber")
      ? "amber"
      : "sky";
  const toneCls = {
    amber: "border-teal-500/40 bg-teal-500/8 text-teal-700 dark:text-teal-300",
    rose: "border-[var(--data-error-500)] bg-rose-500/8 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
    sky: "border-sky-500/40 bg-sky-500/8 text-sky-700 dark:text-sky-300",
  }[worstTone];

  return (
    <div className={`rounded-xl border-2 ${toneCls}`}>
      {/* Header colapsable — 1 línea con summary */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
        aria-expanded={expanded}
      >
        <span className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/40 dark:bg-black/20">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <span className="text-sm font-bold flex-1 min-w-0 truncate">
          {alerts.length === 1
            ? alerts[0].label
            : `${alerts.length} problemas detectados · ${totalCount} tienda${totalCount === 1 ? "" : "s"} afectada${totalCount === 1 ? "" : "s"}`}
        </span>
        {alerts.length > 1 && (
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
        )}
      </button>
      {/* Items expandidos — uno por línea cuando hay más de 1 */}
      {expanded && alerts.length > 1 && (
        <div className="border-t border-current/20 px-3 py-2 space-y-1">
          {alerts.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => { a.onClick(); setExpanded(false); }}
                className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-white/30 dark:hover:bg-black/20 text-left"
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="text-xs font-semibold flex-1 min-w-0 truncate">{a.label}</span>
                <span className="shrink-0 inline-flex h-5 min-w-[20px] px-1.5 items-center justify-center rounded-full bg-white/60 dark:bg-black/30 text-[length:var(--ts-2xs)] font-bold tabular-nums">
                  {a.count}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
