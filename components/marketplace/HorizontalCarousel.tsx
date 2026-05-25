"use client";

/**
 * HorizontalCarousel — carrusel scrollable horizontal con drag-mouse,
 * snap-x y barra de progreso minimalista.
 *
 * Reemplaza el patron viejo `<div className={MARKETPLACE_CAROUSEL}>` con un
 * componente que ademas:
 *   - Soporta drag con mouse (no solo touch / scroll wheel).
 *   - Renderiza una barra mini de progreso visible en el bottom (no scrollbar
 *     nativo, customizada con accent token).
 *   - Renderiza botones nav <- y -> en hover desktop (md+).
 *   - Mantiene snap-x mandatory + scroll-padding para que cada card encaje.
 *
 * Estilo Holded/Buleje: minimalista, accent token único, sin sombras fuertes.
 *
 * Uso:
 * ```tsx
 * <HorizontalCarousel ariaLabel="Top más vendidos">
 *   {items.map((p) => <ProductCard key={p.id} ... />)}
 * </HorizontalCarousel>
 * ```
 *
 * Cada child recibe `data-carousel-item` para que la barra calcule el conteo.
 * No necesitas envolver children en `w-[XXX]` — el componente fija ancho
 * estandar via prop `itemWidthClass`.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export type HorizontalCarouselProps = {
  children: ReactNode;
  /** A11y label (no visible). */
  ariaLabel?: string;
  /** Clase Tailwind para el ancho de cada item (default: w-[220px] sm:w-[240px]). */
  itemWidthClass?: string;
  /** Mostrar barrita de progreso. Default false (estilo Amazon: solo nav). */
  showBar?: boolean;
  /** Mostrar botones nav < > en desktop. Default true. */
  showNav?: boolean;
  /** Clase extra para el container externo. */
  className?: string;
};

// Mobile: 42vw → ~2.2 cards visibles en 390px (el corte parcial de la 3ra
// invita a scrollear). Antes 220px fijo cortaba el card horizontal adentro.
// Desde sm vuelve a ancho fijo cómodo para card vertical compacto.
const DEFAULT_ITEM_W = "w-[42vw] sm:w-[210px] lg:w-[230px] shrink-0 snap-start";

