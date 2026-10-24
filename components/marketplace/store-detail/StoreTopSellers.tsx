"use client";

/**
 * StoreTopSellers — franja "Lo más pedido" horizontal, específica por tienda.
 *
 * Fetch: GET /api/marketplace/catalog?storeSlug=SLUG&sort=popular&limit=10
 * Se auto-oculta si la respuesta está vacía o hay error.
 *
 * Cards horizontales scrollables: imagen + nombre + precio + botón "+".
 * Usa HorizontalCarousel para drag-mouse + nav desktop.
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import { Flame, Plus } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";

// ── Tipos de la API ──────────────────────────────────────────────────────────

interface TopSellerItem {
  productId: number;
  storeProductId: string;
  name: string;
  price: string | number;
  image: string | null;
  unit: string | null;
  category: string | null;
  stock: number | null;
  storeId: string;
  storeName: string;
  storeSlug: string;
}

interface ApiResponse {
  data: TopSellerItem[];
}

// ── Formato PE ───────────────────────────────────────────────────────────────

const formatPEN = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

// ── Props ────────────────────────────────────────────────────────────────────

interface StoreTopSellersProps {
  storeSlug: string;
  storeId: string;
  storeName: string;
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="w-[160px] sm:w-[176px] shrink-0 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden animate-pulse"
      aria-hidden="true"
    >
      <div className="h-[108px] bg-[var(--surface-sunken)]" />
      <div className="p-3 space-y-2">
        <div className="h-3 w-3/4 rounded bg-[var(--surface-sunken)]" />
        <div className="h-3 w-1/2 rounded bg-[var(--surface-sunken)]" />
        <div className="h-8 w-full rounded-xl bg-[var(--surface-sunken)]" />
      </div>
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

interface TopSellerCardProps {
  item: TopSellerItem;
  onAdd: () => void;
  added: boolean;
}

function TopSellerCard({ item, onAdd, added }: TopSellerCardProps) {
  const price = typeof item.price === "string" ? parseFloat(item.price) : item.price;
  const outOfStock = item.stock !== null && item.stock <= 0;

  return (
    <article
      className="w-[160px] sm:w-[176px] shrink-0 snap-start rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden flex flex-col transition-shadow hover:shadow-md hover:border-[var(--accent)]/40"
      aria-label={item.name}
    >
      {/* Imagen */}
      <div className="relative h-[108px] bg-[var(--surface-sunken)] overflow-hidden">
        {item.image ? (
          <Image
            src={item.image}
            alt={item.name}
            fill
            sizes="180px"
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span
              className="text-3xl text-[var(--text-tertiary)] select-none"
              aria-hidden
            >
              🛒
            </span>
          </div>
        )}
        {outOfStock && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="px-2 py-0.5 rounded-full bg-black/70 text-white text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide">
              Agotado
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-2 p-3 flex-1">
        <p className="text-sm font-bold text-[var(--text-primary)] leading-snug line-clamp-2 flex-1">
          {item.name}
        </p>
        <p className="text-base font-black text-[var(--accent)] tabular-nums leading-tight">
          {isNaN(price) ? "—" : formatPEN(price)}
        </p>
        <button
          type="button"
          onClick={onAdd}
          disabled={outOfStock}
          aria-label={`Agregar ${item.name} al carrito`}
          className={cn(
            "w-full h-9 rounded-xl flex items-center justify-center gap-1.5 text-sm font-black transition-all active:scale-95",
            added
              ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] border-2 border-[var(--accent)]/40"
              : outOfStock
              ? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed border-2 border-[var(--rule-soft)]"
              : "bg-[var(--accent)] text-white hover:brightness-110 shadow-sm hover:shadow-md",
          )}
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          {added ? "Agregado" : "Agregar"}
        </button>
      </div>
    </article>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function StoreTopSellers({
  storeSlug,
  storeId,
  storeName,
}: StoreTopSellersProps) {
  const [items, setItems] = useState<TopSellerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Tracks items recién agregados para feedback visual (desaparece en 1.2s)
  const [recentlyAdded, setRecentlyAdded] = useState<Set<string>>(new Set());

  const { addItem } = useMarketplaceCart();

  useEffect(() => {
    // Flag `cancelled` en vez de AbortController: evita el ruido "Uncaught
    // AbortError" de React 19 + Fast Refresh sin perder protección de stale.
    let cancelled = false;
    setLoading(true);
    setError(false);

    fetch(
      `/api/marketplace/catalog?storeSlug=${encodeURIComponent(storeSlug)}&sort=popular&limit=10`,
    )
      .then((r) => {
        if (!r.ok) throw new Error("fetch-error");
        return r.json() as Promise<ApiResponse>;
      })
      .then(({ data }) => {
        if (cancelled) return;
        setItems(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [storeSlug]);

  // Auto-ocultar si vacío o error
  if (!loading && (error || items.length === 0)) return null;

  const handleAdd = (item: TopSellerItem) => {
    const price =
      typeof item.price === "string" ? parseFloat(item.price) : item.price;
    addItem({
      storeId: item.storeId ?? storeId,
      storeName: item.storeName ?? storeName,
      storeSlug: item.storeSlug ?? storeSlug,
      storeProductId: item.storeProductId,
      productId: item.productId,
      name: item.name,
      price: isNaN(price) ? 0 : price,
      basePrice: isNaN(price) ? 0 : price,
      image: item.image ?? null,
      unit: item.unit ?? null,
      category: item.category ?? null,
      quantity: 1,
    });

    // Feedback visual transitorio
    setRecentlyAdded((prev) => {
      const next = new Set(prev);
      next.add(item.storeProductId);
      return next;
    });
    setTimeout(() => {
      setRecentlyAdded((prev) => {
        const next = new Set(prev);
        next.delete(item.storeProductId);
        return next;
      });
    }, 1200);
  };

  return (
    <section
      aria-labelledby="top-sellers-heading"
      className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-1"
    >
      {/* Encabezado */}
      <div className="flex items-center gap-2 mb-4">
        <span
          className="inline-flex items-center justify-center h-8 w-8 rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
          aria-hidden
        >
          <Flame className="h-5 w-5" strokeWidth={2.25} />
        </span>
        <h2
          id="top-sellers-heading"
          className="text-base sm:text-lg font-black text-[var(--text-primary)] tracking-[var(--ls-tight)]"
        >
          Lo más pedido
        </h2>
        <span className="ml-auto text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
          {storeName}
        </span>
      </div>

      {/* Carrusel */}
      {loading ? (
        /* Skeletons no requieren HorizontalCarousel — layout directo */
        <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <HorizontalCarousel
          ariaLabel="Lo más pedido en esta tienda"
          itemWidthClass="w-[160px] sm:w-[176px] shrink-0 snap-start"
          showBar={false}
          showNav
        >
          {items.map((item) => (
            <TopSellerCard
              key={item.storeProductId}
              item={item}
              onAdd={() => handleAdd(item)}
              added={recentlyAdded.has(item.storeProductId)}
            />
          ))}
        </HorizontalCarousel>
      )}
    </section>
  );
}
