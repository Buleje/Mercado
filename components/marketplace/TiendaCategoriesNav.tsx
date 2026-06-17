"use client";

/**
 * TiendaCategoriesNav — barra secundaria con categorías de TIENDAS
 * (no de productos): bodega, restaurante, farmacia, ferretería, polleria,
 * panadería, licorería, tecnología.
 *
 * Diseño: chips cuadrados (no pills) con icono visible + label legible.
 * Click en un chip filtra la página /tiendas via query param ?categoria=X
 * y dispara CustomEvent("buleje:filter-tiendas") por si la página quiere
 * reaccionar sin reload.
 *
 * Mobile: scroll horizontal con snap. Desktop: grid 8 cols.
 *
 * NOTA: los iconos son placeholder hasta que se suban imágenes reales —
 * el comentario "// IMG" marca dónde reemplazar.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  ShoppingBag,
  ChefHat,
  Pill,
  Wrench,
  Drumstick,
  Croissant,
  Wine,
  Smartphone,
  X,
} from "lucide-react";

interface CategoryDef {
  id: string;
  label: string;
  /** Icono temporal — luego reemplazar por imagen del bucket */
  icon: React.ElementType;
  /** Color de tinte para el icono */
  tone: string;
  /** Imagen URL futura (TODO: subir a R2/S3 + reemplazar Icon en el render) */
  imageUrl?: string;
}

const CATEGORIES: CategoryDef[] = [
  { id: "bodega", label: "Bodegas", icon: ShoppingBag, tone: "var(--accent)" },
  { id: "restaurante", label: "Restaurantes", icon: ChefHat, tone: "#ff6b5b" },
  { id: "polleria", label: "Pollerías", icon: Drumstick, tone: "#F43F5E" },
  { id: "panaderia", label: "Panaderías", icon: Croissant, tone: "#EAB308" },
  { id: "farmacia", label: "Farmacias", icon: Pill, tone: "#0EA5E9" },
  { id: "ferreteria", label: "Ferreterías", icon: Wrench, tone: "#8B5CF6" },
  { id: "licoreria", label: "Licorerías", icon: Wine, tone: "#A855F7" },
  { id: "tecnologia", label: "Tecnología", icon: Smartphone, tone: "#10B981" },
];

export default function TiendaCategoriesNav() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState<string | null>(null);

  // Sync con ?categoria= del URL al mount + en cada cambio de query.
  useEffect(() => {
    setActive(searchParams.get("cat"));
  }, [searchParams]);

  const handleClick = useCallback(
    (catId: string) => {
      const isActive = active === catId;
      const next = isActive ? null : catId;
      setActive(next);

      // Update URL — toggle el filtro
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set("cat", next);
      else params.delete("cat");

      // Si no estamos en /tiendas, navegamos. Sino, replace para no perder scroll.
      if (pathname?.startsWith("/tiendas")) {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      } else {
        router.push(`/tiendas?${params.toString()}`);
      }

      // Notify components on the same page
      window.dispatchEvent(
        new CustomEvent("buleje:filter-tiendas", { detail: { cat: next } }),
      );
    },
    [active, pathname, router, searchParams],
  );

  const handleClear = useCallback(() => {
    setActive(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("cat");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    window.dispatchEvent(
      new CustomEvent("buleje:filter-tiendas", { detail: { cat: null } }),
    );
  }, [pathname, router, searchParams]);

  return (
    <nav
      aria-label="Filtrar tiendas por categoría"
      className="sticky top-16 z-30 border-b border-[var(--rule-base)] bg-[var(--surface-canvas)]/95 backdrop-blur-md"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3">
        {/* Header: título + clear filter */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            ¿Qué tipo de tienda buscás?
          </p>
          {active && (
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
            >
              <X className="h-3 w-3" /> Quitar filtro
            </button>
          )}
        </div>

        {/* Chips: scroll horizontal en mobile, grid 8 en desktop */}
        <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory sm:grid sm:grid-cols-4 lg:grid-cols-8 sm:overflow-visible">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const isActive = active === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => handleClick(c.id)}
                aria-pressed={isActive}
                className={[
                  "snap-start shrink-0 sm:shrink",
                  // Tamaño cuadrado para el chip
                  "w-[112px] sm:w-full aspect-square sm:aspect-square",
                  "flex flex-col items-center justify-center gap-2 rounded-2xl border-2 transition-all p-3",
                  isActive
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-md scale-[1.02]"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/40 hover:-translate-y-0.5 hover:shadow-md",
                ].join(" ")}
              >
                {/* IMG: cuando se suban imágenes, reemplazar este wrapper por <Image src={c.imageUrl} ... /> */}
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-xl shrink-0"
                  style={{
                    backgroundColor: isActive ? c.tone : `${c.tone}1f`,
                    color: isActive ? "white" : c.tone,
                  }}
                  aria-hidden
                >
                  <Icon className="h-6 w-6" strokeWidth={2} />
                </div>
                <span
                  className={[
                    "text-sm font-bold text-center leading-tight",
                    isActive ? "text-[var(--accent)]" : "text-[var(--text-primary)]",
                  ].join(" ")}
                >
                  {c.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
