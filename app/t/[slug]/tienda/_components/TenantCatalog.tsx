"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ShoppingCart,
  Search,
  Plus,
  Minus,
  Loader2,
  Store,
  PackageX,
  ChevronRight,
} from "@buleje/design-system/icons";

/* ─── Tipos ───────────────────────────────────────────────────────────────── */
interface Product {
  id: string;
  name: string;
  price: number;
  imageUrl?: string | null;
  stock?: number;
  category?: string | null;
  unit?: string | null;
}

interface CartItem extends Product {
  qty: number;
}

/* ─── Utilidades ──────────────────────────────────────────────────────────── */
function formatPrice(amount: number, currency = "PEN") {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function getCartKey(slug: string) {
  return `buleje-${slug}-cart`;
}

/* ─── Componente carrito flotante ─────────────────────────────────────────── */
function CartBadge({
  count,
  total,
  slug,
  color,
  currency,
}: {
  count: number;
  total: number;
  slug: string;
  color: string;
  currency: string;
}) {
  if (count === 0) return null;
  return (
    <Link
      href={`/t/${slug}/tienda/carrito`}
      className="fixed bottom-6 right-4 sm:right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-white font-bold text-sm transition-all active:scale-95"
      style={{ background: color }}
    >
      <ShoppingCart className="w-5 h-5" />
      <span>{count} ítem{count !== 1 ? "s" : ""}</span>
      <span className="opacity-80">·</span>
      <span>{formatPrice(total, currency)}</span>
      <ChevronRight className="w-4 h-4 opacity-70" />
    </Link>
  );
}

/* ─── Tarjeta de producto ─────────────────────────────────────────────────── */
function ProductCard({
  product,
  qty,
  onAdd,
  onRemove,
  color,
  currency,
}: {
  product: Product;
  qty: number;
  onAdd: () => void;
  onRemove: () => void;
  color: string;
  currency: string;
}) {
  const hasStock = product.stock === undefined || product.stock > 0;

  return (
    <div className="bg-[var(--surface-raised)] rounded-2xl overflow-hidden shadow-sm border border-[var(--rule-base)] flex flex-col">
      <div className="relative aspect-square bg-[var(--surface-sunken)]">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Store className="w-10 h-10 text-gray-300 dark:text-gray-700" />
          </div>
        )}
        {!hasStock && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="text-white text-xs font-bold px-2 py-1 bg-black/60 rounded-lg">
              Agotado
            </span>
          </div>
        )}
      </div>

      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="flex-1">
          <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wide">
            {product.category ?? "General"}
          </p>
          <p className="font-semibold text-[var(--text-primary)] text-sm leading-tight line-clamp-2 mt-0.5">
            {product.name}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="font-extrabold text-[var(--text-primary)]">
            {formatPrice(product.price, currency)}
          </p>
          {product.unit && (
            <span className="text-xs text-[var(--text-tertiary)]">/{product.unit}</span>
          )}
        </div>

        {qty === 0 ? (
          <button
            onClick={onAdd}
            disabled={!hasStock}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: hasStock ? color : "#9ca3af", minHeight: "44px" }}
          >
            <Plus className="w-4 h-4" />
            Agregar
          </button>
        ) : (
          <div className="flex items-center justify-between bg-[var(--surface-sunken)] rounded-xl overflow-hidden">
            <button
              onClick={onRemove}
              className="flex items-center justify-center w-11 h-11 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700"
              aria-label="Quitar uno"
            >
              <Minus className="w-4 h-4 text-[var(--text-secondary)]" />
            </button>
            <span className="font-bold text-[var(--text-primary)] text-sm">
              {qty}
            </span>
            <button
              onClick={onAdd}
              className="flex items-center justify-center w-11 h-11 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700"
              aria-label="Agregar uno"
              style={{ color }}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Props ───────────────────────────────────────────────────────────────── */
interface TenantCatalogProps {
  slug: string;
  storeName: string;
  primaryColor: string;
  currency: string;
}

/* ─── Catálogo del tenant ─────────────────────────────────────────────────── */
export default function TenantCatalog({ slug, storeName, primaryColor, currency }: TenantCatalogProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>(() => {
    if (typeof window === "undefined" || !slug) return [];
    try {
      const raw = localStorage.getItem(getCartKey(slug));
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch {
      return [];
    }
  });
  const [loadingProducts, setLoadingProducts] = useState(true);

  useEffect(() => {
    if (!slug) return;
    localStorage.setItem(getCartKey(slug), JSON.stringify(cart));
  }, [cart, slug]);

  useEffect(() => {
    if (!slug) return;
    fetch("/api/products?active=true&limit=100", {
      headers: { "x-tenant-id": slug },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { products?: Product[] } | Product[] | null) => {
        if (Array.isArray(data)) {
          setProducts(data);
        } else if (data && "products" in data && Array.isArray(data.products)) {
          setProducts(data.products);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingProducts(false));
  }, [slug]);

  const filtered = products.filter(
    (p) =>
      !query ||
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      (p.category ?? "").toLowerCase().includes(query.toLowerCase())
  );

  const getQty = useCallback(
    (id: string) => cart.find((c) => c.id === id)?.qty ?? 0,
    [cart]
  );

  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const exists = prev.find((c) => c.id === product.id);
      if (exists) return prev.map((c) => c.id === product.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { ...product, qty: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => {
      const exists = prev.find((c) => c.id === productId);
      if (!exists || exists.qty <= 1) return prev.filter((c) => c.id !== productId);
      return prev.map((c) => c.id === productId ? { ...c, qty: c.qty - 1 } : c);
    });
  }, []);

  const cartCount = cart.reduce((s, c) => s + c.qty, 0);
  const cartTotal = cart.reduce((s, c) => s + c.qty * c.price, 0);

  return (
    <>
      {/* Header */}
      <header
        className="sticky top-0 z-40 px-4 py-3 shadow-sm"
        style={{ background: primaryColor }}
      >
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href={`/t/${slug}`} className="flex items-center gap-2 flex-1 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-extrabold flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}
            >
              {storeName.slice(0, 2).toUpperCase()}
            </div>
            <span className="font-bold text-white truncate text-sm sm:text-base">
              {storeName}
            </span>
          </Link>

          {cartCount > 0 && (
            <Link
              href={`/t/${slug}/tienda/carrito`}
              className="relative flex-shrink-0"
              aria-label={`Ver carrito (${cartCount} ítems)`}
            >
              <ShoppingCart className="w-6 h-6 text-white" />
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-xs font-bold flex items-center justify-center bg-[#f4a261] text-white">
                {cartCount > 9 ? "9+" : cartCount}
              </span>
            </Link>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <h2 className="text-2xl font-extrabold mb-4">Catálogo completo</h2>

        <div className="relative mb-6">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar productos…"
            className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-base)] text-[var(--text-primary)] placeholder:text-gray-400 text-sm outline-none focus:border-emerald-400 dark:focus:border-emerald-500 transition-colors shadow-sm"
            style={{ minHeight: "48px" }}
          />
        </div>

        {loadingProducts && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: primaryColor }} />
            <p className="text-sm text-[var(--text-tertiary)]">Cargando productos…</p>
          </div>
        )}

        {filtered.length === 0 && !loadingProducts && (
          <div className="text-center py-16 space-y-3">
            <PackageX className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto" />
            <p className="text-[var(--text-tertiary)] font-medium">
              {query ? `Sin resultados para "${query}"` : "Esta tienda aún no tiene productos"}
            </p>
            {query && (
              <button
                onClick={() => setQuery("")}
                className="text-sm underline"
                style={{ color: primaryColor }}
              >
                Ver todos los productos
              </button>
            )}
          </div>
        )}

        {filtered.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {filtered.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                qty={getQty(product.id)}
                onAdd={() => addToCart(product)}
                onRemove={() => removeFromCart(product.id)}
                color={primaryColor}
                currency={currency}
              />
            ))}
          </div>
        )}
      </main>

      <CartBadge
        count={cartCount}
        total={cartTotal}
        slug={slug}
        color={primaryColor}
        currency={currency}
      />
    </>
  );
}
