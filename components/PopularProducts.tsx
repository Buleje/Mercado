"use client";

import { useMemo, useRef, useCallback } from "react";
import Image from "next/image";
import { ShoppingCart, TrendingUp, Minus, Plus, Package } from "@buleje/design-system/icons";
import { ProductBadge, ProductPrice, type ProductBadgeIntent } from "@buleje/design-system";
import { useCart } from "@/contexts/cart-context";
import { useQuickAddSafe } from "@/contexts/quick-add-context";
import { useInView } from "@/hooks/use-in-view";
import { useStoreProducts } from "@/hooks/use-store-products";
import SectionPlaceholder from "@/components/SectionPlaceholder";
import SmartProductImage from "@/components/store/SmartProductImage";
import type { Product } from "@/data/products";

// Tiny 4×4 gray placeholder for blur-up effect while images load
const BLUR_DATA_URL = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNCIgaGVpZ2h0PSI0IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNlNWU3ZWIiLz48L3N2Zz4=";

// Map string badges del backend → intent canónico del DS.
const BADGE_INTENT: Record<string, ProductBadgeIntent> = {
  Popular: "popular",
  Oferta: "offer",
  Fresco: "fresh",
  Nuevo: "new",
  Premium: "premium",
};

/* Simulate popularity order: products with badge "Popular" first, then "Oferta", rest shuffled deterministically */
function getPopularProducts(allProducts: Product[]) {
  const scored = allProducts
    .filter((p) => !(p.stock != null && p.stock <= 0))
    .map((p) => {
      let score = 0;
      if (p.badge === "Popular") score += 30;
      if (p.badge === "Oferta") score += 20;
      if (p.badge === "Fresco") score += 10;
      // deterministic hash for stable order
      score += ((p.id * 7 + 3) % 10);
      return { ...p, score };
    });
  return scored.sort((a, b) => b.score - a.score).slice(0, 6);
}

