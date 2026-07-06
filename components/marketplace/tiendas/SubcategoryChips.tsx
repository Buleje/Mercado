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
import { Boxes, ChevronRight } from "@buleje/design-system/icons";
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
  variant: "pill" | "card" | "row" | "tile";
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
                    ? "bg-[var(--accent)] text-white shadow-md scale-105"
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

        // ── TILE: cuadro grande estilo Betano (foto cover + label overlay).
        //     Brandon 2026-07-06: fila de "¿qué se te antoja hoy?" bajo el banner. ──
        if (variant === "tile") {
          return (
            <button
              key={`tile-${s.id}`}
              onClick={onClick}
              aria-pressed={active}
              title={s.description || s.label}
              className={cn(
                "group relative h-[76px] w-[76px] shrink-0 overflow-hidden rounded-xl border transition-all sm:h-[92px] sm:w-[92px]",
                active
                  ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/40"
                  : "border-[var(--rule-base)] hover:-translate-y-0.5 hover:border-[var(--accent)]/50",
              )}
            >
              {s.imageUrl ? (
                <Image
                  src={s.imageUrl}
                  alt=""
                  fill
                  sizes="92px"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Boxes className="h-6 w-6" strokeWidth={1.75} aria-hidden />
                </span>
              )}
              <span
                aria-hidden
                className="absolute inset-0 bg-linear-to-t from-black/70 via-black/5 to-transparent"
              />
              <span className="absolute inset-x-0 bottom-0 px-1.5 pb-1.5 text-left">
                <span className="line-clamp-1 text-[length:var(--ts-xs)] font-extrabold leading-tight text-white drop-shadow">
                  {s.label}
                </span>
              </span>
            </button>
          );
        }

        // ── ROW: sidebar desktop — card tappable proporcionada (filtro estrella) ──
        // Brandon 2026-06-02 v2: tamaño acorde al contenido (label corto) sin
        // perder calidad — más compacta que v1, con chevron que llena el aire
        // y señala "tap para filtrar".
        return (
          <button
            key={`sidebar-${s.id}`}
            onClick={onClick}
            aria-pressed={active}
            title={s.description || s.label}
            // Rediseño minimalista (Brandon 2026-06-10): radio sutil, contorno
            // en vez de fondo difuminado, activo = contorno oscuro sólido (mismo
            // lenguaje que QuickFilterToggle). Sin shadow ni translate.
            className={cn(
              "group w-full flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-base font-bold transition-colors text-left",
              active
                ? "bg-[var(--surface-sunken)] border-[var(--text-primary)] text-[var(--text-primary)]"
                : "bg-[var(--surface-canvas)] border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--text-primary)]/40 hover:text-[var(--text-primary)]",
            )}
          >
            <span
              className={cn(
                "h-9 w-9 rounded-md overflow-hidden flex items-center justify-center shrink-0 transition-colors",
                active
                  ? "bg-[var(--text-primary)] text-[var(--surface-raised)]"
                  : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)]",
              )}
            >
              {s.imageUrl ? (
                <Image
                  src={s.imageUrl}
                  alt=""
                  width={36}
                  height={36}
                  sizes="36px"
                  className="h-full w-full object-cover"
                />
              ) : (
                <Boxes className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
              )}
            </span>
            <span className="truncate flex-1">{s.label}</span>
            <ChevronRight
              aria-hidden
              className={cn(
                "h-4 w-4 shrink-0 transition-all",
                active
                  ? "text-[var(--accent)] translate-x-0"
                  : "text-[var(--text-tertiary)] -translate-x-0.5 opacity-60 group-hover:translate-x-0 group-hover:opacity-100 group-hover:text-[var(--accent)]",
              )}
              strokeWidth={2.5}
            />
          </button>
        );
      })}
    </>
  );
}
