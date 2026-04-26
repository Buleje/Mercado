"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { ChevronLeft, ChevronRight, Tag, ArrowRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useStoreProducts } from "@/hooks/use-store-products";
import SectionPlaceholder from "@/components/SectionPlaceholder";

interface Promo {
  title: string;
  subtitle: string;
  cta: string;
  category: string;
}

const PROMO_COPY: Record<string, { subtitle: string }> = {
  "frutas-verduras": { subtitle: "Las mas frescas de la selva directo a tu mesa" },
  "carnes":          { subtitle: "Cortes selectos al mejor precio de la zona" },
  "limpieza":        { subtitle: "Todo para tu hogar con hasta 15% de ahorro" },
  "lacteos":         { subtitle: "Leche, yogurt y quesos siempre frescos" },
  "abarrotes":       { subtitle: "Arroz, fideos, aceite y todo lo esencial" },
  "bebidas":         { subtitle: "Gaseosas, jugos, agua y mas para refrescarte" },
  "promociones":     { subtitle: "Combos y ofertas seleccionadas para esta semana" },
  "pollo-brasa":     { subtitle: "Pollo a la brasa fresco con cremas y guarnicion" },
  "broaster":        { subtitle: "Pollo broaster crocante recien hecho" },
  "salchipapa":      { subtitle: "Papas y salchichas con cremas a eleccion" },
  "guarniciones":    { subtitle: "Acompanamientos para complementar tu pedido" },
  "postres":         { subtitle: "Helados y dulces para cerrar bien el dia" },
};

function humanizeCategory(id: string): string {
  return id.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

const INTERVAL = 5000;

// Canonical teal wash — identidad Buleje (ADR-075)
const TEAL_WASH =
  "linear-gradient(135deg, color-mix(in oklch, var(--accent) 10%, var(--surface-canvas)), color-mix(in oklch, var(--accent) 4%, var(--surface-canvas)))";

export default function SeasonalPromo({ serverProducts, showEmpty = false, emptyVariant = "admin" }: { serverProducts?: import("@/data/products").Product[]; showEmpty?: boolean; emptyVariant?: "admin" | "public" }) {
  const ref = useRef<HTMLElement>(null);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const hook = useStoreProducts();
  const products = serverProducts && serverProducts.length > 0 ? serverProducts : hook.products;
  const isLoading = serverProducts ? false : hook.isLoading;

  // Build promos dynamically from real categories that have at least 1 product
  const PROMOS = useMemo<Promo[]>(() => {
    if (products.length === 0) return [];
    const activeCats: string[] = [];
    const seen = new Set<string>();
    for (const p of products) {
      const cat = (p.category || "").toLowerCase().replace(/\s+/g, "-");
      if (!cat || seen.has(cat)) continue;
      seen.add(cat);
      activeCats.push(cat);
    }
    return activeCats.map(cat => {
      const label = humanizeCategory(cat);
      const copy = PROMO_COPY[cat];
      return {
        title: label,
        subtitle: copy?.subtitle ?? `Lo mejor de ${label.toLowerCase()} listo para tu pedido`,
        cta: `Ver ${label}`,
        category: cat,
      };
    });
  }, [products]);

  const next = useCallback(() => setIdx((i) => PROMOS.length > 0 ? (i + 1) % PROMOS.length : 0), [PROMOS.length]);
  const prev = useCallback(() => setIdx((i) => PROMOS.length > 0 ? (i - 1 + PROMOS.length) % PROMOS.length : 0), [PROMOS.length]);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(next, INTERVAL);
    return () => clearInterval(t);
  }, [paused, next]);

  if (isLoading) return <SectionPlaceholder title="Promo de Temporada" hint="Cargando..." cols={6} />;
  if (PROMOS.length === 0) return showEmpty ? <SectionPlaceholder title="Promo de Temporada" hint="Las promos se activan segun tus categorias de productos" cols={6} variant={emptyVariant} publicTitle="Promociones de temporada" /> : null;

  // Clamp idx to valid range
  const safeIdx = idx % PROMOS.length;
  const promo = PROMOS[safeIdx];

  const handleCta = () => {
    const el = document.getElementById("productos");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("buleje:selectCategory", { detail: promo.category })
        );
      }, 400);
    }
  };

  return (
    <section
      ref={ref}
      className="relative overflow-hidden py-6 sm:py-10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Canonical teal wash — identidad Buleje */}
      <div
        className="absolute inset-0 transition-opacity duration-700 border-y border-[var(--rule-soft)]"
        style={{ background: TEAL_WASH }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center gap-4">
        {/* left arrow */}
        <button
          onClick={prev}
          aria-label="Anterior promoción"
          className="hidden sm:flex shrink-0 w-10 h-10 items-center justify-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* content */}
        <div className="flex-1 flex flex-col sm:flex-row items-center gap-4 sm:gap-8 text-center sm:text-left">
          <span className="hidden sm:inline-flex shrink-0 h-12 w-12 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--accent)_15%,var(--surface-canvas))] text-[var(--accent)]" aria-hidden="true">
            <Tag className="w-5 h-5" />
          </span>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-center sm:justify-start gap-2 mb-1.5">
              <Tag className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
                Oferta de Temporada
              </span>
            </div>
            <h3 className="text-fs-h2 font-semibold leading-tight text-[var(--text-primary)]">
              {promo.title}
            </h3>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {promo.subtitle}
            </p>
          </div>

          <button
            onClick={handleCta}
            className={cn(
              "shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium",
              "bg-[var(--accent)] text-white hover:bg-[var(--accent-600)] transition-colors"
            )}
          >
            {promo.cta}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* right arrow */}
        <button
          onClick={next}
          aria-label="Siguiente promoción"
          className="hidden sm:flex shrink-0 w-10 h-10 items-center justify-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* dots */}
      <div className="relative flex justify-center gap-2 mt-6">
        {PROMOS.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            aria-label={`Promoción ${i + 1}`}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              i === safeIdx ? "w-6 bg-[var(--accent)]" : "w-1.5 bg-[var(--rule-base)] hover:bg-[var(--text-tertiary)]"
            )}
          />
        ))}
      </div>
    </section>
  );
}
