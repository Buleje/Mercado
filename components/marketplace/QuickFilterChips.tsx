"use client";

import {
  Clock,
  Truck,
  Tag,
  Star,
  Sparkles,
  Smartphone,
  Sun,
  Coins,
  Wallet,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

/* ── Chip definitions ──────────────────────────────────────────────────────── */

export type QuickChipId =
  | "open_now"
  | "free_delivery"
  | "has_offers"
  | "top_rated"
  | "new_stores"
  | "accepts_yape"
  | "no_min_order"
  | "open_24h"
  | "accepts_fiado";

interface ChipDef {
  id: QuickChipId;
  label: string;
  Icon: React.ElementType;
}

const CHIPS: ChipDef[] = [
  { id: "open_now",      label: "Abierto ahora",   Icon: Clock      },
  { id: "free_delivery", label: "Delivery gratis", Icon: Truck      },
  { id: "has_offers",    label: "Con ofertas",     Icon: Tag        },
  { id: "top_rated",     label: "4.5 o más",       Icon: Star       },
  { id: "new_stores",    label: "Nuevos",          Icon: Sparkles   },
  { id: "accepts_yape",  label: "Acepta Yape",     Icon: Smartphone },
  { id: "no_min_order",  label: "Sin mínimo",      Icon: Coins      },
  { id: "open_24h",      label: "Abre 24 h",       Icon: Sun        },
  { id: "accepts_fiado", label: "Acepta fiado",    Icon: Wallet     },
];

/* ── Props ──────────────────────────────────────────────────────────────────── */

/**
 * Stores reales del marketplace — usados para mostrar SÓLO los chips cuyo
 * filtro tiene ≥1 tienda que lo cumple. Si no se pasa o está vacío, se
 * muestran todos (fallback a comportamiento legacy mientras carga).
 */
export interface QuickFilterStore {
  rating?: number;
  isOpenNow?: boolean;
  freeDelivery?: boolean;
  paymentMethods?: string[] | null;
  minimumOrder?: number | null;
  hours24h?: boolean;
  createdAt?: string | Date | null;
  hasOffers?: boolean;
  acceptsFiado?: boolean;
}

export interface QuickFilterChipsProps {
  activeChips: Set<QuickChipId>;
  onToggle: (chipId: QuickChipId) => void;
  /** Lista de tiendas reales — para ocultar chips sin tiendas que cumplen. */
  stores?: ReadonlyArray<QuickFilterStore>;
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Devuelve true si el chip tiene ≥1 tienda que cumple el criterio. */
function chipHasMatch(chip: QuickChipId, stores: ReadonlyArray<QuickFilterStore>): boolean {
  if (stores.length === 0) return true; // fallback mientras carga
  switch (chip) {
    case "open_now":
      return stores.some((s) => s.isOpenNow === true);
    case "free_delivery":
      return stores.some((s) => s.freeDelivery === true);
    case "has_offers":
      return stores.some((s) => s.hasOffers === true);
    case "top_rated":
      return stores.some((s) => (s.rating ?? 0) >= 4.5);
    case "new_stores": {
      const cutoff = Date.now() - THIRTY_DAYS_MS;
      return stores.some((s) => {
        if (!s.createdAt) return false;
        const t = typeof s.createdAt === "string" ? new Date(s.createdAt).getTime() : s.createdAt.getTime();
        return Number.isFinite(t) && t >= cutoff;
      });
    }
    case "accepts_yape":
      return stores.some((s) =>
        Array.isArray(s.paymentMethods) && s.paymentMethods.some((m) => m.toLowerCase().includes("yape")),
      );
    case "no_min_order":
      return stores.some((s) => (s.minimumOrder ?? 0) <= 0);
    case "open_24h":
      return stores.some((s) => s.hours24h === true);
    case "accepts_fiado":
      return stores.some((s) => s.acceptsFiado === true);
  }
}

/* ── Component ──────────────────────────────────────────────────────────────── */

export default function QuickFilterChips({
  activeChips,
  onToggle,
  stores = [],
}: QuickFilterChipsProps) {
  // Filtra los chips a solo aquellos con ≥1 match en stores reales.
  // Si el chip está activo lo dejamos visible para que el usuario pueda
  // desactivarlo (UX: nunca dejes un filtro activo "huérfano").
  const visibleChips = CHIPS.filter(
    (c) => activeChips.has(c.id) || chipHasMatch(c.id, stores),
  );

  // Si nada matchea (raro: tiendas vacías o sin metadata), no renderizamos.
  if (visibleChips.length === 0) return null;

  return (
    <div
      role="group"
      aria-label="Filtros rapidos"
      className="flex flex-wrap gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0"
    >
      {visibleChips.map(({ id, label, Icon }) => {
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
