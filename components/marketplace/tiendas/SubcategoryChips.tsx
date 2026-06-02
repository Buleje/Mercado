"use client";

/**
 * SubcategoryChips — chips de subcategoría de /tiendas en sus 3 presentaciones.
 *
 * Audit #12 (Brandon 2026-05-30): TiendasClient repetía el mismo `subcategories.map`
 * 3× con markup distinto (sticky pill / card mobile / fila sidebar desktop).
 * Mismo data + handler + estado activo + fallback de imagen → 1 componente con
 * `variant`. Los WRAPPERS (barra sticky, scroll container, sidebar) y el chip
 * "Todas" quedan en TiendasClient — acá vive solo la lista de chips.
 *
 * Markup preservado EXACTO por variante (refactor sin cambio visual).
 */

import Image from "next/image";
import { Boxes } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export interface SubcategoryChipOption {
  id: string;
  label: string;
  description?: string | null;
  imageUrl: string | null;
}

interface SubcategoryChipsProps {
  subcategories: ReadonlyArray<SubcategoryChipOption>;
  activeId: string | null;
  onSelect: (id: string | null) => void;
  variant: "pill" | "card" | "row";
}

export default function SubcategoryChips({
  subcategories,
  activeId,
  onSelect,
  variant,
}: SubcategoryChipsProps) {
  return (
    <>
      {subcategories.map((s) => {
        const active = activeId === s.id;
        const onClick = () => onSelect(active ? null : s.id);

        // ── PILL: barra sticky mobile (rounded-full, icono inline) ──
        if (variant === "pill") {
          return (
            <button
              key={s.id}
              onClick={onClick}
              aria-pressed={active}
              title={s.description || s.label}
              className={cn(
                "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-extrabold transition-colors whitespace-nowrap",
                active
                  ? "bg-[var(--accent)] text-white shadow-sm"
                  : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              {s.imageUrl ? (
                <Image
                  src={s.imageUrl}
                  alt=""
                  width={20}
                  height={20}
                  sizes="20px"
                  className="h-5 w-5 rounded-md object-cover shrink-0"
                />
              ) : (
                <Boxes className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              )}
              <span className="max-w-[120px] truncate">{s.label}</span>
            </button>
          );
        }

        // ── CARD: mobile/tablet (flex-col, ícono cuadrado + label con border-b) ──
        if (variant === "card") {
          return (
            <button
              key={s.id}
              onClick={onClick}
              aria-pressed={active}
              title={s.description || s.label}
              className={cn(
                "shrink-0 inline-flex flex-col items-center gap-1 transition-all px-1 py-1.5 min-w-[64px] sm:min-w-[80px] group",
                active ? "" : "opacity-90 hover:opacity-100",
              )}
            >
              <span
                className={cn(
                  "h-10 w-10 sm:h-12 sm:w-12 rounded-2xl overflow-hidden flex items-center justify-center transition-all",
                  active
                    ? "bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/30 scale-105"
                    : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] group-hover:bg-[var(--accent-soft)] group-hover:text-[var(--accent)]",
                )}
              >
                {s.imageUrl ? (
                  <Image
                    src={s.imageUrl}
                    alt={s.label}
                    width={48}
                    height={48}
                    sizes="(min-width: 640px) 48px, 40px"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Boxes className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2} aria-hidden />
                )}
              </span>
              <span
                className={cn(
                  "text-xs sm:text-sm font-bold leading-tight text-center max-w-[80px] sm:max-w-[100px] truncate pb-0.5 border-b-2 transition-all",
                  active
                    ? "text-[var(--accent)] border-[var(--accent)]"
                    : "text-[var(--text-primary)] border-transparent group-hover:border-[var(--accent)]/40",
                )}
              >
                {s.label}
              </span>
            </button>
          );
        }

        // ── ROW: sidebar desktop — card grande tappable (filtro estrella) ──
        // Brandon 2026-06-02: es el filtro principal del sidebar ("lo que se te
        // antoja"). Tamaño grande, border-2, hover lift — no fila chiquita.
        return (
          <button
            key={`sidebar-${s.id}`}
            onClick={onClick}
            aria-pressed={active}
            title={s.description || s.label}
            className={cn(
              "group w-full flex items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-base font-bold transition-all text-left hover:-translate-y-0.5 hover:shadow-sm",
              active
                ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)] shadow-sm"
                : "bg-[var(--surface-sunken)] border-transparent text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]",
            )}
          >
            <span
              className={cn(
                "h-10 w-10 rounded-xl overflow-hidden flex items-center justify-center shrink-0 transition-all",
                active
                  ? "bg-[var(--accent)] text-white shadow-sm"
                  : "bg-[var(--surface-raised)] text-[var(--text-tertiary)] group-hover:bg-[var(--accent-soft)] group-hover:text-[var(--accent)]",
              )}
            >
              {s.imageUrl ? (
                <Image
                  src={s.imageUrl}
                  alt=""
                  width={40}
                  height={40}
                  sizes="40px"
                  className="h-full w-full object-cover"
                />
              ) : (
                <Boxes className="h-5 w-5" strokeWidth={2} aria-hidden />
              )}
            </span>
            <span className="truncate flex-1">{s.label}</span>
            {active && (
              <span aria-hidden className="ml-auto inline-flex h-2 w-2 rounded-full bg-[var(--accent)] shrink-0" />
            )}
          </button>
        );
      })}
    </>
  );
}
