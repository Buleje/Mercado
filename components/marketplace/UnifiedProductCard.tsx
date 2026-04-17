"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ShoppingCart,
  Package,
  Store as StoreIcon,
  Star,
  GitCompareArrows,
  Check,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCartWithUndo } from "@/hooks/use-cart-with-undo";
import { useHoverPrefetch } from "@/hooks/use-hover-prefetch";
import { useCompare } from "@/contexts/compare-context";
import { QuickViewModal } from "@/components/customer/journey";

/* ── Tipos públicos ─────────────────────────────────────────────────────────── */

export interface UnifiedProductCardProduct {
  id: number;
  name: string;
  price: number;
  originalPrice?: number;
  image?: string | null;
  storeName?: string;
  storeSlug?: string;
  storeId?: string;
  storeProductId?: string;
  storeRating?: number;
  unit?: string | null;
  category?: string;
  stock?: number;
  discount?: number;
}

export type UnifiedProductCardVariant = "default" | "flash" | "top" | "liquidation";

export interface UnifiedProductCardProps {
  product: UnifiedProductCardProduct;
  variant?: UnifiedProductCardVariant;
  rank?: number;
  endsAt?: Date;
  href?: string;
  /** Índice en la lista, para escalonar la animación de entrada */
  index?: number;
}

/* ── Formateador de moneda ──────────────────────────────────────────────────── */

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

/* ── Countdown hook ─────────────────────────────────────────────────────────── */

