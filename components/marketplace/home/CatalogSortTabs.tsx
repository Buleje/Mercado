"use client";

/**
 * CatalogSortTabs — el orden de «Todo el mercado» en píldoras (home «Dosel»).
 *
 * Un solo grid que se REORDENA (Destacados · Nuevos · Menor precio · Mejor
 * valorado). Setea `?sort=`, que el catálogo ya consume (CatalogUrlSync →
 * CatalogFilterContext → grid). Píldoras de 44 px con el indicador que se
 * desliza (`layoutId`, `--dur-base`); a 400 px se desplazan en horizontal.
 * `PILDORA_*` queda exportado para que las pestañas de «Descubre» calcen.
 */

import { useSearchParams, useRouter } from "next/navigation";
import { m, useReducedMotion } from "framer-motion";
import { EASE, DURATION } from "@/components/ui-system/motion";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "popular", label: "Destacados" },
  { id: "newest", label: "Nuevos" },
  { id: "price_asc", label: "Menor precio" },
  { id: "rating", label: "Mejor valorado" },
] as const;

export const PILDORA_BASE =
  "relative inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-sm font-bold transition-colors duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-canvas)]";
export const PILDORA_INACTIVA =
  "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]";
export const PILDORA_ACTIVA = "text-[var(--surface-canvas)]";
/** Fondo del indicador que se desliza bajo la píldora activa. */
export const PILDORA_INDICADOR = "absolute inset-0 rounded-full bg-[var(--text-primary)]";

export default function CatalogSortTabs() {
  const sp = useSearchParams();
  const router = useRouter();
  const reducir = useReducedMotion() ?? false;
  // Sin `?sort=` el catálogo arranca en "popular" → Destacados activo.
  const active = sp.get("sort")?.toLowerCase() ?? "popular";

  const select = (id: string) => {
    const params = new URLSearchParams(Array.from(sp.entries()));
    params.set("sort", id);
    // scroll:false → el grid se reordena en el lugar (no salta al tope).
    router.push(`/?${params.toString()}#catalogo`, { scroll: false });
  };

  return (
    <nav aria-label="Ordenar productos">
      <div className="-m-1 flex gap-1 overflow-x-auto p-1 [scrollbar-width:none] max-sm:[mask-image:linear-gradient(to_right,black_82%,transparent)] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => select(t.id)}
              aria-pressed={isActive}
              className={cn(PILDORA_BASE, isActive ? PILDORA_ACTIVA : PILDORA_INACTIVA)}
            >
              {isActive && (
                <m.span
                  layoutId={reducir ? undefined : "orden-catalogo"}
                  transition={{ duration: DURATION.base, ease: EASE.editorial }}
                  className={PILDORA_INDICADOR}
                  aria-hidden
                />
              )}
              <span className="relative">{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
