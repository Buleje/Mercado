"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Sparkles, Plus, ShoppingCart, Package } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CartItem {
  id: number;
  category: string;
  name: string;
}

interface RecommendedProduct {
  id: number;
  name: string;
  category: string;
  price: number;
  image?: string;
  unit?: string;
  popularity?: number;
}

interface RecommendedProductsProps {
  currentCartItems: CartItem[];
  onAddToCart: (productId: number) => void;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="snap-start shrink-0 w-[140px] rounded-xl bg-white dark:bg-card border border-gray-100 dark:border-white/5 overflow-hidden shadow-sm animate-pulse">
      <div className="aspect-square bg-gray-100 dark:bg-white/5" />
      <div className="p-2.5 space-y-2">
        <div className="h-3 bg-gray-100 dark:bg-white/5 rounded-full w-4/5" />
        <div className="h-3 bg-gray-100 dark:bg-white/5 rounded-full w-3/5" />
        <div className="h-7 bg-gray-100 dark:bg-white/5 rounded-lg w-full mt-1" />
      </div>
    </div>
  );
}

// ── Product Card ──────────────────────────────────────────────────────────────

interface ProductCardProps {
  product: RecommendedProduct;
  onAdd: (id: number) => void;
  justAdded: boolean;
}

function ProductCard({ product, onAdd, justAdded }: ProductCardProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className={cn(
        "snap-start shrink-0 w-[140px] rounded-xl bg-white dark:bg-card",
        "border border-gray-100 dark:border-white/5",
        "shadow-sm hover:shadow-md transition-all duration-200",
        "overflow-hidden group",
      )}
    >
      {/* Imagen */}
      <div className="aspect-square relative bg-gray-50 dark:bg-white/[0.03] overflow-hidden">
        {product.image && !imgError ? (
          /* eslint-disable-next-line @next/next/no-img-element -- URLs externas dinámicas de productos */
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="h-8 w-8 text-gray-200 dark:text-white/10" />
          </div>
        )}

        {/* Badge de categoría */}
        <span className="absolute top-1.5 left-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide bg-white/90 dark:bg-black/50 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded-full backdrop-blur-sm leading-none">
          {product.category}
        </span>
      </div>

      {/* Info */}
      <div className="p-2.5 space-y-1.5">
        <p className="text-[12px] font-semibold text-gray-900 dark:text-foreground line-clamp-2 leading-tight">
          {product.name}
        </p>

        {product.unit && (
          <p className="text-[length:var(--ts-2xs)] text-gray-400 dark:text-muted leading-none">
            {product.unit}
          </p>
        )}

        <div className="flex items-center justify-between gap-1 pt-0.5">
          <span className="text-sm font-extrabold text-primary dark:text-primary-light leading-none">
            S/{product.price.toFixed(2)}
          </span>

          {/* Botón agregar — touch target 44x44 */}
          <button
            onClick={() => onAdd(product.id)}
            aria-label={`Agregar ${product.name} al carrito`}
            className={cn(
              "min-h-[44px] min-w-[44px] -mr-1 -mb-1 flex items-center justify-center gap-0.5",
              "rounded-xl text-white text-[length:var(--ts-2xs)] font-bold",
              "transition-all duration-200 active:scale-90",
              justAdded
                ? "bg-emerald-500 dark:bg-emerald-600"
                : "bg-primary hover:bg-primary-dark dark:bg-primary dark:hover:bg-primary-dark",
            )}
          >
            {justAdded ? (
              <span className="text-[length:var(--ts-2xs)] px-1">✓</span>
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Fisher–Yates shuffle (deterministic fallback sin popularidad) ─────────────

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function RecommendedProducts({
  currentCartItems,
  onAddToCart,
}: RecommendedProductsProps) {
  const [recommendations, setRecommendations] = useState<RecommendedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [justAdded, setJustAdded] = useState<Set<number>>(new Set());
  const fetchedKeyRef = useRef<string>("");

  // Derivados estables de las props
  const cartIds = currentCartItems.map((i) => i.id);
  const cartCategories = [...new Set(currentCartItems.map((i) => i.category))];

  const fetchRecommendations = useCallback(async () => {
    // Evitar re-fetch si el carrito no cambió
    const key = `${cartIds.sort().join(",")}_${cartCategories.sort().join(",")}`;
    if (key === fetchedKeyRef.current) return;
    fetchedKeyRef.current = key;

    setLoading(true);

    const cartIdSet = new Set(cartIds);

    // ── Intento 1: endpoint /api/recommendations ───────────────────────────
    if (cartCategories.length > 0) {
      try {
        const params = new URLSearchParams({
          categories: cartCategories.join(","),
          exclude: cartIds.join(","),
        });
        const res = await fetch(`/api/recommendations?${params}`);
        if (res.ok) {
          const data = await res.json();
          const list: RecommendedProduct[] = Array.isArray(data)
            ? data
            : data.data ?? data.products ?? [];
          const filtered = list.filter((p) => !cartIdSet.has(p.id)).slice(0, 6);
          if (filtered.length >= 2) {
            setRecommendations(filtered);
            setLoading(false);
            return;
          }
        }
      } catch {
        // caer al fallback
      }
    }

    // ── Fallback: /api/products filtrado en cliente ────────────────────────
    try {
      const res = await fetch("/api/products");
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const raw = await res.json();
      const allProducts: RecommendedProduct[] = Array.isArray(raw)
        ? raw
        : raw.data ?? raw.products ?? [];

      // 1. Mismas categorías que el carrito, excluir los ya agregados
      let pool = allProducts.filter(
        (p) =>
          !cartIdSet.has(p.id) &&
          cartCategories.includes(p.category),
      );

      // 2. Si no hay suficientes del mismo category, completar con cualquier producto
      if (pool.length < 4) {
        const extraPool = allProducts.filter(
          (p) => !cartIdSet.has(p.id) && !pool.some((x) => x.id === p.id),
        );
        pool = [...pool, ...extraPool];
      }

      // 3. Ordenar: por popularidad desc si existe, si no, shuffle
      const hasPop = pool.some((p) => typeof p.popularity === "number");
      const sorted = hasPop
        ? [...pool].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
        : shuffleArray(pool);

      setRecommendations(sorted.slice(0, 6));
    } catch {
      // silencioso — no renderizar nada
    } finally {
      setLoading(false);
    }
  }, [cartIds.join(","), cartCategories.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  // Feedback visual de "agregado"
  const handleAdd = (productId: number) => {
    onAddToCart(productId);
    setJustAdded((prev) => new Set(prev).add(productId));
    setTimeout(() => {
      setJustAdded((prev) => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }, 1500);
  };

  // ── Esqueleto de carga ────────────────────────────────────────────────────
  if (loading) {
    return (
      <section className="w-full px-4 py-3">
        {/* Header skeleton */}
        <div className="flex items-center gap-2 mb-3">
          <div className="h-4 w-4 rounded-full bg-gray-100 dark:bg-white/5 animate-pulse" />
          <div className="h-4 w-44 rounded-full bg-gray-100 dark:bg-white/5 animate-pulse" />
        </div>
        {/* Row skeleton */}
        <div
          className="flex gap-3 overflow-hidden"
          aria-hidden="true"
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </section>
    );
  }

  // ── Sin resultados: no renderizar nada ───────────────────────────────────
  if (recommendations.length === 0) return null;

  // ── Vista principal ───────────────────────────────────────────────────────
  // TODO(#1): from-[#f0faf9] is a non-standard teal-tinted white used in section bg — no token exists yet
  return (
    <section
      aria-label="Productos recomendados"
      className="w-full px-4 py-3 bg-linear-to-b from-[#f0faf9]/60 to-transparent dark:from-primary/5 dark:to-transparent"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-secondary shrink-0" aria-hidden="true" />
        <h3 className="text-sm font-bold text-gray-800 dark:text-foreground tracking-tight">
          También te puede interesar
        </h3>
        <ShoppingCart
          className="h-3.5 w-3.5 text-gray-300 dark:text-white/20 ml-auto shrink-0"
          aria-hidden="true"
        />
      </div>

      {/* Scroll horizontal con snap */}
      <div
        role="list"
        className={cn(
          "flex gap-3 overflow-x-auto pb-2",
          "snap-x snap-mandatory scroll-smooth",
          "scrollbar-hide",
          // Padding final para que el último card no quede pegado al borde
          "pr-4 -mr-4",
        )}
      >
        {recommendations.map((product) => (
          <div key={product.id} role="listitem">
            <ProductCard
              product={product}
              onAdd={handleAdd}
              justAdded={justAdded.has(product.id)}
            />
          </div>
        ))}
      </div>

      {/* Indicador de scroll (solo cuando hay más de 3 items) */}
      {recommendations.length > 3 && (
        <p className="text-[length:var(--ts-2xs)] text-gray-300 dark:text-white/20 text-right mt-1.5 select-none">
          Desliza para ver más →
        </p>
      )}
    </section>
  );
}