export default function PopularProducts({ serverProducts, showEmpty = false, emptyVariant = "admin", strictAdminOnly = false }: { serverProducts?: Product[]; showEmpty?: boolean; emptyVariant?: "admin" | "public"; strictAdminOnly?: boolean }) {
  const { addItem, items, updateQty } = useCart();
  const quickAdd = useQuickAddSafe();
  const [ref, inView] = useInView({ threshold: 0.1 });
  const hook = useStoreProducts();
  const products = serverProducts && serverProducts.length > 0 ? serverProducts : hook.products;
  const isLoading = serverProducts ? false : hook.isLoading;
  // En modo estricto NO mostramos productos hasta que el admin los marque
  // explícitamente desde "Mi Tienda Personal → Productos destacados". Los
  // badges del seed/fixture no cuentan como asignación admin (todos los
  // productos los tienen y eso confunde al dueño).
  const popular = useMemo(() => {
    if (strictAdminOnly) return [];
    return getPopularProducts(products);
  }, [products, strictAdminOnly]);
  const lastClickRef = useRef(0);
  const guardedAdd = useCallback((p: Product) => {
    const now = Date.now();
    if (now - lastClickRef.current < 300) return;
    lastClickRef.current = now;
    // En tienda individual abrimos el modal — fallback a addItem directo
    // si no hay QuickAddProvider montado (e.g. flujos del marketplace).
    if (quickAdd) {
      quickAdd.openQuickAdd(p);
    } else {
      addItem(p);
    }
  }, [addItem, quickAdd]);

  // Show skeleton only while loading, hide section if no products after load
  if (isLoading) return <SectionPlaceholder title="Mas Vendidos" hint="Cargando..." cols={6} />;
  if (popular.length === 0) return showEmpty ? <SectionPlaceholder title="Mas Vendidos" hint="Los productos populares apareceran aqui automaticamente" cols={6} variant={emptyVariant} publicTitle="Mas vendidos" /> : null;

  return (
    <section ref={ref} className="py-14 sm:py-20 bg-surface">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className={`text-center mb-10 sm:mb-12 transition-all duration-[var(--dur-slower)] ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <span className="inline-flex items-center gap-1.5 bg-primary/8 text-[var(--accent-ink)] dark:text-[var(--accent)] text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full mb-4">
            <TrendingUp className="w-3.5 h-3.5" />
            Esta semana
          </span>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[var(--text-primary)]">
            Más{" "}
            <span className="relative inline-block text-primary">
              vendidos
              <svg className="absolute -bottom-1.5 left-0 w-full h-2.5" viewBox="0 0 100 10" preserveAspectRatio="none">
                <path d="M2 8 Q30 2 60 6 Q90 10 98 3" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
              </svg>
            </span>
            {" "}de la semana
          </h2>
          <p className="text-muted mt-2 text-sm sm:text-base">Los favoritos de nuestros clientes</p>
        </div>

        {/* MK-10: Grid 3x2 desktop, 2x3 mobile */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5">
          {popular.map((product, i) => {
            const cartItem = items.find((ci) => ci.id === product.id);
            const qty = cartItem?.quantity ?? 0;
            const isOutOfStock = product.stock != null && product.stock <= 0;
            const badgeIntent = product.badge ? BADGE_INTENT[product.badge] : undefined;

            return (
              <div
                key={product.id}
                className={`group relative bg-[var(--surface-raised)] rounded-2xl shadow-[var(--shadow-sm)] overflow-hidden hover:shadow-[var(--shadow-xl)] hover:-translate-y-1 transition-all duration-[var(--dur-base)] ${
                  inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}
                style={{ transitionDelay: inView ? `${i * 80}ms` : "0ms" }}
              >
                {/* Rank badge — uniforme accent-soft para todos los top 6 */}
                <div className="absolute top-2.5 left-2.5 z-10 rounded-full w-6 h-6 flex items-center justify-center text-[length:var(--ts-2xs)] font-bold bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
                  #{i + 1}
                </div>

                {/* Image — SmartProductImage cae al placeholder estándar
                    cuando src es nulo o la URL falla (404/CORS). */}
                <div className="relative aspect-square bg-[var(--surface-sunken)] overflow-hidden">
                  <SmartProductImage
                    src={product.image}
                    alt={product.name}
                    fill
                    sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 16vw"
                    className="object-cover group-hover:scale-108 transition-transform duration-[var(--dur-slow)]"
                    placeholder="blur"
                    blurDataURL={BLUR_DATA_URL}
                    placeholderSize={28}
                    {...(i < 2 ? { priority: true } : { loading: "lazy" as const })}
                  />
                  {/* Badge unificado via DS — bottom right to avoid overlap with rank */}
                  {badgeIntent && (
                    <div className="absolute bottom-2 right-2">
                      <ProductBadge intent={badgeIntent}>{product.badge}</ProductBadge>
                    </div>
                  )}
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-[var(--dur-base)]" />
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="text-sm sm:text-base font-semibold text-[var(--text-primary)] line-clamp-2 leading-tight mb-2.5">
                    {product.name}
                  </h3>
                  <div className="flex items-center justify-between gap-1">
                    <ProductPrice price={product.price} unit={product.unit} size="md" />
                    {isOutOfStock ? (
                      <span className="text-[length:var(--ts-2xs)] font-bold text-gray-400 border border-gray-200 rounded-full px-2 py-1">Agotado</span>
                    ) : qty > 0 ? (
                      <div className="flex items-center gap-0.5 bg-primary rounded-full px-1 py-1 shrink-0 sm:px-1.5">
                        <button onClick={() => updateQty(product.id, qty - 1)} className="h-6 w-6 sm:h-7 sm:w-7 flex items-center justify-center rounded-full text-white hover:bg-white/20 transition-colors" aria-label="Disminuir">
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="text-white font-extrabold text-xs sm:text-sm min-w-4 sm:min-w-5 text-center">{qty}</span>
                        <button onClick={() => updateQty(product.id, qty + 1)} className="h-6 w-6 sm:h-7 sm:w-7 flex items-center justify-center rounded-full text-white hover:bg-white/20 transition-colors" aria-label="Aumentar">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => guardedAdd(product)}
                        className="bg-primary text-white rounded-full p-3 hover:bg-primary-dark active:scale-90 transition-all shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]"
                        aria-label={`Agregar ${product.name}`}
                      >
                        <ShoppingCart className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
