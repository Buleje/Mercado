"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { m as motion } from "framer-motion";
import {
  ShoppingCart,
  Store as StoreIcon,
  GitCompareArrows,
  Check,
  Heart,
  Timer,
} from "@buleje/design-system/icons";
// MarketplaceItemPlaceholder reemplazado por ProductImageFallback (audit P12).

// Audit P12: fallback amable para productos sin foto. Antes mostraba un
// placeholder vectorial gris genérico que parecía bug; ahora muestra emoji
// grande de la categoría + nombre del producto sobre fondo de marca + CTA
// honesto "Sin foto · Avisanos para subirla". Convierte un negativo en
// invitación al bodeguero a colaborar con la curaduría visual.
const CATEGORY_EMOJI: Record<string, string> = {
  abarrotes: "🥫",
  bebidas: "🥤",
  carnes: "🥩",
  lacteos: "🥛",
  frutas: "🍎",
  verduras: "🥬",
  panaderia: "🥖",
  panadería: "🥖",
  golosinas: "🍬",
  limpieza: "🧴",
  hogar: "🏠",
  mascotas: "🐶",
  bebes: "👶",
  bebés: "👶",
  farmacia: "💊",
  ferreteria: "🔧",
  ferretería: "🔧",
  pollo: "🍗",
  polleria: "🍗",
  pollería: "🍗",
  pescados: "🐟",
  congelados: "🧊",
  default: "🛒",
};
function ProductImageFallback({ name, category }: { name?: string | null; category?: string | null }) {
  const key = (category ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const emoji = CATEGORY_EMOJI[key] ?? CATEGORY_EMOJI.default;
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center text-center px-3 bg-linear-to-br from-[var(--accent-soft)] to-[var(--surface-sunken)]"
      aria-label="Producto sin foto"
    >
      <span className="text-5xl mb-2" aria-hidden>{emoji}</span>
      {name && (
        <p className="text-xs font-bold text-[var(--text-primary)] leading-tight line-clamp-2">
          {name}
        </p>
      )}
      <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
        Sin foto
      </p>
    </div>
  );
}
import { cn } from "@/lib/utils";
import { useCartWithUndo } from "@/hooks/use-cart-with-undo";
import { useMarketplaceCart, modifierHashOf } from "@/hooks/use-marketplace-cart";
import { useHoverPrefetch } from "@/hooks/use-hover-prefetch";
import { useCompare } from "@/contexts/compare-context";
import { QuickViewModal } from "@/components/customer/journey";
import ProductModifierModal from "@/components/marketplace/ProductModifierModal";
import type { DbStoreProductModifierGroup } from "@/lib/db/marketplace.db";

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
  /** Grupos de modificadores configurados — si presente, abre selector pre-add. */
  modifierGroups?: DbStoreProductModifierGroup[];
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
  const { items: cartItems } = useMarketplaceCart();
  const { add: addToCompare, remove: removeFromCompare, has: isInCompare, items: compareItems, max: compareMax } = useCompare();
  const [justAdded, setJustAdded] = useState(false);
  const [compareLimitMsg, setCompareLimitMsg] = useState(false);
  const [quickViewOpen, setQuickViewOpen] = useState(false);
  const [modifierModalOpen, setModifierModalOpen] = useState(false);
  // Re-edit: cuando el cliente clickea "Editar" en el AddedToCartDrawer,
  // capturamos el evento global y abrimos nuestro modal con la selección
  // inicial poblada desde la línea actual del cart.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ storeId: string; productId: number }>).detail;
      if (
        detail &&
        detail.storeId === (product.storeId ?? "") &&
        detail.productId === product.id
      ) {
        setModifierModalOpen(true);
      }
    };
    window.addEventListener("buleje:reedit-modifiers", handler);
    return () => window.removeEventListener("buleje:reedit-modifiers", handler);
  }, [product.storeId, product.id]);
  const countdown = useCountdown(variant === "flash" ? endsAt : undefined);

  // Cantidad ya en el carrito de ESTA tienda — se usa para mostrar contador
  // visible en la card y dar feedback inmediato sin abrir el drawer.
  const inCartQty = useMemo(() => {
    if (!product.storeId) return 0;
    const found = cartItems.find(
      (i) => i.productId === product.id && i.storeId === product.storeId,
    );
    return found?.quantity ?? 0;
  }, [cartItems, product.id, product.storeId]);

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

  const hasModifiers =
    Array.isArray(product.modifierGroups) && product.modifierGroups.length > 0;

  const handleAdd = useCallback(() => {
    if (isOutOfStock) return;
    // Vibration haptic feedback en mobile — confirmación táctil rápida
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(30);
      } catch {
        /* silent */
      }
    }
    if (hasModifiers) {
      // Abre selector — el cliente debe elegir antes de agregar al carrito.
      setModifierModalOpen(true);
      return;
    }
    addItemWithUndo({
      storeId: product.storeId ?? "",
      storeName: product.storeName ?? "",
      storeSlug: product.storeSlug ?? "",
      storeProductId: product.storeProductId ?? String(product.id),
      productId: product.id,
      name: product.name,
      price: product.price,
      basePrice: product.price,
      image: product.image ?? null,
      unit: product.unit ?? null,
      description: product.description ?? null,
    });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1200);
  }, [addItemWithUndo, product, isOutOfStock, hasModifiers]);

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
      whileHover={{ y: -4 }}
      className={cn(
        "group relative flex w-full flex-col overflow-hidden rounded-xl",
        "bg-[var(--surface-raised)] border border-[var(--rule-soft)]",
        "transition-[border-color,box-shadow,transform] duration-200",
        "hover:border-[var(--accent)]/40 hover:shadow-[0_8px_24px_-12px_rgba(0,180,166,0.18)]",
        isOutOfStock && "opacity-70",
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* ── Zona imagen ──────────────────────────────────────────────────────── */}
      <div className="relative">
        <Link href={productHref} className="block">
          {/* Aspect 4/5 (más alto que ancho) en vez de square para dar más
              superficie a la imagen del producto sin alargar mucho la card.
              Imagen object-contain con padding mínimo, sin backdrop —
              respeta los PNG transparentes que vienen ya optimizados. */}
          <div className="relative aspect-[4/5] overflow-hidden bg-white dark:bg-gray-900">
            {product.image ? (
              <Image
                src={product.image}
                alt={product.name}
                fill
                className="object-contain p-3 transition-transform duration-500 group-hover:scale-[1.04]"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              />
            ) : (
              <ProductImageFallback name={product.name} category={product.category} />
            )}
          </div>
        </Link>

        {/* Badges top-left — pill alto contraste para oferta visible al instante */}
        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1.5">
          {/* Rank badge (variant top) */}
          {variant === "top" && rank !== undefined && (
            <span
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-full text-[length:var(--ts-2xs)] font-black shadow-sm",
                rankColors[rank] ?? rankColors[3],
              )}
              aria-label={`Posicion ${rank}`}
            >
              {rank}
            </span>
          )}

          {/* Discount % badge — RESALTADO: fondo accent solido + sombra */}
          {product.discount != null && product.discount > 0 && variant !== "top" && (
            <span
              className="inline-flex items-center justify-center rounded-md px-2 py-1 text-[length:var(--ts-xs)] font-black tabular-nums uppercase tracking-wider bg-[var(--accent)] text-[var(--surface-canvas)] shadow-md"
              aria-label={`${product.discount}% de descuento`}
            >
              -{product.discount}%
            </span>
          )}

          {/* Liquidacion / Oferta badge — text label adicional */}
          {showOfertaBadge && variant !== "top" && product.discount == null && (
            <span
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[length:var(--ts-2xs)] font-black uppercase tracking-wider bg-[var(--accent)] text-[var(--surface-canvas)] shadow-md"
            >
              {ofertaLabel}
            </span>
          )}

          {/* Timer badge (flash) */}
          {variant === "flash" && countdown && countdown !== "Expirado" && (
            <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[length:var(--ts-2xs)] font-bold tabular-nums bg-[var(--text-primary)] text-[var(--surface-canvas)] shadow-sm">
              <Timer className="h-3 w-3" aria-hidden />
              {countdown}
            </span>
          )}

          {/* Peruano badge */}
          {product.isPeruvian && (
            <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider bg-[var(--surface-raised)] border border-[var(--rule-base)] text-[var(--text-secondary)]">
              PERUANO
            </span>
          )}
        </div>

        {/* Acciones top-right — heart + compare, aparecen en hover */}
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
          {/* Quick view (heart slot) */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setQuickViewOpen(true);
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border border-gray-200 dark:border-gray-700 shadow-sm transition-colors hover:border-gray-400 dark:hover:border-gray-500"
            aria-label={`Ver rápido ${product.name}`}
          >
            <Heart className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" strokeWidth={1.75} aria-hidden />
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
              "inline-flex h-8 w-8 items-center justify-center rounded-full border shadow-sm transition-colors backdrop-blur-sm",
              inCompare
                ? "bg-[var(--accent-soft)] border-[var(--accent)]/30 text-[var(--accent)]"
                : "bg-white/95 dark:bg-gray-900/95 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500",
            )}
          >
            <GitCompareArrows className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          </button>
        </div>

        {/* Overlay agotado */}
        {isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
            <span className="rounded-full bg-gray-800/90 px-3 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-white">
              Agotado
            </span>
          </div>
        )}
      </div>

      {/* ── Contenido ──────────────────────────────────────────────────────────
          Tipografía aumentada (ADR storefront 2026-04): nombre base/lg, descripción sm,
          tienda sm — evita texto diminuto que el usuario no podía leer. */}
      <div className="flex flex-1 flex-col p-4">
        {/* Nombre — text-base font-bold, 2 lineas, mayor presencia */}
        <Link href={productHref}>
          <h3 className="text-base sm:text-lg font-bold leading-snug text-[var(--text-primary)] line-clamp-2 min-h-[2.75rem] group-hover:text-[var(--accent)] transition-colors">
            {product.name}
          </h3>
        </Link>

        {/* Descripción — text-sm bold-medium, leading generoso */}
        {product.description && (
          <p className="mt-2 text-sm font-medium leading-relaxed text-[var(--text-secondary)] line-clamp-2">
            {product.description}
          </p>
        )}

        {/* Tienda — text-sm, ícono más grande para legibilidad */}
        {product.storeName && (
          <div className="mt-2 flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)]">
            <StoreIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{product.storeName}</span>
          </div>
        )}

        {/* Precio + CTA circular — precio RESALTADO + ahorro visible.
            En mobile aumentamos el gap para que el botón del carrito
            no se vea pegado al precio. */}
        <div className="mt-auto pt-3 flex items-end justify-between gap-3 sm:gap-2">
          <div className="min-w-0 flex-1">
            {/* Precio tachado + ahorro: si hay descuento, mostrar fila pre-precio */}
            {product.originalPrice && product.originalPrice > product.price && (
              <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                <span className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] line-through tabular-nums">
                  {fmt(product.originalPrice)}
                </span>
                <span className="text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--accent)]">
                  Ahorra {fmt(product.originalPrice - product.price)}
                </span>
              </div>
            )}
            {/* Precio actual — XL black + accent si tiene oferta */}
            <div className="flex items-baseline gap-1 flex-wrap">
              <span
                className={cn(
                  "text-xl sm:text-2xl font-black leading-none tabular-nums tracking-[var(--ls-tight)]",
                  product.originalPrice && product.originalPrice > product.price
                    ? "text-[var(--accent)]"
                    : "text-[var(--text-primary)]",
                )}
              >
                {fmt(product.price)}
              </span>
              {product.unit && (
                <span className="text-[length:var(--ts-xs)] font-medium text-[var(--text-tertiary)] tabular-nums">
                  /{product.unit}
                </span>
              )}
            </div>
            {/* MK-12 — Stock con jerarquía de urgencia: crítico (≤3) en rojo
                con dot pulsante, bajo (≤5) en naranja, normal en muted. */}
            {product.stock != null && product.stock > 0 && (
              <span
                className={cn(
                  "mt-1 inline-flex items-center gap-1 text-xs font-bold",
                  product.stock <= 3
                    ? "text-[var(--data-error)] uppercase tracking-wider"
                    : product.stock <= 5
                      ? "text-[var(--data-warning)] uppercase tracking-wider"
                      : "text-[var(--text-tertiary)] font-medium normal-case tracking-normal",
                )}
              >
                {product.stock <= 3 && (
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--data-error)] animate-pulse" />
                )}
                {product.stock <= 5
                  ? `Quedan ${product.stock}${product.stock <= 3 ? " — se agota" : ""}`
                  : `Stock: ${product.stock}`}
              </span>
            )}
          </div>

          {/* CTA circular AGRANDADO h-12 w-12 + icono h-5 w-5 — resalta la accion.
              Cuando el producto ya está en el carrito, mostramos un badge
              superpuesto con la cantidad — el usuario sabe al instante qué
              ya agregó sin abrir el drawer. */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={handleAdd}
              disabled={isOutOfStock}
              aria-label={
                isOutOfStock
                  ? `${product.name} — agotado`
                  : inCartQty > 0
                    ? `Agregar otro ${product.name} al carrito (${inCartQty} en carrito)`
                    : `Agregar ${product.name} al carrito`
              }
              className={cn(
                "inline-flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full transition-all duration-200 ring-1 shrink-0",
                isOutOfStock
                  ? "bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed ring-gray-200 dark:ring-gray-700"
                  : justAdded
                    ? "bg-emerald-500 text-white scale-90 ring-emerald-600/30"
                    : inCartQty > 0
                      ? "bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 hover:scale-105 active:scale-95 shadow-md ring-[var(--accent)]/40"
                      : "bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 hover:scale-105 active:scale-95 shadow-md ring-[var(--accent)]/30",
              )}
            >
              {justAdded ? (
                <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden />
              ) : (
                <ShoppingCart className="h-5 w-5" strokeWidth={2} aria-hidden />
              )}
            </button>
            {/* Badge cantidad en carrito */}
            {inCartQty > 0 && !justAdded && (
              <motion.span
                key={inCartQty}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 22 }}
                aria-hidden
                className="absolute -top-1.5 -right-1.5 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-[var(--text-primary)] px-1.5 text-[length:var(--ts-2xs)] font-black tabular-nums text-[var(--surface-canvas)] shadow-md ring-2 ring-[var(--surface-raised)]"
              >
                {inCartQty > 99 ? "99+" : inCartQty}
              </motion.span>
            )}
          </div>
        </div>

        {/* Pill "✓ Ya pediste N" — feedback secundario debajo del precio. */}
        {inCartQty > 0 && (
          <div className="mt-2 -mb-1 flex items-center justify-end">
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">
              <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              Ya pediste {inCartQty}
            </span>
          </div>
        )}

        {/* Aviso limite comparar */}
        {compareLimitMsg && (
          <p
            role="alert"
            className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-center text-[length:var(--ts-xs)] text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
          >
            Máximo 3 productos para comparar
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

      {/* Modal de variaciones — solo si el producto las tiene configuradas */}
      {hasModifiers && (
        <ProductModifierModal
          open={modifierModalOpen}
          onClose={() => setModifierModalOpen(false)}
          product={{
            id: product.id,
            name: product.name,
            price: product.price,
            image: product.image ?? null,
            unit: product.unit ?? null,
            category: product.category,
            storeId: product.storeId ?? "",
            storeName: product.storeName ?? "",
            storeSlug: product.storeSlug ?? "",
            storeProductId: product.storeProductId ?? String(product.id),
            description: product.description ?? null,
          }}
          groups={product.modifierGroups ?? []}
          onConfirm={({ quantity, modifiers, finalUnitPrice }) => {
            addItemWithUndo({
              storeId: product.storeId ?? "",
              storeName: product.storeName ?? "",
              storeSlug: product.storeSlug ?? "",
              storeProductId: product.storeProductId ?? String(product.id),
              productId: product.id,
              name: product.name,
              price: finalUnitPrice,
              basePrice: product.price,
              image: product.image ?? null,
              unit: product.unit ?? null,
              description: product.description ?? null,
              modifiers,
              modifierHash: modifierHashOf(modifiers),
              quantity,
            });
            setModifierModalOpen(false);
            setJustAdded(true);
            setTimeout(() => setJustAdded(false), 1200);
          }}
        />
      )}
    </motion.article>
  );
}
