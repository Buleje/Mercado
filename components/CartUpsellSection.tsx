"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus, Sparkles, TrendingUp, Zap, Package } from "@buleje/design-system/icons";
import { getProductSlug } from "@/data/products";
import type { Product } from "@/data/products";
import { useStoreProducts } from "@/hooks/use-store-products";

type CartItem = Product & { quantity: number };
type CoPurchased = { id: number; name: string; image: string; price: number; unit: string };

interface CartUpsellSectionProps {
  items: CartItem[];
  cartTotal: number;
  coPurchased: CoPurchased[];
  onAddItem: (product: Product) => void;
}

const FREE_DELIVERY_THRESHOLD = 50;

/**
 * Smart upsell section for the cart sidebar.
 * Shows:
 * 1. Threshold suggestions — products that push total past free delivery
 * 2. Co-purchased items with better visual presentation
 * 3. Combo detection when complementary items found
 */
export default function CartUpsellSection({
  items,
  cartTotal,
  coPurchased,
  onAddItem,
}: CartUpsellSectionProps) {
  const { products: allProducts, isLoading } = useStoreProducts();
  const cartIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const remaining = FREE_DELIVERY_THRESHOLD - cartTotal;
  const needsThresholdPush = remaining > 0 && remaining < 30;

  // ── 1. Threshold products: cheap items that push past free delivery ──
  const thresholdProducts = useMemo(() => {
    if (!needsThresholdPush) return [];
    return allProducts
      .filter((p) => !cartIds.has(p.id) && p.price >= remaining && p.price <= remaining + 10)
      .sort((a, b) => a.price - b.price)
      .slice(0, 2);
  }, [needsThresholdPush, remaining, cartIds, allProducts]);

  // ── 2. Co-purchased suggestions (filtered, exclude already in cart) ──
  const suggestions = useMemo(() => {
    const real = coPurchased.filter((p) => !cartIds.has(p.id)).slice(0, 4);
    if (real.length >= 2) return real;
    // Fallback: same-category products
    const cartCats = new Set(items.map((i) => i.category));
    const fallback = allProducts
      .filter((p) => cartCats.has(p.category) && !cartIds.has(p.id))
      .slice(0, 4);
    return [...real, ...fallback.filter((f) => !real.some((r) => r.id === f.id))].slice(0, 4);
  }, [coPurchased, cartIds, items, allProducts]);

  // Helper: resolve a CoPurchased to a full Product (for addItem compatibility)
  const resolveProduct = (s: CoPurchased | Product): Product => {
    if ("category" in s) return s as Product;
    const match = allProducts.find((p) => p.id === s.id);
    return match ?? { ...s, category: "", badge: undefined };
  };

  // ── 3. Combo detection — complementary pairs from different categories ──
  const combo = (() => {
    const cats = new Set(items.map((i) => i.category));
    const inCart = new Set(items.map((i) => i.id));
    const COMBOS: Record<string, string[]> = {
      carnes: ["abarrotes", "bebidas"],
      abarrotes: ["frutas-verduras", "lacteos"],
      bebidas: ["abarrotes", "carnes"],
      "frutas-verduras": ["lacteos", "abarrotes"],
    };

    for (const [cat, complements] of Object.entries(COMBOS)) {
      if (cats.has(cat)) {
        for (const comp of complements) {
          if (!cats.has(comp)) {
            const product = allProducts.find((p) => p.category === comp && !inCart.has(p.id));
            if (product) {
              return {
                label: `Complementa con ${comp === "frutas-verduras" ? "verduras" : comp}`,
                product,
              };
            }
          }
        }
      }
    }
    return null;
  })();

  const hasContent = thresholdProducts.length > 0 || suggestions.length > 0 || combo;
  if (isLoading || !hasContent) return null;

  return (
    <div className="space-y-3">
      {/* ── Threshold push: "Add X to get free delivery" ───── */}
      {thresholdProducts.length > 0 && (
        <div className="bg-emerald-50/80 dark:bg-emerald-950/20 rounded-xl border border-emerald-200/50 dark:border-emerald-800/30 p-3">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Zap className="h-3.5 w-3.5 text-[var(--data-success-600)]" />
            <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-700)] dark:text-emerald-400">
              Agrega uno y desbloquea delivery gratis
            </p>
          </div>
          <div className="space-y-2">
            {thresholdProducts.map((p) => (
              <button
                key={p.id}
                onClick={() => onAddItem(resolveProduct(p))}
                className="flex items-center gap-3 w-full bg-white dark:bg-card rounded-lg px-3 py-2 border border-emerald-100 dark:border-emerald-800/20 hover:border-emerald-300 hover:shadow-sm transition-all text-left group"
              >
                <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-gray-50 shrink-0">
                  {p.image ? (
                    <Image src={p.image} alt={p.name} fill className="object-cover" sizes="36px" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <Package className="h-4 w-4 text-gray-300" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{p.name}</p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--data-success-600)] dark:text-emerald-400 font-medium">
                    S/{Number(p.price).toFixed(2)} — ¡alcanzas delivery gratis!
                  </p>
                </div>
                <div className="h-7 w-7 rounded-lg bg-[var(--data-success-500)] text-white flex items-center justify-center shrink-0 group-hover:bg-[var(--data-success-600)] transition-colors">
                  <Plus className="h-3.5 w-3.5" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Combo suggestion ───── */}
      {combo && (
        <div className="bg-amber-50/80 dark:bg-amber-950/20 rounded-xl border border-amber-200/50 dark:border-amber-800/30 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="h-3.5 w-3.5 text-[var(--data-warning-600)]" />
            <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)] dark:text-amber-400">{combo.label}</p>
          </div>
          <button
            onClick={() => onAddItem(combo.product)}
            className="flex items-center gap-3 w-full bg-white dark:bg-card rounded-lg px-3 py-2 border border-amber-100 dark:border-amber-800/20 hover:border-amber-300 hover:shadow-sm transition-all text-left group"
          >
            <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-gray-50 shrink-0">
              {combo.product.image ? (
                <Image src={combo.product.image} alt={combo.product.name} fill className="object-cover" sizes="36px" />
              ) : (
                <div className="h-full w-full flex items-center justify-center">
                  <Package className="h-4 w-4 text-gray-300" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{combo.product.name}</p>
              <p className="text-[length:var(--ts-2xs)] text-[var(--data-warning-600)] font-bold">S/{combo.Number(product.price).toFixed(2)}/{combo.product.unit}</p>
            </div>
            <div className="h-7 w-7 rounded-lg bg-[var(--data-warning-500)] text-white flex items-center justify-center shrink-0 group-hover:bg-[var(--data-warning-600)] transition-colors">
              <Plus className="h-3.5 w-3.5" />
            </div>
          </button>
        </div>
      )}

      {/* ── Co-purchased / "También compran" ───── */}
      {suggestions.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp className="h-3 w-3 text-gray-400" />
            <p className="text-[length:var(--ts-2xs)] font-bold text-gray-400 uppercase tracking-wider">
              También compran
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {suggestions.map((s) => {
              const slug = "category" in s ? getProductSlug(s as Product) : null;
              return (
                <div
                  key={s.id}
                  className="bg-gray-50 dark:bg-accent/50 rounded-xl border border-gray-100 dark:border-card-border overflow-hidden hover:border-primary/30 transition-all group"
                >
                  <div className="relative aspect-4/3 bg-white dark:bg-card">
                    {s.image ? (
                      <Image src={s.image} alt={s.name} fill className="object-cover" sizes="150px" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <Package className="h-6 w-6 text-gray-200" />
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    {slug ? (
                      <Link href={`/tienda/${slug}`} className="text-[length:var(--ts-2xs)] font-semibold text-foreground line-clamp-1 hover:text-primary transition-colors">
                        {s.name}
                      </Link>
                    ) : (
                      <p className="text-[length:var(--ts-2xs)] font-semibold text-foreground line-clamp-1">{s.name}</p>
                    )}
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-xs font-extrabold text-primary">S/{Number(s.price).toFixed(2)}</span>
                      <button
                        onClick={() => onAddItem(resolveProduct(s))}
                        className="h-6 w-6 rounded-md bg-primary text-white flex items-center justify-center hover:bg-primary-dark active:scale-90 transition-all"
                        aria-label={`Agregar ${s.name}`}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
