"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tag, ArrowRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useStoreProducts } from "@/hooks/use-store-products";
import { useSettings } from "@/contexts/settings-context";
import SectionPlaceholder from "@/components/SectionPlaceholder";

interface Promo {
  title: string;
  subtitle: string;
  cta: string;
  category: string;
  image?: string;
  productSlug?: string;
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
  const { storeTheme } = useSettings();
  const pathname = usePathname();
  const products = serverProducts && serverProducts.length > 0 ? serverProducts : hook.products;
  const isLoading = serverProducts ? false : hook.isLoading;

  // Detectar prefijo tenant para construir links de productos
  const tenantPrefix = useMemo(() => {
    const match = pathname?.match(/^(\/t\/[^/]+)/);
    return match ? match[1] : "";
  }, [pathname]);

  // Banners customizados desde el admin
  const customBanners = (storeTheme as { categoryBanners?: Record<string, {
    image?: string;
    title?: string;
    subtitle?: string;
    ctaText?: string;
    productSlug?: string;
    enabled?: boolean;
  }> } | null)?.categoryBanners ?? {};

  // Build promos dynamically — prioriza banners customizados con imagen+enabled,
  // resto cae a las promos automáticas con teal wash y copy genérico.
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
      const custom = customBanners[cat];
      const isCustomEnabled = custom?.enabled !== false;
      return {
        title: (isCustomEnabled && custom?.title) || label,
        subtitle: (isCustomEnabled && custom?.subtitle) || copy?.subtitle || `Lo mejor de ${label.toLowerCase()} listo para tu pedido`,
        cta: (isCustomEnabled && custom?.ctaText) || `Ver ${label}`,
        category: cat,
        image: isCustomEnabled ? custom?.image : undefined,
        productSlug: isCustomEnabled ? custom?.productSlug : undefined,
      };
    });
  }, [products, customBanners]);

  const next = useCallback(() => setIdx((i) => PROMOS.length > 0 ? (i + 1) % PROMOS.length : 0), [PROMOS.length]);

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

  // Click handler: si el promo tiene productSlug, navega al producto; sino filtra categoría
  const handleCta = () => {
    if (promo.productSlug) return; // El Link maneja la navegación
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

  const ctaHref = promo.productSlug
    ? `${tenantPrefix}/tienda/${promo.productSlug}`
    : undefined;

  // MK-10: 2-col asimétrico — 1 grande (promo activa) + hasta 2 secundarias
  const secondaryPromos = PROMOS.filter((_, i) => i !== safeIdx).slice(0, 2);

  // Si el promo activo tiene imagen custom, usamos layout banner con foto.
  // Sino usamos el wash teal clásico.
  const hasImage = !!promo.image;

  return (
    <section
      ref={ref}
      className="relative overflow-hidden py-10 sm:py-16"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Wash teal solo cuando NO hay imagen custom */}
      {!hasImage && (
        <div
          className="absolute inset-0 transition-opacity duration-[var(--dur-slower)] border-y border-[var(--rule-soft)]"
          style={{ background: TEAL_WASH }}
        />
      )}

      <div className="relative mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
        {/* Header de sección con presencia */}
        <div className="text-center mb-8 sm:mb-10">
          <p className="text-[length:var(--ts-2xs)] sm:text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
            Esta semana
          </p>
          <h2 className="mt-2 text-3xl sm:text-4xl md:text-5xl font-extrabold text-[var(--text-primary)] tracking-tight">
            Ofertas que no te podés perder
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[var(--text-secondary)] max-w-xl mx-auto">
            Promociones rotativas en tus categorías favoritas — solo por tiempo limitado.
          </p>
        </div>

        {/* MK-10: 2-col layout — grande + 2 chicas */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
          {/* Promo principal — ocupa 2 columnas en desktop */}
          {hasImage ? (
            // ─── VARIANTE CON IMAGEN — banner inmersivo ───────────────
            <div className="sm:col-span-2 relative overflow-hidden rounded-3xl border border-[var(--rule-soft)] min-h-[300px] sm:min-h-[400px] group shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)]">
              <Image
                src={promo.image!}
                alt={promo.title}
                fill
                sizes="(max-width: 640px) 100vw, 66vw"
                className="object-cover transition-transform duration-[var(--dur-slower)] group-hover:scale-105"
                priority={safeIdx === 0}
                unoptimized={promo.image!.startsWith("data:")}
              />
              {/* Overlay degradado para legibilidad */}
              <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/15" />

              <div className="relative z-10 h-full flex flex-col justify-end px-7 sm:px-12 py-8 sm:py-10 max-w-2xl">
                <div className="inline-flex items-center gap-1.5 self-start mb-4 px-3.5 py-2 rounded-full bg-white/95 backdrop-blur-sm shadow-[var(--shadow-lg)]">
                  <Tag className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                    Oferta de Temporada
                  </span>
                </div>
                <h3 className="text-3xl sm:text-4xl md:text-5xl font-extrabold leading-[1.05] text-white tracking-tight">
                  {promo.title}
                </h3>
                <p className="text-base sm:text-lg text-white/90 mt-3 leading-relaxed max-w-lg">
                  {promo.subtitle}
                </p>
                {ctaHref ? (
                  <Link
                    href={ctaHref}
                    className="mt-6 self-start inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-white text-[var(--color-primary)] text-base font-extrabold shadow-[var(--shadow-xl)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)] hover:scale-[1.03] active:scale-[0.99] transition-all"
                  >
                    {promo.cta}
                    <ArrowRight className="w-5 h-5" />
                  </Link>
                ) : (
                  <button
                    onClick={handleCta}
                    className="mt-6 self-start inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-white text-[var(--color-primary)] text-base font-extrabold shadow-[var(--shadow-xl)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)] hover:scale-[1.03] active:scale-[0.99] transition-all"
                  >
                    {promo.cta}
                    <ArrowRight className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            // ─── VARIANTE WASH TEAL — fallback editorial con presencia ──────────────
            <div className="sm:col-span-2 relative flex flex-col sm:flex-row items-center gap-5 sm:gap-10 bg-gradient-to-br from-[color-mix(in_oklch,var(--surface-canvas)_85%,var(--color-primary)_15%)] to-[color-mix(in_oklch,var(--surface-canvas)_92%,var(--color-primary)_8%)] rounded-3xl border-2 border-[var(--color-primary)]/15 px-6 sm:px-10 py-8 sm:py-10 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.10)] min-h-[260px]">
              <span className="shrink-0 h-20 w-20 items-center justify-center rounded-2xl bg-[var(--color-primary)] text-white hidden sm:inline-flex shadow-[var(--shadow-xl)] shadow-[var(--color-primary)]/30" aria-hidden="true">
                <Tag className="w-9 h-9" strokeWidth={2} />
              </span>
              <div className="flex-1 min-w-0 text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-2 mb-3">
                  <Tag className="w-4 h-4 text-[var(--color-primary)] sm:hidden" />
                  <span className="text-[length:var(--ts-2xs)] sm:text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                    Oferta de Temporada
                  </span>
                </div>
                <h3 className="text-2xl sm:text-3xl md:text-4xl font-extrabold leading-tight text-[var(--text-primary)] tracking-tight">
                  {promo.title}
                </h3>
                <p className="text-base text-[var(--text-secondary)] mt-2.5 leading-relaxed max-w-md">{promo.subtitle}</p>
              </div>
              {ctaHref ? (
                <Link
                  href={ctaHref}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl text-base font-extrabold shadow-[var(--shadow-lg)]",
                    "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)] hover:shadow-[var(--shadow-xl)] hover:scale-[1.03] active:scale-[0.99] transition-all"
                  )}
                >
                  {promo.cta}
                  <ArrowRight className="w-5 h-5" />
                </Link>
              ) : (
                <button
                  onClick={handleCta}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl text-base font-extrabold shadow-[var(--shadow-lg)]",
                    "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)] hover:shadow-[var(--shadow-xl)] hover:scale-[1.03] active:scale-[0.99] transition-all"
                  )}
                >
                  {promo.cta}
                  <ArrowRight className="w-5 h-5" />
                </button>
              )}
            </div>
          )}

          {/* Promos secundarias */}
          <div className="flex sm:flex-col gap-3">
            {secondaryPromos.map((sp, i) => (
              <button
                key={sp.category}
                type="button"
                onClick={() => setIdx((safeIdx + 1 + i) % PROMOS.length)}
                className="group flex-1 sm:flex-none text-left bg-[var(--surface-raised)] rounded-2xl border-2 border-[var(--rule-soft)] hover:border-[var(--color-primary)]/40 hover:shadow-[var(--shadow-lg)] hover:-translate-y-0.5 px-5 py-5 transition-all sm:flex-1 relative overflow-hidden"
              >
                {/* Acento decorativo */}
                <span className="absolute top-0 right-0 h-16 w-16 rounded-full bg-[var(--color-primary)]/8 blur-2xl group-hover:bg-[var(--color-primary)]/15 transition-colors" aria-hidden="true" />

                <div className="relative">
                  <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-extrabold text-[var(--color-primary)] uppercase tracking-[0.15em] mb-2">
                    <Tag className="w-2.5 h-2.5" />
                    {sp.category.replace(/-/g, " ")}
                  </span>
                  <span className="text-base sm:text-lg font-bold text-[var(--text-primary)] leading-tight line-clamp-2 block">{sp.title}</span>
                  <span className="text-xs text-[var(--text-secondary)] line-clamp-2 mt-1.5 block leading-relaxed">{sp.subtitle}</span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--color-primary)] mt-3 group-hover:gap-2 transition-all">
                    Ver más
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Dots nav con número de promo activo */}
        <div className="flex flex-col items-center gap-2 mt-8">
          <div className="flex items-center gap-2.5">
            {PROMOS.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                aria-label={`Promoción ${i + 1}`}
                className={cn(
                  "h-2 rounded-full transition-all duration-[var(--dur-base)]",
                  i === safeIdx
                    ? "w-10 bg-[var(--color-primary)]"
                    : "w-2 bg-[var(--rule-base)] hover:bg-[var(--color-primary)]/40"
                )}
              />
            ))}
          </div>
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] tabular-nums">
            {safeIdx + 1} / {PROMOS.length}
          </p>
        </div>
      </div>
    </section>
  );
}
