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
              "inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-base font-semibold transition-colors whitespace-nowrap shrink-0",
              active
                ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--surface-canvas)]"
                : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)]",
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 shrink-0",
                active ? "" : "text-[var(--text-tertiary)]",
              )}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            {label}
          </button>
        );
      })}
    </div>
  );
}
