"use client";

import { useMemo, useRef, useCallback } from "react";
import Image from "next/image";
import { ShoppingCart, TrendingUp, Minus, Plus, Package } from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { useInView } from "@/hooks/use-in-view";
import { useStoreProducts } from "@/hooks/use-store-products";
import SectionPlaceholder from "@/components/SectionPlaceholder";
import type { Product } from "@/data/products";

// Tiny 4×4 gray placeholder for blur-up effect while images load
const BLUR_DATA_URL = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNCIgaGVpZ2h0PSI0IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNlNWU3ZWIiLz48L3N2Zz4=";

const RANK_STYLES = [
  { bg: "bg-amber-400", text: "text-amber-950", ring: "ring-amber-400/40", label: "#1" },
  { bg: "bg-gray-300", text: "text-gray-800", ring: "ring-gray-300/40", label: "#2" },
  { bg: "bg-orange-400", text: "text-orange-950", ring: "ring-orange-400/40", label: "#3" },
];

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

export default function PopularProducts({ serverProducts }: { serverProducts?: Product[] }) {
  const { addItem, items, updateQty } = useCart();
  const [ref, inView] = useInView({ threshold: 0.1 });
  const hook = useStoreProducts();
  const products = serverProducts && serverProducts.length > 0 ? serverProducts : hook.products;
  const isLoading = serverProducts ? false : hook.isLoading;
  const popular = useMemo(() => getPopularProducts(products), [products]);
  const lastClickRef = useRef(0);
  const guardedAdd = useCallback((p: Product) => {
    const now = Date.now();
    if (now - lastClickRef.current < 300) return;
    lastClickRef.current = now;
    addItem(p);
  }, [addItem]);

  // Show skeleton only while loading, hide section if no products after load
  if (isLoading) return <SectionPlaceholder title="Mas Vendidos" hint="Cargando..." cols={6} />;
  if (popular.length === 0) return null;

  return (
    <section ref={ref} className="py-14 sm:py-20 bg-surface">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className={`text-center mb-10 sm:mb-12 transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <span className="inline-flex items-center gap-1.5 bg-primary/8 text-primary text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full mb-4">
            <TrendingUp className="w-3.5 h-3.5" />
            Esta semana
          </span>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-foreground">
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

        {/* Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {popular.map((product, i) => {
            const rank = RANK_STYLES[i] ?? null;
            const cartItem = items.find((ci) => ci.id === product.id);
            const qty = cartItem?.quantity ?? 0;
            const isOutOfStock = product.stock != null && product.stock <= 0;

            return (
              <div
                key={product.id}
                className={`group relative bg-card rounded-2xl shadow-sm overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ${
                  inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}
                style={{ transitionDelay: inView ? `${i * 80}ms` : "0ms" }}
              >
                {/* Rank badge — top left corner */}
                {rank ? (
                  <div className={`absolute top-2.5 left-2.5 z-10 ${rank.bg} ${rank.text} rounded-full w-6 h-6 flex items-center justify-center text-[11px] font-extrabold shadow-md`}>
                    {rank.label}
                  </div>
                ) : (
                  <div className="absolute top-2.5 left-2.5 z-10 bg-white/90 dark:bg-black/50 text-foreground rounded-full w-6 h-6 flex items-center justify-center text-[10px] font-bold shadow-sm">
                    #{i + 1}
                  </div>
                )}

                {/* Image */}
                <div className="relative aspect-square bg-gray-50 dark:bg-white/5 overflow-hidden">
                  {product.image ? (
                    <Image
                      src={product.image}
                      alt={product.name}
                      fill
                      sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 16vw"
                      className="object-cover group-hover:scale-108 transition-transform duration-500"
                      placeholder="blur"
                      blurDataURL={BLUR_DATA_URL}
                      {...(i < 2 ? { priority: true } : { loading: "lazy" as const })}
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-gray-300">
                      <Package className="h-10 w-10" />
                    </div>
                  )}
                  {/* Badge — bottom right to avoid overlap with rank */}
                  {product.badge && (
                    <span
                      className="absolute bottom-2 right-2 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md"
                      style={{ background: product.badge === "Popular" ? "#2563EB" : product.badge === "Oferta" ? "#ef4444" : product.badge === "Fresco" ? "#10b981" : "#6b7280" }}
                    >
                      {product.badge}
                    </span>
                  )}
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="text-sm sm:text-base font-semibold text-foreground line-clamp-2 leading-tight mb-2.5">
                    {product.name}
                  </h3>
                  <div className="flex items-center justify-between gap-1">
                    <div>
                      <p className="text-lg font-extrabold text-primary leading-none">
                        S/{product.price.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted mt-0.5">por {product.unit}</p>
                    </div>
                    {isOutOfStock ? (
                      <span className="text-[10px] font-bold text-gray-400 border border-gray-200 rounded-full px-2 py-1">Agotado</span>
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
                        className="bg-primary text-white rounded-full p-3 hover:bg-primary-dark active:scale-90 transition-all shadow-sm hover:shadow-md"
                        aria-label={`Agregar ${product.name}`}
                      >
                        <ShoppingCart className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Top 3 accent bar at bottom */}
                {i < 3 && (
                  <div className="h-0.5 w-full" style={{ background: i === 0 ? "#f59e0b" : i === 1 ? "#9ca3af" : "#f97316" }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
