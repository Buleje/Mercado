"use client";

import { useRef, useMemo } from "react";
import Image from "next/image";
import { Star, Package, ShoppingCart, Minus, Plus } from "@buleje/design-system/icons";
import { ProductBadge, ProductPrice, type ProductBadgeIntent } from "@buleje/design-system";
import { useStoreProducts } from "@/hooks/use-store-products";
import { useCart } from "@/contexts/cart-context";
import { useQuickAddSafe } from "@/contexts/quick-add-context";
import { useToast } from "@/contexts/toast-context";
import SectionPlaceholder from "@/components/SectionPlaceholder";
import SmartProductImage from "@/components/store/SmartProductImage";

// Map string badges del backend → intent canónico del DS.
const BADGE_INTENT: Record<string, ProductBadgeIntent> = {
  Popular: "popular",
  Oferta: "offer",
  Fresco: "fresh",
  Nuevo: "new",
  Premium: "premium",
};

export default function FeaturedCarousel({ serverProducts, showEmpty = false, emptyVariant = "admin", strictAdminOnly = false }: { serverProducts?: import("@/data/products").Product[]; showEmpty?: boolean; emptyVariant?: "admin" | "public"; strictAdminOnly?: boolean }) {
  const hook = useStoreProducts();
  const products = serverProducts && serverProducts.length > 0 ? serverProducts : hook.products;
  const isLoading = serverProducts ? false : hook.isLoading;
  const { addItem, items, updateQty } = useCart();
  const quickAdd = useQuickAddSafe();
  const { showToast } = useToast();
  const lastClickRef = useRef(0);

  const featured = useMemo(() => {
    // En modo estricto no mostramos nada hasta que el admin marque productos
    // explícitamente desde "Mi Tienda Personal → Productos destacados". Los
    // badges del seed (toda la fixture trae "Popular" / "Oferta") no cuentan
    // como asignación real del comerciante.
    if (strictAdminOnly) return [];

    const badged = products.filter(p => p.badge === "Popular" || p.badge === "Oferta").slice(0, 6);
    if (badged.length >= 3) return badged;

    // Fallback solo cuando NO hay regla estricta — útil para preview admin.
    const inStock = products.filter(p => (p.stock ?? 0) > 0);
    const withImage = inStock.filter(p => p.image);
    const pool = withImage.length >= 6 ? withImage : inStock;

    const today = new Date();
    const daySeed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    const scored = pool.map((p, i) => ({
      product: p,
      score: ((daySeed * 31 + i * 17) % 997) + (p.image ? 500 : 0) + (p.badge ? 200 : 0),
    }));
    scored.sort((a, b) => b.score - a.score);
    const autoSelected = scored.map(s => s.product).filter(p => !badged.some(b => b.id === p.id));
    return [...badged, ...autoSelected].slice(0, 6);
  }, [products, strictAdminOnly]);

  // No mostrar el carrusel mientras carga o si el tenant no tiene productos destacados
  if (isLoading) return null;
  if (featured.length === 0) return showEmpty ? <SectionPlaceholder title="Productos Destacados" hint="Los productos con badge Popular u Oferta apareceran aqui" cols={6} variant={emptyVariant} publicTitle="Productos destacados" /> : null;

  return (
    <section className="py-6 sm:py-8" style={{ background: "linear-gradient(to bottom, rgba(0,180,166,0.05), transparent)" }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 mb-4">
          <Star className="h-4 w-4 text-secondary fill-secondary" />
          <h2 className="text-base sm:text-lg font-extrabold text-foreground">Productos Destacados</h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
          {featured.map(product => (
            <div key={product.id} className="group bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
              <div className="relative aspect-square bg-[var(--surface-sunken)] overflow-hidden">
                <SmartProductImage
                  src={product.image}
                  alt={product.name}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  sizes="(max-width:640px) 50vw, (max-width:1024px) 25vw, 16vw"
                  placeholderSize={28}
                  showPlaceholderLabel={false}
                />
                {product.badge && BADGE_INTENT[product.badge] && (
                  <div className="absolute top-1.5 left-1.5">
                    <ProductBadge intent={BADGE_INTENT[product.badge]}>{product.badge}</ProductBadge>
                  </div>
                )}
              </div>
              <div className="p-2">
                <h3 className="font-medium text-foreground text-xs leading-tight line-clamp-2 mb-1.5">{product.name}</h3>
                <div className="flex items-center justify-between gap-1">
                  <ProductPrice price={product.price} size="sm" />
                  {(() => {
                    const qty = items.find(i => i.id === product.id)?.quantity ?? 0;
                    return qty > 0 ? (
                      <div className="flex items-center gap-0.5 bg-primary rounded-full px-1 py-1 shrink-0 sm:px-1.5">
                        <button onClick={() => updateQty(product.id, qty - 1)} className="h-5.5 w-5.5 sm:h-6 sm:w-6 flex items-center justify-center rounded-full text-white hover:bg-white/20 transition-colors" aria-label="Disminuir">
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-white font-extrabold text-[length:var(--ts-2xs)] sm:text-xs min-w-4 text-center">{qty}</span>
                        <button onClick={() => updateQty(product.id, qty + 1)} className="h-5.5 w-5.5 sm:h-6 sm:w-6 flex items-center justify-center rounded-full text-white hover:bg-white/20 transition-colors" aria-label="Aumentar">
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          const now = Date.now();
                          if (now - lastClickRef.current < 300) return;
                          lastClickRef.current = now;
                          if (quickAdd) {
                            quickAdd.openQuickAdd(product);
                          } else {
                            addItem(product);
                            showToast(product.name, product.image);
                          }
                        }}
                        className="flex items-center justify-center h-10 w-10 sm:h-11 sm:w-11 rounded-2xl bg-primary text-white hover:bg-primary-dark active:scale-95 shrink-0"
                        aria-label={`Agregar ${product.name}`}
                      >
                        <ShoppingCart className="h-5 w-5" />
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
