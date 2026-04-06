"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { ShoppingCart, Sparkles, Tag, Package, Minus, Plus } from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { useStoreProducts } from "@/hooks/use-store-products";
import { cn } from "@/lib/utils";
import type { Product, Category } from "@/data/products";

type Combo = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  products: Product[];
  originalTotal: number;
  comboPrice: number;
  discountPercent: number;
};

// Pre-defined smart combos based on complementary product categories
const COMBO_TEMPLATES = [
  {
    id: "desayuno",
    name: "Combo Desayuno Familiar",
    description: "Todo lo que necesitas para empezar el día con energía",
    emoji: "🍳",
    categories: ["lacteos", "abarrotes", "frutas-verduras"],
    size: 3,
    discount: 10,
  },
  {
    id: "parrilla",
    name: "Combo Parrilla",
    description: "Para una parrillada perfecta con la familia",
    emoji: "🥩",
    categories: ["carnes", "bebidas", "abarrotes"],
    size: 3,
    discount: 12,
  },
  {
    id: "limpieza-total",
    name: "Combo Limpieza Total",
    description: "Mantén tu hogar impecable con este paquete",
    emoji: "✨",
    categories: ["limpieza"],
    size: 3,
    discount: 15,
  },
  {
    id: "lonchera",
    name: "Combo Lonchera Escolar",
    description: "Snacks y bebidas para la lonchera de tus hijos",
    emoji: "🎒",
    categories: ["bebidas", "lacteos", "frutas-verduras"],
    size: 3,
    discount: 8,
  },
];

type ComboTemplate = (typeof COMBO_TEMPLATES)[number];

function buildCombos(liveProducts: Product[], templates: ComboTemplate[] = COMBO_TEMPLATES): Combo[] {
  return templates.map((tmpl) => {
    // Pick products from the specified categories
    const pool = liveProducts.filter((p) => tmpl.categories.includes(p.category));
    // Pick one from each category (or fill from pool)
    const picked: Product[] = [];
    const usedIds = new Set<number>();
    for (const cat of tmpl.categories) {
      const catProducts = pool.filter((p) => p.category === cat && !usedIds.has(p.id));
      if (catProducts.length > 0) {
        // Pick a random product from category to keep combos fresh
        const product = catProducts[Math.floor(Math.random() * catProducts.length)];
        picked.push(product);
        usedIds.add(product.id);
      }
    }
    // Fill remaining slots if needed
    while (picked.length < tmpl.size && pool.length > picked.length) {
      const remaining = pool.filter((p) => !usedIds.has(p.id));
      if (remaining.length === 0) break;
      const product = remaining[Math.floor(Math.random() * remaining.length)];
      picked.push(product);
      usedIds.add(product.id);
    }

    const originalTotal = picked.reduce((sum, p) => sum + p.price, 0);
    const comboPrice = +(originalTotal * (1 - tmpl.discount / 100)).toFixed(2);

    return {
      id: tmpl.id,
      name: tmpl.name,
      description: tmpl.description,
      emoji: tmpl.emoji,
      products: picked,
      originalTotal: +originalTotal.toFixed(2),
      comboPrice,
      discountPercent: tmpl.discount,
    };
  }).filter((c) => c.products.length >= 2); // Only show combos with at least 2 products
}

