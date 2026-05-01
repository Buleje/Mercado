"use client";

/**
 * TiendasMainCategoriesGrid — Carrusel horizontal de categorías principales
 * con diseño propio Buleje. Sin colores pastel genéricos, sin iconos:
 * solo imagen (subida desde superadmin) + nombre. Una sola fila scrollable.
 *
 * Mientras no haya imagen, muestra un placeholder elegante con la inicial
 * sobre fondo neutro brand.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  ChefHat,
  ShoppingBag,
  Apple,
  Pill,
  Wrench,
  Drumstick,
  Croissant,
  Wine,
  Beef,
  Store as StoreIcon,
  Smartphone,
  type LucideIcon,
} from "lucide-react";

interface MainCategory {
  id: string;
  label: string;
  imageUrl: string | null;
}

const DEFAULT_CATEGORIES: MainCategory[] = [
  { id: "restaurante", label: "Restaurantes", imageUrl: null },
  { id: "bodega", label: "Bodegas", imageUrl: null },
  { id: "fruteria", label: "Mercado", imageUrl: null },
  { id: "farmacia", label: "Farmacias", imageUrl: null },
  { id: "ferreteria", label: "Ferreterías", imageUrl: null },
  { id: "polleria", label: "Pollerías", imageUrl: null },
  { id: "panaderia", label: "Panaderías", imageUrl: null },
  { id: "licoreria", label: "Licorerías", imageUrl: null },
  { id: "carniceria", label: "Carnicerías", imageUrl: null },
  { id: "minimarket", label: "Minimarkets", imageUrl: null },
  { id: "tecnologia", label: "Tecnología", imageUrl: null },
];

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  restaurante: ChefHat,
  bodega: ShoppingBag,
  fruteria: Apple,
  farmacia: Pill,
  ferreteria: Wrench,
  polleria: Drumstick,
  panaderia: Croissant,
  licoreria: Wine,
  carniceria: Beef,
  minimarket: StoreIcon,
  tecnologia: Smartphone,
};

interface TiendasMainCategoriesGridProps {
  selected: string;
  onSelect: (categoryId: string) => void;
  /** Tiendas reales del marketplace. Solo se muestran las categorías que
   *  tengan ≥1 tienda asociada — si no, ocultamos la categoría (y la sección
   *  entera si no queda ninguna). Evita filtros muertos. */
  stores?: ReadonlyArray<{ category?: string | null }>;
}