export default function HorizontalCarousel({
  children,
  ariaLabel,
  itemWidthClass = DEFAULT_ITEM_W,
  showBar = false,
  showNav = true,
  className,
}: HorizontalCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0); // 0..100 — left % de la barra
  const [thumbWidth, setThumbWidth] = useState(100); // ancho % del thumb
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Estado mutable para drag (sin re-render por movimiento)
  const dragRef = useRef({ startX: 0, scrollStart: 0, hasMoved: false });

  const updateBar = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 0) {
      setThumbWidth(100);
      setProgress(0);
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const ratio = el.clientWidth / el.scrollWidth;
    const tw = Math.max(15, Math.min(100, ratio * 100));
    const left = (el.scrollLeft / max) * (100 - tw);
    setThumbWidth(tw);
    setProgress(left);
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < max - 4);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateBar();
    el.addEventListener("scroll", updateBar, { passive: true });
    const ro = new ResizeObserver(updateBar);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateBar);
      ro.disconnect();
    };
  }, [updateBar]);

  // ── Drag con pointer events (mouse + touch + stylus unificado) ──
  const pointerIdRef = useRef<number | null>(null);
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const el = scrollerRef.current;
    if (!el) return;
    // No interfere con links/botones — solo drag si comienza en el container puro
    const target = e.target as HTMLElement;
    if (target.closest("a, button, input, textarea, select, [data-no-drag]")) return;
    // Solo mouse primary o touch/pen
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointerIdRef.current = e.pointerId;
    dragRef.current = {
      startX: e.clientX,
      scrollStart: el.scrollLeft,
      hasMoved: false,
    };
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    const el = scrollerRef.current;
    if (!el) return;
    const onMove = (ev: PointerEvent) => {
      if (pointerIdRef.current !== null && ev.pointerId !== pointerIdRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      if (Math.abs(dx) > 4) dragRef.current.hasMoved = true;
      el.scrollLeft = dragRef.current.scrollStart - dx;
      if (dragRef.current.hasMoved) ev.preventDefault();
    };
    const onUp = () => {
      pointerIdRef.current = null;
      setIsDragging(false);
    };
    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, [isDragging]);

  // Si dragueamos, prevenir click accidental al final del drag
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (dragRef.current.hasMoved) {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current.hasMoved = false;
    }
  }, []);

  // Botones nav: scroll por ~80% del viewport
  const scrollBy = useCallback((dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  }, []);

  // Wrap children: cada uno recibe className del item width
  // (si el child ya tiene className, se preservan ambas via cn)
  const wrappedChildren = Array.isArray(children) ? children : [children];

  return (
    <div className={cn("relative group/carousel", className)}>
      <div
        ref={scrollerRef}
        role="region"
        aria-label={ariaLabel}
        aria-roledescription="carousel"
        onPointerDown={onPointerDown}
        onClickCapture={onClickCapture}
        style={{ touchAction: "pan-y", scrollbarWidth: "none", msOverflowStyle: "none" }}
        className={cn(
          "flex gap-3 overflow-x-auto no-scrollbar snap-x",
          "scroll-px-4 pb-0 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8",
          "[&::-webkit-scrollbar]:hidden",
          isDragging ? "cursor-grabbing select-none" : "cursor-grab",
        )}
      >
        {wrappedChildren.map((child, i) => (
          <div key={i} data-carousel-item className={itemWidthClass}>
            {child}
          </div>
        ))}
      </div>

      {/* ── Botones nav (desktop, siempre visibles cuando hay scroll) ── */}
      {showNav && (
        <>
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            aria-label="Anterior"
            disabled={!canScrollLeft}
            className={cn(
              "hidden md:inline-flex items-center justify-center",
              "absolute -left-2 lg:-left-3 top-[calc(50%-0.75rem)] -translate-y-1/2 z-20",
              "h-11 w-11 rounded-full",
              "bg-[var(--surface-raised)] border border-[var(--rule-base)]",
              "text-[var(--text-primary)] hover:text-[var(--accent)]",
              "hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:scale-110",
              "shadow-[0_6px_16px_-4px_rgba(0,0,0,0.15)] hover:shadow-[0_10px_24px_-4px_rgba(0,0,0,0.20)]",
              "transition-all duration-200 ease-out",
              "active:scale-95",
              "disabled:opacity-0 disabled:pointer-events-none",
              "motion-reduce:transition-none motion-reduce:hover:scale-100",
            )}
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2.5} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            aria-label="Siguiente"
            disabled={!canScrollRight}
            className={cn(
              "hidden md:inline-flex items-center justify-center",
              "absolute -right-2 lg:-right-3 top-[calc(50%-0.75rem)] -translate-y-1/2 z-20",
              "h-11 w-11 rounded-full",
              "bg-[var(--surface-raised)] border border-[var(--rule-base)]",
              "text-[var(--text-primary)] hover:text-[var(--accent)]",
              "hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:scale-110",
              "shadow-[0_6px_16px_-4px_rgba(0,0,0,0.15)] hover:shadow-[0_10px_24px_-4px_rgba(0,0,0,0.20)]",
              "transition-all duration-200 ease-out",
              "active:scale-95",
              "disabled:opacity-0 disabled:pointer-events-none",
              "motion-reduce:transition-none motion-reduce:hover:scale-100",
            )}
          >
            <ChevronRight className="h-5 w-5" strokeWidth={2.5} aria-hidden />
          </button>
        </>
      )}

      {/* ── Barra de progreso opcional (off por default) ── */}
      {showBar && (
        <div
          className="mt-2 h-1 rounded-full bg-[var(--rule-soft)] overflow-hidden mx-1"
          aria-hidden
        >
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-[transform,width] duration-150"
            style={{
              width: `${thumbWidth}%`,
              transform: `translateX(${(progress / Math.max(1, 100 - thumbWidth)) * (100 - thumbWidth)}%)`,
            }}
          />
        </div>
      )}
    </div>
  );
}