function useCountdown(endsAt?: Date): string | null {
  const [remaining, setRemaining] = useState<string | null>(null);

  const compute = useCallback(() => {
    if (!endsAt) return null;
    const diff = endsAt.getTime() - Date.now();
    if (diff <= 0) return "Expirado";
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const s = Math.floor((diff % 60_000) / 1000);
    if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [endsAt]);

  useEffect(() => {
    if (!endsAt) return;
    setRemaining(compute());
    const id = setInterval(() => setRemaining(compute()), 1000);
    return () => clearInterval(id);
  }, [endsAt, compute]);

  return remaining;
}

/* ── Badge de variante (overlay sobre la imagen) ───────────────────────────── */

function VariantBadge({
  variant,
  rank,
  discount,
  stock,
  countdown,
}: {
  variant: UnifiedProductCardVariant;
  rank?: number;
  discount?: number;
  stock?: number;
  countdown: string | null;
}) {
  if (variant === "default") return null;

  if (variant === "top" && rank !== undefined) {
    const rankMeta: Record<
      number,
      { bg: string; text: string; label: string }
    > = {
      1: { bg: "bg-amber-400 dark:bg-amber-500", text: "text-white", label: "🥇" },
      2: { bg: "bg-gray-300 dark:bg-gray-500", text: "text-gray-800 dark:text-white", label: "🥈" },
      3: { bg: "bg-orange-400 dark:bg-orange-500", text: "text-white", label: "🥉" },
    };
    const meta = rankMeta[rank] ?? rankMeta[3];
    return (
      <span
        className={cn(
          "absolute top-2 left-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-black shadow-md",
          meta.bg,
          meta.text
        )}
        aria-label={`Posición ${rank}`}
      >
        {meta.label}
      </span>
    );
  }

  if (variant === "flash") {
    return (
      <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-1">
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-md">
          {discount ? `-${discount}%` : "OFERTA"}
        </span>
        {countdown && countdown !== "Expirado" && (
          <span className="inline-flex items-center rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-mono font-bold text-white">
            {countdown}
          </span>
        )}
      </div>
    );
  }

  if (variant === "liquidation") {
    return (
      <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-amber-400 dark:bg-amber-500 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-md">
        {stock !== undefined && stock > 0 ? `¡Solo ${stock}!` : "LIQUIDACION"}
      </span>
    );
  }

  return null;
}

/* ── Componente principal ───────────────────────────────────────────────────── */

export default function UnifiedProductCard({
  product,
  variant = "default",
  rank,
  endsAt,
  href,
  index = 0,
}: UnifiedProductCardProps) {
  const { addItemWithUndo } = useCartWithUndo();
  const { add: addToCompare, remove: removeFromCompare, has: isInCompare } = useCompare();
  const [justAdded, setJustAdded] = useState(false);
  const [compareLimitMsg, setCompareLimitMsg] = useState(false);
  const [quickViewOpen, setQuickViewOpen] = useState(false);
  const countdown = useCountdown(variant === "flash" ? endsAt : undefined);

  const productHref =
    href ??
    (product.storeSlug ? `/marketplace/${product.storeSlug}` : "/marketplace");

  const { onMouseEnter, onMouseLeave } = useHoverPrefetch(productHref);

  const isOutOfStock = product.stock === 0;
  const inCompare = isInCompare(product.id);

  const handleCompare = useCallback(() => {
    if (inCompare) {
      removeFromCompare(product.id);
      return;
    }
    const added = addToCompare({
      productId: product.id,
      storeSlug: product.storeSlug ?? "",
      name: product.name,
      price: product.price,
      image: product.image,
      rating: product.storeRating,
      stock: product.stock,
    });
    if (!added) {
      setCompareLimitMsg(true);
      setTimeout(() => setCompareLimitMsg(false), 2500);
    }
  }, [inCompare, addToCompare, removeFromCompare, product]);

  const handleAdd = useCallback(() => {
    if (isOutOfStock) return;
    addItemWithUndo({
      storeId: product.storeId ?? "",
      storeName: product.storeName ?? "",
      storeSlug: product.storeSlug ?? "",
      storeProductId: product.storeProductId ?? String(product.id),
      productId: product.id,
      name: product.name,
      price: product.price,
      image: product.image ?? null,
      unit: product.unit ?? null,
    });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1200);
  }, [addItemWithUndo, product, isOutOfStock]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="group relative flex w-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/30 dark:border-card-border dark:bg-card"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* ── Badges de variante ── */}
      <VariantBadge
        variant={variant}
        rank={rank}
        discount={product.discount}
        stock={product.stock}
        countdown={countdown}
      />

      {/* ── Imagen ── */}
      <div className="relative">
        <Link href={productHref} className="block">
          <div className="relative aspect-square overflow-hidden rounded-t-2xl bg-gray-50 dark:bg-surface">
            {product.image ? (
              <Image
                src={product.image}
                alt={product.name}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Package className="h-10 w-10 text-gray-200 dark:text-gray-700" aria-hidden="true" />
              </div>
            )}
          </div>
        </Link>
        {/* Quick view trigger — visible en hover desktop, tap-tap mobile */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setQuickViewOpen(true);
          }}
          className="absolute top-2 right-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 dark:bg-card/95 backdrop-blur-sm border border-gray-200 dark:border-card-border opacity-0 group-hover:opacity-100 hover:bg-white dark:hover:bg-card transition-opacity shadow-sm"
          aria-label={`Vista rápida de ${product.name}`}
        >
          <Eye className="h-3.5 w-3.5 text-gray-700 dark:text-gray-200" strokeWidth={1.75} aria-hidden />
        </button>
      </div>

      {/* ── Contenido ── */}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {/* Nombre */}
        <Link href={productHref}>
          <p className="line-clamp-2 text-xs font-bold leading-snug text-gray-900 transition-colors group-hover:text-primary dark:text-foreground">
            {product.name}
          </p>
        </Link>

        {/* Precio */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-extrabold text-primary">
            {fmt(product.price)}
          </span>
          {product.originalPrice && product.originalPrice > product.price && (
            <span className="text-[10px] text-gray-400 line-through dark:text-muted">
              {fmt(product.originalPrice)}
            </span>
          )}
          {product.discount && product.discount > 0 && !product.originalPrice && (
            <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-500 dark:bg-red-950/30">
              -{product.discount}%
            </span>
          )}
        </div>

        {/* Tienda */}
        {product.storeName && (
          <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-muted">
            <StoreIcon className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{product.storeName}</span>
            {product.storeRating !== undefined && product.storeRating > 0 && (
              <>
                <Star className="ml-0.5 h-2.5 w-2.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                <span>{product.storeRating.toFixed(1)}</span>
              </>
            )}
          </div>
        )}

        {/* Botón agregar al carrito — touch target mínimo 44px */}
        <button
          onClick={handleAdd}
          disabled={isOutOfStock}
          aria-label={
            isOutOfStock
              ? `${product.name} — agotado`
              : `Agregar ${product.name} al carrito`
          }
          className={cn(
            "mt-auto flex min-h-[44px] w-full items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-bold transition-all sm:min-h-0 sm:py-1.5",
            isOutOfStock
              ? "cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"
              : justAdded
                ? "bg-emerald-500 text-white"
                : "bg-primary/10 text-primary hover:bg-primary hover:text-white"
          )}
        >
          {isOutOfStock ? (
            "Agotado"
          ) : justAdded ? (
            "✓ Agregado"
          ) : (
            <>
              <ShoppingCart className="h-3 w-3" aria-hidden="true" />
              Agregar
            </>
          )}
        </button>

        {/* Botón comparar */}
        <button
          onClick={handleCompare}
          aria-label={
            inCompare
              ? `Quitar ${product.name} de la comparacion`
              : `Comparar ${product.name}`
          }
          aria-pressed={inCompare}
          className={cn(
            "flex w-full items-center justify-center gap-1 rounded-lg py-1 text-xs transition-colors",
            inCompare
              ? "font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
              : "text-gray-400 hover:text-gray-700 dark:text-gray-600 dark:hover:text-gray-300"
          )}
        >
          {inCompare ? (
            <>
              <Check className="h-3 w-3" aria-hidden="true" />
              Quitar de comparar
            </>
          ) : (
            <>
              <GitCompareArrows className="h-3 w-3" aria-hidden="true" />
              Comparar
            </>
          )}
        </button>

        {/* Aviso limite maximo */}
        {compareLimitMsg && (
          <p
            role="alert"
            className="rounded-md bg-amber-50 px-2 py-1 text-center text-[10px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
          >
            Maximo 3 productos para comparar
          </p>
        )}
      </div>

      {/* Quick view modal — monta on-demand al abrir */}
      {quickViewOpen && (
        <QuickViewModal
          open={quickViewOpen}
          onOpenChange={setQuickViewOpen}
          product={{
            id: product.id,
            name: product.name,
            price: product.price,
            originalPrice: product.originalPrice,
            image: product.image ?? "",
            category: product.category,
            unit: product.unit ?? undefined,
            stock: product.stock,
            badges: variant === "flash" && product.discount
              ? [{ label: `-${product.discount}% OFF`, variant: "accent" as const }]
              : variant === "liquidation"
                ? [{ label: "Liquidación", variant: "warning" as const }]
                : undefined,
          }}
          storeName={product.storeName}
          onAddToCart={async (qty) => {
            for (let i = 0; i < qty; i++) handleAdd();
          }}
        />
      )}
    </motion.div>
  );
}