function ComboCard({ combo, categories }: { combo: Combo; categories: Category[] }) {
  const { addItem, items: cartItems, updateQty } = useCart();
  const { showToast } = useToast();
  const [adding, setAdding] = useState(false);

  const comboId = Math.abs(combo.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) * -1000);

  const handleAddAll = () => {
    setAdding(true);
    // Add combo as a single cart item with the discounted price
    const comboProduct = {
      id: comboId,
      name: `${combo.emoji} ${combo.name}`,
      price: combo.comboPrice,
      image: combo.products[0]?.image || "/placeholder-product.png",
      unit: "combo",
      category: "combos",
      badge: `-${combo.discountPercent}%` as const,
    };
    addItem(comboProduct as Product);
    showToast(`${combo.name} agregado como combo`, combo.products[0]?.image);
    setTimeout(() => setAdding(false), 600);
  };

  return (
    <div className="group relative bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden flex flex-col">
      {/* Discount badge */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-red-500 text-white rounded-full px-2.5 py-1 text-xs font-bold shadow-md">
        <Tag className="h-3 w-3" />
        -{combo.discountPercent}%
      </div>

      {/* Product images grid */}
      <div className="relative bg-gray-50 dark:bg-surface p-4">
        <div className={cn(
          "grid gap-2",
          combo.products.length === 2 ? "grid-cols-2" : "grid-cols-3"
        )}>
          {combo.products.map((product) => (
            <div key={product.id} className="relative aspect-square rounded-xl overflow-hidden bg-white dark:bg-card border border-gray-100 dark:border-card-border">
              {product.image ? (
                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                  sizes="120px"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-gray-300">
                  <Package className="h-6 w-6" />
                </div>
              )}
            </div>
          ))}

        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xl">{combo.emoji}</span>
          <h3 className="font-extrabold text-foreground text-sm sm:text-base leading-tight line-clamp-1">{combo.name}</h3>
        </div>
        <p className="text-xs text-muted mb-3 line-clamp-2">{combo.description}</p>

        {/* Product list */}
        <div className="space-y-1 mb-4 flex-1">
          {combo.products.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-xs">
              <span className="text-foreground/70 truncate flex-1 mr-2">
                {categories.find(c => c.id === p.category)?.emoji} {p.name}
              </span>
              <span className="text-muted line-through shrink-0">S/{p.price.toFixed(2)}</span>
            </div>
          ))}
        </div>

        {/* Price and CTA */}
        <div className="mt-auto">
          <div className="flex items-end justify-between gap-2">
            <div>
              <span className="block text-xs text-muted line-through">S/{combo.originalTotal.toFixed(2)}</span>
              <span className="text-xl font-extrabold text-primary">S/{combo.comboPrice.toFixed(2)}</span>
              <span className="block text-[10px] text-emerald-600 font-semibold">
                Ahorras S/{(combo.originalTotal - combo.comboPrice).toFixed(2)}
              </span>
            </div>
            {(() => { const qty = cartItems.find(i => i.id === comboId)?.quantity ?? 0; return qty > 0 ? (
              <div className="flex items-center gap-0.5 bg-primary rounded-full px-1 py-1 shrink-0">
                <button onClick={() => updateQty(comboId, qty - 1)} className="h-7 w-7 flex items-center justify-center rounded-full text-white hover:bg-white/20 transition-colors" aria-label="Disminuir">
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="text-white font-extrabold text-sm min-w-5 text-center">{qty}</span>
                <button onClick={() => updateQty(comboId, qty + 1)} className="h-7 w-7 flex items-center justify-center rounded-full text-white hover:bg-white/20 transition-colors" aria-label="Aumentar">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleAddAll}
                disabled={adding}
                className={cn(
                  "flex items-center justify-center h-11 w-11 rounded-2xl shadow-lg shrink-0",
                  adding
                    ? "bg-emerald-500 text-white scale-95"
                    : "bg-primary text-white hover:bg-primary-dark hover:scale-105 active:scale-95"
                )}
                aria-label={adding ? "¡Combo agregado!" : "Agregar combo al carrito"}
              >
                <ShoppingCart className="h-5 w-5" />
              </button>
            ); })()}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CombosSection() {
  const { products: liveProducts, categories, isLoading } = useStoreProducts();
  const [settingsTemplates, setSettingsTemplates] = useState<ComboTemplate[] | null>(null);

  // Load settings combo templates from admin configuration
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (s?.comboTemplates && Array.isArray(s.comboTemplates) && s.comboTemplates.length > 0) {
          setSettingsTemplates(s.comboTemplates as ComboTemplate[]);
        }
      })
      .catch(() => {});
  }, []);

  // Build combos from available products
  const combos = useMemo(
    () => buildCombos(liveProducts, settingsTemplates ?? COMBO_TEMPLATES),
    [liveProducts, settingsTemplates]
  );

  // No render while loading or if no combos — prevents blank gaps
  if (isLoading || liveProducts.length === 0 || combos.length === 0) return null;

  return (
    <section className="py-16 sm:py-20 bg-white dark:bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400 mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            Combos Ahorro
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground">
            Combos <span className="text-primary">Inteligentes</span>
          </h2>
          <p className="mt-3 text-muted max-w-xl mx-auto">
            Ahorra comprando en combo. Productos complementarios con descuento especial.
          </p>
        </div>

        {/* Combos Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {combos.map((combo) => (
            <ComboCard key={combo.id} combo={combo} categories={categories} />
          ))}
        </div>
      </div>
    </section>
  );
}
