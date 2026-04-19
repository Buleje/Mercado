"use client";

import { Clock, Truck, Tag, Star, Sparkles } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

/* ── Chip definitions ──────────────────────────────────────────────────────── */

export type QuickChipId =
  | "open_now"
  | "free_delivery"
  | "has_offers"
  | "top_rated"
  | "new_stores";

interface ChipDef {
  id: QuickChipId;
  label: string;
  Icon: React.ElementType;
}

const CHIPS: ChipDef[] = [
  { id: "open_now",      label: "Abierto ahora",  Icon: Clock     },
  { id: "free_delivery", label: "Delivery gratis", Icon: Truck     },
  { id: "has_offers",    label: "Con ofertas",     Icon: Tag       },
  { id: "top_rated",     label: "4.5 o mas",       Icon: Star      },
  { id: "new_stores",    label: "Nuevos",           Icon: Sparkles  },
];

/* ── Props ──────────────────────────────────────────────────────────────────── */

export interface QuickFilterChipsProps {
  activeChips: Set<QuickChipId>;
  onToggle: (chipId: QuickChipId) => void;
}

/* ── Component ──────────────────────────────────────────────────────────────── */

export default function QuickFilterChips({
  activeChips,
  onToggle,
}: QuickFilterChipsProps) {
  return (
    <div
      role="group"
      aria-label="Filtros rapidos"
      className="flex flex-wrap gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0"
    >
      {CHIPS.map(({ id, label, Icon }) => {
        const active = activeChips.has(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => onToggle(id)}
            aria-pressed={active}
            aria-label={label}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0",
              active
                ? "border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900"
                : "border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-800",
            )}
          >
            <Icon
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                active
                  ? "text-white dark:text-gray-900"
                  : "text-gray-400 dark:text-gray-500",
              )}
              aria-hidden="true"
            />
            {label}
          </button>
        );
      })}
    </div>
  );
}
