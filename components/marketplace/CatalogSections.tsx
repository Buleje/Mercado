"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Star,
  Flame,
  Award,
  Percent,
  Package,
  ShoppingCart,
  Store as StoreIcon,
  Zap,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface SectionProduct {
  storeProductId: string;
  productId: number;
  name: string;
  price: number;
  image: string | null;
  unit: string | null;
  category: string | null;
  stock: number;
  storeId: string;
  storeName: string;
  storeSlug: string;
  storeLogo: string | null;
  storeRating: number;
  // extras
  discountPercent?: number;
  promoName?: string | null;
  rank?: number;
}

interface SectionsData {
  featured: SectionProduct[];
  flashDeals: SectionProduct[];
  topSellers: SectionProduct[];
  liquidations: SectionProduct[];
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(n);

/* ── Mini Product Card ─────────────────────────────────────────────────────── */

function MiniProductCard({
  product,
  badge,
  badgeColor,
  index,
}: {
  product: SectionProduct;
  badge?: React.ReactNode;
  badgeColor?: string;
  index: number;
}) {
  const { addItem } = useMarketplaceCart();
  const [justAdded, setJustAdded] = useState(false);

  const handleAdd = () => {
    addItem({
      storeId: product.storeId,
      storeName: product.storeName,
      storeSlug: product.storeSlug,
      storeProductId: product.storeProductId,
      productId: product.productId,
      name: product.name,
      price: product.price,
      image: product.image,
      unit: product.unit,
    });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="group relative bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border overflow-hidden shadow-sm hover:shadow-lg hover:border-primary/30 transition-all duration-300 hover:-translate-y-0.5"
    >
      {/* Badge */}
      {badge && (
        <span
          className={cn(
            "absolute top-2 left-2 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide",
            badgeColor ?? "bg-primary/10 text-primary"
          )}
        >
          {badge}
        </span>
      )}

      {/* Image */}
      <Link href={`/marketplace/${product.storeSlug}`}>
        <div className="relative aspect-square bg-gray-50 dark:bg-surface overflow-hidden">
          {product.image ? (
            <Image
              src={product.image}
              alt={product.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-10 w-10 text-gray-200 dark:text-gray-700" />
            </div>
          )}
        </div>
      </Link>

      {/* Content */}
      <div className="p-3">
        <Link href={`/marketplace/${product.storeSlug}`}>
          <p className="text-xs font-bold text-gray-900 dark:text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors">
            {product.name}
          </p>
        </Link>

        <div className="flex items-center gap-1 mt-1.5">
          <span className="text-sm font-extrabold text-primary">
            {fmt(product.price)}
          </span>
          {product.discountPercent ? (
            <span className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-950/30 px-1.5 py-0.5 rounded-full">
              -{product.discountPercent}%
            </span>
          ) : null}
        </div>

        {/* Store info */}
        <div className="flex items-center gap-1 mt-1.5 text-[10px] text-gray-400 dark:text-muted">
          <StoreIcon className="h-2.5 w-2.5" />
          <span className="truncate">{product.storeName}</span>
          {product.storeRating > 0 && (
            <>
              <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400 ml-0.5" />
              <span>{product.storeRating.toFixed(1)}</span>
            </>
          )}
        </div>

        {/* Add to cart */}
        <button
          onClick={handleAdd}
          disabled={product.stock === 0}
          className={cn(
            "mt-2 w-full rounded-lg py-1.5 text-xs font-bold flex items-center justify-center gap-1 transition-all",
            product.stock === 0
              ? "bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
              : justAdded
                ? "bg-emerald-500 text-white"
                : "bg-primary/10 text-primary hover:bg-primary hover:text-white"
          )}
        >
          {product.stock === 0 ? (
            "Agotado"
          ) : justAdded ? (
            "✓ Agregado"
          ) : (
            <>
              <ShoppingCart className="h-3 w-3" />
              Agregar
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}

/* ── Section Wrapper ───────────────────────────────────────────────────────── */

function Section({
  title,
  icon,
  accentColor,
  children,
  emptyMessage,
  isEmpty,
}: {
  title: string;
  icon: React.ReactNode;
  accentColor: string;
  children: React.ReactNode;
  emptyMessage?: string;
  isEmpty: boolean;
}) {
  if (isEmpty) return null;

  return (
    <div className="mb-10">
      <div className="flex items-center gap-2.5 mb-4">
        <span
          className={cn(
            "inline-flex items-center justify-center h-8 w-8 rounded-xl",
            accentColor
          )}
        >
          {icon}
        </span>
        <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 dark:text-foreground">
          {title}
        </h2>
      </div>
      {children}
      {isEmpty && emptyMessage && (
        <p className="text-sm text-gray-400 dark:text-muted text-center py-6">
          {emptyMessage}
        </p>
      )}
    </div>
  );
}

/* ── Skeleton ──────────────────────────────────────────────────────────────── */

function SectionSkeleton() {
  return (
    <div className="mb-10">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="h-8 w-8 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        <div className="h-5 w-40 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-gray-100 dark:border-card-border bg-white dark:bg-card overflow-hidden">
            <div className="aspect-square bg-gray-100 dark:bg-surface animate-pulse" />
            <div className="p-3 space-y-2">
              <div className="h-3 bg-gray-100 dark:bg-surface rounded w-3/4 animate-pulse" />
              <div className="h-4 bg-gray-100 dark:bg-surface rounded w-1/2 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Top Sellers Podium Card ───────────────────────────────────────────────── */

function TopSellerCard({
  product,
  rank,
}: {
  product: SectionProduct;
  rank: number;
}) {
  const { addItem } = useMarketplaceCart();
  const [justAdded, setJustAdded] = useState(false);

  const rankColors = {
    1: { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-600 dark:text-amber-400", ring: "ring-amber-300 dark:ring-amber-600", medal: "🥇" },
    2: { bg: "bg-gray-100 dark:bg-gray-700/40", text: "text-gray-600 dark:text-gray-300", ring: "ring-gray-300 dark:ring-gray-500", medal: "🥈" },
    3: { bg: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-600 dark:text-orange-400", ring: "ring-orange-300 dark:ring-orange-600", medal: "🥉" },
  } as const;

  const colors = rankColors[rank as 1 | 2 | 3] ?? rankColors[3];

  const handleAdd = () => {
    addItem({
      storeId: product.storeId,
      storeName: product.storeName,
      storeSlug: product.storeSlug,
      storeProductId: product.storeProductId,
      productId: product.productId,
      name: product.name,
      price: product.price,
      image: product.image,
      unit: product.unit,
    });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: rank * 0.1 }}
      className={cn(
        "relative bg-white dark:bg-card rounded-2xl border-2 overflow-hidden shadow-md hover:shadow-xl transition-all duration-300",
        `ring-2 ${colors.ring}`
      )}
    >
      {/* Rank badge */}
      <span className="absolute top-3 left-3 z-10 text-2xl">{colors.medal}</span>
      <span
        className={cn(
          "absolute top-3 right-3 z-10 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black",
          colors.bg,
          colors.text
        )}
      >
        <TrendingUp className="h-3 w-3" />
        #{rank} Top
      </span>

      {/* Image */}
      <Link href={`/marketplace/${product.storeSlug}`}>
        <div className="relative aspect-[4/3] bg-gray-50 dark:bg-surface overflow-hidden">
          {product.image ? (
            <Image
              src={product.image}
              alt={product.name}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 33vw, 33vw"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-12 w-12 text-gray-200 dark:text-gray-700" />
            </div>
          )}
        </div>
      </Link>

      <div className="p-4">
        <Link href={`/marketplace/${product.storeSlug}`}>
          <h3 className="font-extrabold text-gray-900 dark:text-foreground text-base leading-tight line-clamp-2 hover:text-primary transition-colors">
            {product.name}
          </h3>
        </Link>

        <p className="text-lg font-extrabold text-primary mt-1.5">{fmt(product.price)}</p>

        <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-500 dark:text-muted">
          <StoreIcon className="h-3 w-3" />
          <span className="truncate">{product.storeName}</span>
          {product.storeRating > 0 && (
            <span className="inline-flex items-center gap-0.5 text-amber-500 font-bold">
              <Star className="h-3 w-3 fill-amber-400" />
              {product.storeRating.toFixed(1)}
            </span>
          )}
        </div>

        <button
          onClick={handleAdd}
          disabled={product.stock === 0}
          className={cn(
            "mt-3 w-full rounded-xl py-2 text-sm font-bold flex items-center justify-center gap-1.5 transition-all",
            product.stock === 0
              ? "bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
              : justAdded
                ? "bg-emerald-500 text-white"
                : "bg-primary text-white hover:bg-primary/90 shadow-md shadow-primary/20"
          )}
        >
          {product.stock === 0 ? "Agotado" : justAdded ? "✓ Agregado" : (
            <>
              <ShoppingCart className="h-3.5 w-3.5" />
              Agregar al carrito
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}

/* ── Main Component ────────────────────────────────────────────────────────── */

export default function CatalogSections() {
  const [data, setData] = useState<SectionsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/marketplace/catalog/sections");
        if (res.ok && !cancelled) {
          const json = await res.json();
          setData(json.data ?? null);
        }
      } catch {
        /* silent — sections are non-critical */
      }
      if (!cancelled) setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 mt-8">
        <SectionSkeleton />
        <SectionSkeleton />
      </div>
    );
  }

  if (!data) return null;

  const hasFeatured = data.featured.length > 0;
  const hasFlashDeals = data.flashDeals.length > 0;
  const hasTopSellers = data.topSellers.length > 0;
  const hasLiquidations = data.liquidations.length > 0;

  if (!hasFeatured && !hasFlashDeals && !hasTopSellers && !hasLiquidations) {
    return null;
  }

  return (
    <div className="mt-8 space-y-2">
      {/* ── Flash Deals ── */}
      <Section
        title="Ofertas Relámpago"
        icon={<Zap className="h-4 w-4 text-red-500" />}
        accentColor="bg-red-50 dark:bg-red-950/30"
        isEmpty={!hasFlashDeals}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {data.flashDeals.map((product, i) => (
            <MiniProductCard
              key={product.storeProductId}
              product={product}
              badge={
                <>
                  <Percent className="h-2.5 w-2.5" />
                  {product.discountPercent ? `-${product.discountPercent}%` : "Oferta"}
                </>
              }
              badgeColor="bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400"
              index={i}
            />
          ))}
        </div>
      </Section>

      {/* ── Top 3 Best Sellers ── */}
      <Section
        title="Top 3 Más Vendidos"
        icon={<Award className="h-4.5 w-4.5 text-amber-500" />}
        accentColor="bg-amber-50 dark:bg-amber-950/30"
        isEmpty={!hasTopSellers}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {data.topSellers.slice(0, 3).map((product) => (
            <TopSellerCard
              key={product.storeProductId}
              product={product}
              rank={product.rank ?? 1}
            />
          ))}
        </div>
      </Section>

      {/* ── Featured Products ── */}
      <Section
        title="Productos Destacados"
        icon={<Star className="h-4 w-4 text-primary" />}
        accentColor="bg-primary/10"
        isEmpty={!hasFeatured}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {data.featured.map((product, i) => (
            <MiniProductCard
              key={product.storeProductId}
              product={product}
              badge={
                <>
                  <Star className="h-2.5 w-2.5" />
                  Destacado
                </>
              }
              badgeColor="bg-primary/10 text-primary"
              index={i}
            />
          ))}
        </div>
      </Section>

      {/* ── Liquidations ── */}
      <Section
        title="Últimas Unidades"
        icon={<Flame className="h-4 w-4 text-orange-500" />}
        accentColor="bg-orange-50 dark:bg-orange-950/30"
        isEmpty={!hasLiquidations}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {data.liquidations.map((product, i) => (
            <MiniProductCard
              key={product.storeProductId}
              product={product}
              badge={
                <>
                  <Flame className="h-2.5 w-2.5" />
                  ¡Últimas {product.stock}!
                </>
              }
              badgeColor="bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400"
              index={i}
            />
          ))}
        </div>
      </Section>
    </div>
  );
}