export default function TiendasMainCategoriesGrid({
  selected,
  onSelect,
  stores = [],
}: TiendasMainCategoriesGridProps) {
  const [categories, setCategories] = useState<MainCategory[]>(DEFAULT_CATEGORIES);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/marketplace/categories", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        if (cancelled) return;
        const list = (json?.categories ?? []) as Array<{
          id: string;
          label: string;
          imageUrl: string | null;
        }>;
        if (list.length > 0) setCategories(list);
      })
      .catch(() => {
        // mantiene defaults
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [updateScrollState, categories.length]);

  const scrollBy = useCallback((delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  }, []);

  // ── Drag-to-scroll: permite arrastrar el carrusel con el mouse en
  //    desktop como si fuera un swipe táctil. UX más natural. ──
  const dragRef = useRef<{ startX: number; scrollLeft: number; isDown: boolean }>({
    startX: 0,
    scrollLeft: 0,
    isDown: false,
  });
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    dragRef.current.isDown = true;
    dragRef.current.startX = e.pageX - el.offsetLeft;
    dragRef.current.scrollLeft = el.scrollLeft;
    el.style.cursor = "grabbing";
    el.style.userSelect = "none";
  }, []);
  const onMouseLeaveUp = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    dragRef.current.isDown = false;
    el.style.cursor = "grab";
    el.style.removeProperty("user-select");
  }, []);
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el || !dragRef.current.isDown) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = (x - dragRef.current.startX) * 1.4;
    el.scrollLeft = dragRef.current.scrollLeft - walk;
  }, []);

  // ── Tracking de click por categoría: localStorage + endpoint stub.
  //    Permite a superadmin/analytics ver cuáles funcionan mejor. ──
  const trackClick = useCallback((categoryId: string) => {
    try {
      const key = "buleje:categoria-clicks";
      const raw = localStorage.getItem(key);
      const map: Record<string, number> = raw ? JSON.parse(raw) : {};
      map[categoryId] = (map[categoryId] ?? 0) + 1;
      localStorage.setItem(key, JSON.stringify(map));
    } catch {
      /* silent */
    }
    // Fire-and-forget al endpoint de analytics
    fetch("/api/marketplace/analytics/category-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId, ts: Date.now() }),
      keepalive: true,
    }).catch(() => {
      /* silent — fire and forget */
    });
  }, []);

  // Filtrar categorías a las que están vinculadas a ≥1 tienda real.
  // Si stores aún no cargó (length=0), mostramos todo para no parpadear.
  // Comparación case-insensitive (la DB puede tener "Bodega" / "bodega").
  const visibleCategories = (() => {
    if (stores.length === 0) return categories;
    const used = new Set(
      stores
        .map((s) => (s.category ?? "").toString().trim().toLowerCase())
        .filter(Boolean),
    );
    return categories.filter((c) => used.has(c.id.toLowerCase()));
  })();

  // Si no hay categorías con tiendas, ocultamos la sección entera —
  // un filtro vacío es ruido visual sin acción posible.
  if (visibleCategories.length === 0) return null;

  return (
    <section className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-6 mb-5 sm:mb-6">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-2">
            <span
              aria-hidden
              className="inline-block h-[3px] w-8 rounded-full bg-[var(--accent)]"
            />
            Categorías
          </p>
          <h2 className="text-2xl sm:text-3xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-[1.05]">
            ¿Qué necesitás hoy?
          </h2>
        </div>
        {selected !== "todos" && (
          <button
            type="button"
            onClick={() => onSelect("todos")}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 h-10 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
          >
            Ver todas
          </button>
        )}
      </div>

      <div className="relative">
        {/* Flechas desktop — visibles solo si hay overflow scrollable */}
        <button
          type="button"
          onClick={() => scrollBy(-480)}
          aria-label="Desplazar categorías a la izquierda"
          disabled={!canScrollLeft}
          className={[
            "hidden sm:inline-flex absolute left-0 top-1/2 -translate-y-1/2 z-10",
            "h-9 w-9 items-center justify-center rounded-full",
            "bg-white/90 backdrop-blur shadow-sm border border-[var(--rule-base)]",
            "text-[var(--text-primary)] hover:bg-white transition-all",
            canScrollLeft
              ? "opacity-100"
              : "opacity-0 pointer-events-none",
          ].join(" ")}
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
        </button>
        <button
          type="button"
          onClick={() => scrollBy(480)}
          aria-label="Desplazar categorías a la derecha"
          disabled={!canScrollRight}
          className={[
            "hidden sm:inline-flex absolute right-0 top-1/2 -translate-y-1/2 z-10",
            "h-9 w-9 items-center justify-center rounded-full",
            "bg-white/90 backdrop-blur shadow-sm border border-[var(--rule-base)]",
            "text-[var(--text-primary)] hover:bg-white transition-all",
            canScrollRight
              ? "opacity-100"
              : "opacity-0 pointer-events-none",
          ].join(" ")}
        >
          <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
        </button>

      <div
        ref={scrollRef}
        role="group"
        aria-label="Categorías principales"
        onMouseDown={onMouseDown}
        onMouseLeave={onMouseLeaveUp}
        onMouseUp={onMouseLeaveUp}
        onMouseMove={onMouseMove}
        className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2 -mx-1 px-1 scroll-smooth cursor-grab"
      >
        {visibleCategories.map((c) => {
          const isActive = selected === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                trackClick(c.id);
                onSelect(isActive ? "todos" : c.id);
              }}
              aria-pressed={isActive}
              className={[
                "snap-start group shrink-0",
                "w-[148px] sm:w-[160px] flex flex-col gap-2",
                "rounded-2xl overflow-hidden border-2 transition-all p-2",
                isActive
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-md"
                  : "border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--accent)]/50 hover:-translate-y-0.5 hover:shadow-md",
              ].join(" ")}
            >
              {/* Imagen — slot principal */}
              <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-[var(--surface-sunken)] grid place-items-center">
                {c.imageUrl ? (
                  <Image
                    src={c.imageUrl}
                    alt={c.label}
                    fill
                    sizes="(min-width: 640px) 160px, 148px"
                    className="object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <CategoryPlaceholder
                    icon={CATEGORY_ICONS[c.id]}
                    active={isActive}
                  />
                )}
              </div>

              {/* Solo el nombre, centrado, tipografía marca */}
              <p
                className={[
                  "text-sm font-black text-center tracking-tight leading-tight px-1 pb-1",
                  isActive ? "text-[var(--accent)]" : "text-[var(--text-primary)]",
                ].join(" ")}
              >
                {c.label}
              </p>
            </button>
          );
        })}
      </div>
      </div>
    </section>
  );
}

/**
 * Placeholder elegante: gradient marca + icono Buleje. Se reemplaza
 * automáticamente cuando se sube imagen desde superadmin.
 */
function CategoryPlaceholder({
  icon,
  active,
}: {
  icon?: LucideIcon;
  active: boolean;
}) {
  const Icon = icon ?? StoreIcon;
  return (
    <div
      className={[
        "absolute inset-0 flex items-center justify-center",
        "bg-linear-to-br from-[var(--surface-raised)] via-[var(--surface-sunken)] to-[var(--surface-raised)]",
      ].join(" ")}
    >
      <div
        className={[
          "h-14 w-14 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110",
          active
            ? "bg-[var(--accent)] text-white shadow-md"
            : "bg-[var(--surface-canvas)] text-[var(--text-secondary)] border border-[var(--rule-base)]",
        ].join(" ")}
      >
        <Icon className="h-7 w-7" strokeWidth={1.75} aria-hidden />
      </div>
    </div>
  );
}
