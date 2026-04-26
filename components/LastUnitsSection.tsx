"use client";

import { useMemo, useRef, useCallback } from "react";
import Image from "next/image";
import { ShoppingCart, Minus, Plus, Package } from "@buleje/design-system/icons";
import { ProductBadge, ProductPrice } from "@buleje/design-system";
import { useCart } from "@/contexts/cart-context";
import { useQuickAddSafe } from "@/contexts/quick-add-context";
import { useInView } from "@/hooks/use-in-view";
import { useStoreProducts } from "@/hooks/use-store-products";
import type { Product } from "@/data/products";
import SectionPlaceholder from "@/components/SectionPlaceholder";
import SmartProductImage from "@/components/store/SmartProductImage";

const BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNCIgaGVpZ2h0PSI0IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNlNWU3ZWIiLz48L3N2Zz4=";

const LOW_STOCK_THRESHOLD = 5;

function getLowStockProducts(allProducts: Product[]): Product[] {
  return allProducts
    .filter((p) => p.stock != null && p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD)
    .sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0))
    .slice(0, 8);
}

export default function LastUnitsSection({ serverProducts, showEmpty = false, emptyVariant = "admin" }: { serverProducts?: Product[]; showEmpty?: boolean; emptyVariant?: "admin" | "public" }) {
  const { addItem, items, updateQty } = useCart();
  const quickAdd = useQuickAddSafe();
  const [ref, inView] = useInView({ threshold: 0.1 });
  const hook = useStoreProducts();
  const products = serverProducts && serverProducts.length > 0 ? serverProducts : hook.products;
  const isLoading = serverProducts ? false : hook.isLoading;
  const lowStock = useMemo(() => getLowStockProducts(products), [products]);
  const lastClickRef = useRef(0);

  const guardedAdd = useCallback(
    (p: Product) => {
      const now = Date.now();
      if (now - lastClickRef.current < 300) return;
      lastClickRef.current = now;
      if (quickAdd) {
        quickAdd.openQuickAdd(p);
      } else {
        addItem(p);
      }
    },
    [addItem, quickAdd]
  );

  // Show skeleton only while loading, hide section if no products after load
  if (isLoading) return <SectionPlaceholder title="Ultimas Unidades" hint="Cargando..." cols={4} />;
  if (lowStock.length === 0) return showEmpty ? <SectionPlaceholder title="Ultimas Unidades" hint="Productos con stock bajo apareceran aqui" cols={4} variant={emptyVariant} publicTitle="Ultimas unidades" /> : null;

  return (
    <section
      ref={ref as React.Ref<HTMLElement>}
      className="py-14 sm:py-20 bg-surface"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header — tono neutral sin urgencia agresiva */}
        <div className="text-center mb-10 sm:mb-12">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold tracking-wider uppercase rounded-full bg-[var(--accent-soft)] text-[var(--accent)] mb-4">
            Disponibilidad limitada
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground">
            Últimas unidades
          </h2>
          <p className="text-muted text-sm mt-2">
            Stock reducido — consulta disponibilidad
          </p>
        </div>

        {/* Products grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {lowStock.map((product) => {
            const inCart = items.find((i) => i.id === product.id);
            const qty = inCart?.quantity ?? 0;
            const stockLeft = product.stock ?? 0;

            return (
              <div
                key={product.id}
                className={`group relative rounded-2xl bg-white dark:bg-card border border-gray-100 dark:border-card-border overflow-hidden transition-all duration-300 ${
                  inView
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-4"
                }`}
              >
                {/* Stock badge — scarcity neutral via DS (accent-soft, no rojo) */}
                <div className="absolute top-2 left-2 z-10">
                  <ProductBadge intent="scarcity">
                    {stockLeft === 1 ? "Última unidad" : `Quedan ${stockLeft}`}
                  </ProductBadge>
                </div>

                {/* Image */}
                <div className="relative aspect-square bg-[var(--surface-sunken)] overflow-hidden">
                  <SmartProductImage
                    src={product.image}
                    alt={product.name}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    placeholder="blur"
                    blurDataURL={BLUR_DATA_URL}
                    placeholderSize={28}
                    showPlaceholderLabel={false}
                  />

                  {/* Progress bar — teal accent, sin urgencia rojo alarmista */}
                  <div className="absolute bottom-0 inset-x-0 h-1 bg-[var(--rule-soft)]">
                    <div
                      className="h-full bg-[var(--accent)] transition-all duration-700"
                      style={{
                        width: `${Math.max(5, (stockLeft / LOW_STOCK_THRESHOLD) * 100)}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Info */}
                <div className="p-3 sm:p-4">
                  <h3 className="font-semibold text-sm text-foreground line-clamp-2 leading-snug mb-1">
                    {product.name}
                  </h3>

                  <div className="mb-3">
                    <ProductPrice price={product.price} size="md" />
                  </div>

                  {/* Add to cart */}
                  {qty > 0 ? (
                    <div className="flex items-center justify-between gap-2 bg-primary/10 dark:bg-primary/20 rounded-xl px-2 py-1.5">
                      <button
                        className="h-7 w-7 flex items-center justify-center rounded-lg bg-white dark:bg-card text-primary shadow-sm hover:bg-gray-50 transition-colors"
                        onClick={() => updateQty(product.id, qty - 1)}
                        aria-label="Quitar uno"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-sm font-bold text-primary tabular-nums">
                        {qty}
                      </span>
                      <button
                        className="h-7 w-7 flex items-center justify-center rounded-lg bg-primary text-white shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
                        onClick={() => updateQty(product.id, qty + 1)}
                        disabled={qty >= stockLeft}
                        aria-label="Agregar uno"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => guardedAdd(product)}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-bold shadow-sm transition-all duration-200 active:scale-95"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" />
                      Agregar al carrito
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
