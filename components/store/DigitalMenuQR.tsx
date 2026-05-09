"use client";

 

import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { ShoppingCart, Plus, Minus, MessageCircle, Search, X } from "@buleje/design-system/icons";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Product {
  id: string | number;
  name: string;
  price: number;
  category: string;
  image?: string;
  unit?: string;
}

interface CartItem extends Product {
  qty: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `S/${n.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function buildWhatsApp(items: CartItem[], phone = "51999999999"): string {
  const lines = items
    .map((i) => `- ${i.name} x${i.qty} = ${fmt(i.price * i.qty)}`)
    .join("%0A");
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const msg = `Hola! Quiero hacer un pedido:%0A${lines}%0A%0ATotal: ${fmt(total)}`;
  return `https://wa.me/${phone}?text=${msg}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DigitalMenuQR() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [search, setSearch] = useState("");
  const [showCart, setShowCart] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/products?active=true&limit=100", {
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json();
        const list: Product[] = json.products ?? json ?? [];
        setProducts(list);
        const cats = ["Todos", ...Array.from(new Set(list.map((p) => p.category).filter(Boolean)))];
        setCategories(cats as string[]);
      }
    } catch {
      // offline graceful
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchCat =
        activeCategory === "Todos" || p.category === activeCategory;
      const matchSearch = p.name
        .toLowerCase()
        .includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [products, activeCategory, search]);

  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.id === product.id ? { ...i, qty: i.qty + 1 } : i
        );
      }
      return [...prev, { ...product, qty: 1 }];
    });
  }, []);

  const changeQty = useCallback((id: string | number, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0)
    );
  }, []);

  const totalItems = cart.reduce((s, i) => s + i.qty, 0);
  const totalPrice = cart.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] pb-32">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-primary text-white px-4 py-4 shadow-lg">
        <h1 className="text-2xl font-bold tracking-tight">Menu Digital</h1>
        <p className="text-sm text-white/70">Buleje</p>
        <div className="mt-3 flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2">
          <Search className="w-4 h-4 text-white/70 flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto..."
            className="bg-transparent text-white placeholder-white/50 flex-1 outline-none text-sm"
          />
          {search && (
            <button onClick={() => setSearch("")} aria-label="Limpiar">
              <X className="w-4 h-4 text-white/70" />
            </button>
          )}
        </div>
      </header>

      {/* Categories */}
      <div className="sticky top-[108px] z-10 bg-[var(--surface-canvas)] px-4 py-3 flex gap-2 overflow-x-auto scrollbar-none">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              "flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors border",
              activeCategory === cat
                ? "bg-primary text-white border-primary"
                : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-base)]"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Product grid */}
      <main className="px-4 pt-2">
        {loading ? (
          <div className="grid grid-cols-2 gap-4 mt-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-48 rounded-2xl bg-[var(--rule-soft)] dark:bg-gray-800 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 mt-2">
            {filtered.map((product) => {
              const inCart = cart.find((i) => i.id === product.id);
              return (
                <div
                  key={product.id}
                  className="bg-[var(--surface-raised)] rounded-2xl overflow-hidden shadow border border-[var(--rule-base)]"
                >
                  {product.image ? (
                    <div className="relative w-full h-32">
                      <Image
                        src={product.image}
                        alt={product.name}
                        fill
                        sizes="(max-width: 768px) 50vw, 200px"
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-32 bg-primary/10 flex items-center justify-center">
                      <span className="text-4xl text-primary/30 font-extrabold">
                        {product.name[0]}
                      </span>
                    </div>
                  )}
                  <div className="p-3">
                    <p className="font-semibold text-[var(--text-primary)] text-sm leading-tight line-clamp-2">
                      {product.name}
                    </p>
                    <p className="text-primary dark:text-[#2dd4bf] font-bold mt-1">
                      {fmt(product.price)}
                      {product.unit ? (
                        <span className="text-xs text-gray-400 font-normal ml-1">
                          /{product.unit}
                        </span>
                      ) : null}
                    </p>
                    {inCart ? (
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => changeQty(product.id, -1)}
                          className="w-7 h-7 rounded-full bg-[var(--surface-sunken)] flex items-center justify-center"
                          aria-label="Quitar"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-bold text-sm">{inCart.qty}</span>
                        <button
                          onClick={() => changeQty(product.id, 1)}
                          className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center"
                          aria-label="Agregar"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(product)}
                        className="mt-2 w-full py-1.5 rounded-xl bg-primary text-white text-xs font-semibold flex items-center justify-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        Agregar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Cart FAB */}
      {totalItems > 0 && (
        <button
          onClick={() => setShowCart(true)}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 bg-primary text-white px-8 py-4 rounded-2xl shadow-[var(--shadow-xl)] flex items-center gap-3 font-bold text-base"
        >
          <ShoppingCart className="w-5 h-5" />
          Ver pedido ({totalItems}) — {fmt(totalPrice)}
        </button>
      )}

      {/* Cart drawer */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowCart(false)}
          />
          <div className="relative bg-[var(--surface-raised)] rounded-t-3xl max-h-[80vh] overflow-y-auto p-6 shadow-[var(--shadow-xl)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-[var(--text-primary)]">
                Mi pedido
              </h2>
              <button
                onClick={() => setShowCart(false)}
                className="p-2 rounded-full hover:bg-[var(--surface-sunken)]"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {cart.map((item) => (
                <div key={item.id} className="py-3 flex items-center gap-3">
                  <div className="flex-1">
                    <p className="font-medium text-[var(--text-primary)] text-sm">
                      {item.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {fmt(item.price)} x {item.qty}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => changeQty(item.id, -1)}
                      className="w-7 h-7 rounded-full bg-[var(--surface-sunken)] flex items-center justify-center"
                      aria-label="Quitar"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-bold w-5 text-center text-sm">
                      {item.qty}
                    </span>
                    <button
                      onClick={() => changeQty(item.id, 1)}
                      className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center"
                      aria-label="Agregar"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <span className="ml-2 font-bold text-primary dark:text-[#2dd4bf] text-sm w-20 text-right">
                      {fmt(item.price * item.qty)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-[var(--rule-base)]">
              <div className="flex justify-between text-lg font-bold text-[var(--text-primary)]">
                <span>Total</span>
                <span>{fmt(totalPrice)}</span>
              </div>
              <a
                href={buildWhatsApp(cart)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 w-full py-4 rounded-2xl bg-green-500 text-white font-bold text-base flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-5 h-5" />
                Enviar pedido por WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
