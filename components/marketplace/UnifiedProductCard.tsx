"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ShoppingCart,
  Store as StoreIcon,
  GitCompareArrows,
  Check,
  Heart,
  Timer,
} from "@buleje/design-system/icons";
import { MarketplaceItemPlaceholder } from "@buleje/design-system";
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
  description?: string | null;
  storeName?: string;
  storeSlug?: string;
  storeId?: string;
  storeProductId?: string;
  storeRating?: number;
  unit?: string | null;
  category?: string;
  stock?: number;
  discount?: number;
  /** Indica si el producto es peruano/nacional — muestra badge "PERUANO" */
  isPeruvian?: boolean;
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
  const { add: addToCompare, remove: removeFromCompare, has: isInCompare, items: compareItems, max: compareMax } = useCompare();
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
    if (compareItems.length >= compareMax) {
      setCompareLimitMsg(true);
      setTimeout(() => setCompareLimitMsg(false), 2000);
      return;
    }
    addToCompare({
      id: product.id,
      storeSlug: product.storeSlug ?? "",
      name: product.name,
      category: "",
      unit: "",
      price: product.price,
      image: product.image ?? "",
      rating: product.storeRating,
      stock: product.stock ?? undefined,
    });
  }, [inCompare, addToCompare, removeFromCompare, compareItems, compareMax, product]);

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

  /* ── Badges top-left ───────────────────────────────────────────── */
  const showOfertaBadge =
    variant === "flash" || variant === "liquidation" ||
    (product.discount != null && product.discount > 0);

  const ofertaLabel =
    variant === "liquidation"
      ? "LIQUIDACION"
      : product.discount
        ? `OFERTA -${product.discount}%`
        : "OFERTA";

  /* ── Rank badge (top variant) ─────────────────────────────────── */
  const rankColors: Record<number, string> = {
    1: "bg-[var(--color-primary)] text-white",
    2: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200",
    3: "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400",
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className={cn(
        "group relative flex w-full flex-col overflow-hidden rounded-xl",
        "border border-gray-100 bg-white dark:border-card-border dark:bg-card",
        "transition-all duration-300",
        "hover:-translate-y-0.5 hover:shadow-md hover:border-gray-200 dark:hover:border-card-border",
        isOutOfStock && "opacity-70",
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* ── Zona imagen ──────────────────────────────────────────────────────── */}
      <div className="relative">
        <Link href={productHref} className="block">
          <div className="relative aspect-square overflow-hidden rounded-t-xl bg-[var(--surface-sunken)] dark:bg-surface">
            {product.image ? (
              <Image
                src={product.image}
                alt={product.name}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
              />
            ) : (
              <MarketplaceItemPlaceholder />
            )}
          </div>
        </Link>

        {/* Badges top-left — apilados verticalmente */}
        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
          {/* Rank badge (variant top) */}
          {variant === "top" && rank !== undefined && (
            <span
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-black border border-[var(--rule-base)]",
                rankColors[rank] ?? rankColors[3],
              )}
              aria-label={`Posicion ${rank}`}
            >
              {rank}
            </span>
          )}

          {/* Oferta / liquidacion badge */}
          {showOfertaBadge && variant !== "top" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
              {ofertaLabel}
            </span>
          )}

          {/* Timer badge (flash) */}
          {variant === "flash" && countdown && countdown !== "Expirado" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--accent)]">
              <Timer className="h-3 w-3" aria-hidden />
              {countdown}
            </span>
          )}

          {/* Peruano badge */}
          {product.isPeruvian && (
            <span className="inline-flex items-center rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--accent)]">
              PERUANO
            </span>
          )}
        </div>

        {/* Acciones top-right — heart + compare, siempre visibles */}
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
          {/* Heart favorito */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setQuickViewOpen(true);
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-card border border-gray-200 dark:border-card-border shadow-sm transition-colors hover:border-gray-300 dark:hover:border-gray-600"
            aria-label={`Ver rapido ${product.name}`}
          >
            <Heart className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" strokeWidth={1.75} aria-hidden />
          </button>

          {/* Compare */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleCompare();
            }}
            aria-label={inCompare ? `Quitar ${product.name} de la comparacion` : `Comparar ${product.name}`}
            aria-pressed={inCompare}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-full border shadow-sm transition-colors",
              inCompare
                ? "bg-[var(--accent-soft)] border-[var(--accent)]/30 text-[var(--accent)]"
                : "bg-white dark:bg-card border-gray-200 dark:border-card-border text-gray-400 dark:text-gray-500 hover:border-gray-300 dark:hover:border-gray-600",
            )}
          >
            <GitCompareArrows className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          </button>
        </div>

        {/* Overlay agotado */}
        {isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[1px] rounded-t-xl">
            <span className="rounded-full bg-gray-800/80 px-3 py-1 text-[length:var(--ts-2xs)] font-bold text-white">
              Agotado
            </span>
          </div>
        )}
      </div>

      {/* ── Contenido ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-1 p-3">
        {/* Nombre */}
        <Link href={productHref}>
          <p className="line-clamp-2 text-xs font-bold leading-snug text-gray-900 dark:text-foreground group-hover:text-[var(--accent)] transition-colors">
            {product.name}
          </p>
        </Link>

        {/* "Ver detalles →" link */}
        <Link
          href={productHref}
          className="text-[length:var(--ts-2xs)] font-semibold text-[var(--accent)] hover:underline"
        >
          Ver detalles &rarr;
        </Link>

        {/* Descripcion (opcional) */}
        {product.description && (
          <p className="line-clamp-2 text-[length:var(--ts-2xs)] text-gray-400 dark:text-muted leading-snug">
            {product.description}
          </p>
        )}

        {/* Tienda */}
        {product.storeName && (
          <div className="flex items-center gap-1 text-[length:var(--ts-2xs)] text-gray-400 dark:text-muted">
            <StoreIcon className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{product.storeName}</span>
          </div>
        )}

        {/* Precio + CTA circular */}
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <div>
            {/* Precio tachado original */}
            {product.originalPrice && product.originalPrice > product.price && (
              <span className="block text-[length:var(--ts-2xs)] text-gray-400 line-through dark:text-muted">
                {fmt(product.originalPrice)}
              </span>
            )}
            {/* Precio actual */}
            <div className="flex items-baseline gap-1">
              <span className="text-base font-extrabold text-gray-900 dark:text-foreground leading-none">
                {fmt(product.price)}
              </span>
              {product.unit && (
                <span className="text-[length:var(--ts-2xs)] text-gray-400 dark:text-muted">
                  / {product.unit}
                </span>
              )}
            </div>
            {/* Stock */}
            {product.stock != null && product.stock > 0 && (
              <span className="text-[length:var(--ts-2xs)] text-gray-400 dark:text-muted">
                Stock: {product.stock} {product.unit ?? "unidad"}
              </span>
            )}
          </div>

          {/* CTA circular teal */}
          <button
            type="button"
            onClick={handleAdd}
            disabled={isOutOfStock}
            aria-label={
              isOutOfStock
                ? `${product.name} — agotado`
                : `Agregar ${product.name} al carrito`
            }
            className={cn(
              "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-200",
              isOutOfStock
                ? "bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed"
                : justAdded
                  ? "bg-emerald-500 text-white scale-90"
                  : "bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 hover:scale-105 active:scale-95 shadow-sm",
            )}
          >
            {justAdded ? (
              <Check className="h-4 w-4" aria-hidden />
            ) : (
              <ShoppingCart className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>

        {/* Aviso limite comparar */}
        {compareLimitMsg && (
          <p
            role="alert"
            className="rounded-md bg-amber-50 px-2 py-1 text-center text-[length:var(--ts-2xs)] text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
          >
            Maximo 3 productos para comparar
          </p>
        )}
      </div>

      {/* Quick view modal */}
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
            badges:
              variant === "flash" && product.discount
                ? [{ label: `-${product.discount}% OFF`, variant: "accent" as const }]
                : variant === "liquidation"
                  ? [{ label: "Liquidacion", variant: "warning" as const }]
                  : undefined,
          }}
          storeName={product.storeName}
          onAddToCart={async (qty) => {
            for (let i = 0; i < qty; i++) handleAdd();
          }}
        />
      )}
    </motion.article>
  );
}
