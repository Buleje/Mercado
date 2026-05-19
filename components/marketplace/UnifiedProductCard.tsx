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
  // Brandon 2026-05-18 v3: Minus + Plus para stepper mobile dentro del card.
  Minus,
  Plus,
  // Audit P0 UX #2 (2026-05-18): Lucide icons reemplazan los emoji unicode
  // del fallback — los emoji no rinden consistente en todos los browsers
  // (vimos cajitas vacías en Chromium sin emoji-font). Los Lucide siempre
  // renderizan como SVG.
  Pizza,
  Beef,
  Beer,
  Carrot,
  ChefHat,
  Cookie,
  Croissant,
  Drumstick,
  Fish,
  Milk,
  Sandwich,
  Apple,
  Package,
  type LucideIcon,
} from "@buleje/design-system/icons";

// Audit P12 + P0 UX #2: fallback amable para productos sin foto. Antes
// mostraba un placeholder vectorial gris genérico que parecía bug; ahora
// muestra ÍCONO LUCIDE de la categoría (no emoji unicode) + nombre del
// producto sobre fondo de marca + CTA honesto "Sin foto". Convierte un
// negativo en invitación al bodeguero a colaborar con la curaduría visual.
const CATEGORY_ICON: Record<string, LucideIcon> = {
  abarrotes: Package,
  bebidas: Beer,
  carnes: Beef,
  lacteos: Milk,
  frutas: Apple,
  verduras: Carrot,
  panaderia: Croissant,
  panadería: Croissant,
  golosinas: Cookie,
  limpieza: Package,
  hogar: Package,
  mascotas: Package,
  bebes: Package,
  bebés: Package,
  farmacia: Package,
  ferreteria: Package,
  ferretería: Package,
  pollo: Drumstick,
  polleria: Drumstick,
  pollería: Drumstick,
  pescados: Fish,
  congelados: Package,
  pizza: Pizza,
  pizzas: Pizza,
  pizzeria: Pizza,
  pizzería: Pizza,
  sandwich: Sandwich,
  sandwiches: Sandwich,
  comida: ChefHat,
  comidas: ChefHat,
  restaurante: ChefHat,
  restaurantes: ChefHat,
  default: ShoppingCart,
};
function ProductImageFallback({ name, category }: { name?: string | null; category?: string | null }) {
  const key = (category ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const Icon = CATEGORY_ICON[key] ?? CATEGORY_ICON.default;
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center text-center px-3 bg-linear-to-br from-[var(--surface-sunken)] via-[var(--surface-canvas)] to-[var(--surface-sunken)]"
      aria-label="Producto sin foto"
    >
      <span
        className="mb-2 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)]"
        aria-hidden
      >
        <Icon className="h-7 w-7" strokeWidth={1.75} />
      </span>
      {name && (
        <p className="text-xs font-semibold text-[var(--text-secondary)] leading-tight line-clamp-2 max-w-[90%]">
          {name}
        </p>
      )}
      <p className="mt-1 text-[10px] font-medium text-[var(--text-tertiary)]">
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
  /** Si true, oculta el nombre de la tienda (util en storefront /marketplace/[slug]
      donde el contexto de tienda ya es obvio y repetirlo es ruido visual). */
  hideStore?: boolean;
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
  hideStore = false,
}: UnifiedProductCardProps) {
  const { addItemWithUndo } = useCartWithUndo();
  const { items: cartItems, updateQuantity, removeItem } = useMarketplaceCart();
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

  // Brandon 2026-05-18 v3: handlers de stepper para el CTA mobile.
  // - handleIncrement = handleAdd (mismo flujo: +1 con undo drawer)
  // - handleDecrement = updateQuantity(qty - 1) (o removeItem si llega a 0)
  // Solo aplica a productos sin modifiers (las variantes con modifiers no
  // pueden incrementarse blind — cada línea tiene su propio modifierHash).
  const handleDecrement = useCallback(() => {
    if (!product.storeId || hasModifiers) return;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate(20); } catch { /* silent */ }
    }
    if (inCartQty <= 1) {
      removeItem(product.storeId, product.id);
    } else {
      updateQuantity(product.storeId, product.id, inCartQty - 1);
    }
  }, [product.storeId, product.id, hasModifiers, inCartQty, removeItem, updateQuantity]);

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
      // Snapshot del stock para que el carrito pueda capar el inc y evitar
      // el 409 del checkout. null = restaurante/servicio sin inventario.
      stock: product.stock ?? null,
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
    2: "bg-[var(--surface-sunken)] dark:bg-gray-800 text-gray-700 dark:text-gray-200",
    3: "bg-[var(--surface-sunken)] dark:bg-gray-800 text-gray-500 dark:text-gray-400",
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      whileHover={{ y: -6 }}
      className={cn(
        // Brandon 2026-05-18 v3: layout horizontal en mobile (estilo PedidosYa/
        // Cornershop) — imagen 96×96 a la izquierda, info + precio + CTA en
        // columna derecha. Más cards visibles por scroll, escaneo rápido.
        // Desktop conserva el vertical card original (sm:flex-col).
        "group relative flex w-full flex-row sm:flex-col overflow-hidden rounded-2xl sm:rounded-xl",
        "bg-[var(--surface-raised)] border border-[var(--rule-soft)]",
        "transition-[border-color,box-shadow,transform] duration-200",
        "hover:border-[var(--accent)]/60 hover:shadow-[0_12px_32px_-8px_color-mix(in oklab, var(--accent) 28%, transparent)]",
        isOutOfStock && "opacity-70",
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* ── Zona imagen ────────────────────────────────────────────────────────
          Mobile (xs): wrapper 144×144 con shrink-0 a la izquierda — imagen
          grande y prominente para que el cliente vea bien el producto.
          Desktop (sm+): wrapper full-width aspect-[4/3] como siempre. */}
      <div className="relative w-36 sm:w-full shrink-0 sm:shrink">
        {/* Brandon 2026-05-18 v3: en MOBILE el Link a detalles queda inerte
            (`pointer-events-none`) — el cliente que toca el card ya no se va
            a /producto/[slug]. La única acción mobile es el botón "Agregar"
            inline más abajo. En sm+ recupera `pointer-events-auto` y vuelve
            a comportarse como link normal (hover, tap → detalles).
            El href se conserva para SEO/crawlers. */}
        <Link
          href={productHref}
          className="block pointer-events-none sm:pointer-events-auto"
          tabIndex={-1}
          aria-hidden="true"
        >
          {/* Mobile: aspect-square 144×144. Desktop: aspect-[4/3] landscape.
              Brandon 2026-05-18 v4: imagen llena el card (object-cover sin
              padding) — antes object-contain p-2 dejaba márgenes blancos y
              hacía ver el producto pequeño. Ahora ocupa el 100% del slot. */}
          <div className="relative aspect-square sm:aspect-[4/3] h-full sm:h-auto overflow-hidden bg-[var(--surface-sunken)] sm:bg-white dark:sm:bg-gray-900">
            {product.image ? (
              <Image
                src={product.image}
                alt={product.name}
                fill
                className="object-cover sm:object-contain sm:p-2 transition-transform duration-500 group-hover:scale-[1.04]"
                sizes="(max-width: 640px) 144px, (max-width: 1024px) 50vw, 33vw"
              />
            ) : (
              <ProductImageFallback name={product.name} category={product.category} />
            )}
          </div>
        </Link>

        {/* Badges top-left — pill alto contraste para oferta visible al instante.
            Brandon 2026-05-18 v3: ocultos en mobile xs por falta de espacio
            (imagen 112×112). El descuento ya aparece como precio tachado +
            "Ahorra S/X" en el bloque del precio. Liquidación/PERUANO se
            muestran en sm+ donde la imagen es más grande. */}
        <div className="hidden sm:flex absolute top-2 left-2 z-10 flex-col gap-1.5">
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
              className="inline-flex items-center justify-center rounded-md px-2 py-1 text-[length:var(--ts-xs)] font-black tabular-nums uppercase tracking-wider bg-[var(--accent-600,var(--accent))] text-[var(--surface-canvas)] shadow-md"
              aria-label={`${product.discount}% de descuento`}
            >
              -{product.discount}%
            </span>
          )}

          {/* Liquidacion / Oferta badge — text label adicional */}
          {showOfertaBadge && variant !== "top" && product.discount == null && (
            <span
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[length:var(--ts-2xs)] font-black uppercase tracking-wider bg-[var(--accent-600,var(--accent))] text-[var(--surface-canvas)] shadow-md"
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
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border border-gray-200 dark:border-gray-700 shadow-sm transition-colors hover:border-gray-400 dark:hover:border-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:border-[var(--accent)]"
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
              "inline-flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition-colors backdrop-blur-sm",
              inCompare
                ? "bg-[var(--accent-soft)] border-[var(--accent)]/30 text-[var(--accent)]"
                : "bg-white/95 dark:bg-gray-900/95 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:border-[var(--accent)]",
            )}
          >
            <GitCompareArrows className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          </button>
        </div>

        {/* Brandon 2026-05-18 v3: badge -N% mini en mobile xs cuando hay
            descuento. Posición top-left. Diseño compacto pill. */}
        {product.discount != null && product.discount > 0 && (
          <span
            className="sm:hidden absolute top-1.5 left-1.5 z-10 inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-black tabular-nums bg-[var(--accent-600,var(--accent))] text-[var(--surface-canvas)] shadow-sm"
            aria-label={`${product.discount}% de descuento`}
          >
            -{product.discount}%
          </span>
        )}

        {/* Overlay agotado */}
        {isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
            <span className="rounded-full bg-gray-800/90 px-3 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-white">
              Agotado
            </span>
          </div>
        )}

        {/* Brandon 2026-05-18 v3: CTA mobile MOVIDO al footer del card como
            botón full-width (no overlay sobre la imagen). El overlay icon-only
            de 44px era pequeño y compartía espacio con badges; ahora el CTA
            ocupa todo el ancho del card debajo del precio, con label "Agregar"
            + icon + badge de cantidad en cart. Más grande, más visible, más
            click-friendly en pulgar. Renderizado en el bloque del precio
            (líneas siguientes). */}
      </div>

      {/* ── Contenido ──────────────────────────────────────────────────────────
          Brandon 2026-05-18 v3: mobile compacto (p-3, gap-y reducido), desktop
          igual (p-4 con min-h del título para alinear cards en grid). */}
      <div className="flex flex-1 flex-col p-3 sm:p-4 min-w-0">
        {/* Nombre — text-base font-bold, 2 lineas, mayor presencia.
            Mobile: sin min-h (card horizontal escala según content).
            Link inerte en mobile (el cliente en cel solo usa "Agregar"). */}
        <Link
          href={productHref}
          className="pointer-events-none sm:pointer-events-auto"
          tabIndex={-1}
          aria-hidden="true"
        >
          <h3 className="text-sm sm:text-lg font-extrabold sm:font-bold leading-snug text-[var(--text-primary)] line-clamp-2 sm:min-h-[2.75rem] group-hover:text-[var(--accent)] group-focus-within:text-[var(--accent)] transition-colors">
            {product.name}
          </h3>
        </Link>

        {/* Descripción — text-sm bold-medium, leading generoso.
            Mobile: 1 línea truncate (espacio limitado en card horizontal). */}
        {product.description && (
          <p className="mt-1 sm:mt-2 text-xs sm:text-sm font-medium leading-snug sm:leading-relaxed text-[var(--text-secondary)] line-clamp-1 sm:line-clamp-2">
            {product.description}
          </p>
        )}

        {/* Tienda — sm+ only (en /marketplace/[slug] mobile el contexto es
            obvio y el card horizontal no tiene espacio para el storeName). */}
        {product.storeName && !hideStore && (
          <div className="hidden sm:flex mt-2 items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)]">
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
                    ? "text-[var(--data-error-500)] uppercase tracking-wider"
                    : product.stock <= 5
                      ? "text-[var(--data-warning-500)] uppercase tracking-wider"
                      : "text-[var(--text-tertiary)] font-medium normal-case tracking-normal",
                )}
              >
                {product.stock <= 3 && (
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--data-error-500)] animate-pulse" />
                )}
                {product.stock <= 5
                  ? `Quedan ${product.stock}${product.stock <= 3 ? " — se agota" : ""}`
                  : `Stock: ${product.stock}`}
              </span>
            )}
          </div>

          {/* Brandon 2026-05-18: CTA inline OCULTO en mobile (sm:hidden inverso
              → hidden sm:flex). El botón vive ahora como overlay sobre la
              imagen en mobile (ver bloque "Brandon 2026-05-18: CTA reubicado"
              arriba). En desktop sm+ mantenemos el inline porque hay espacio. */}
          <div className="relative shrink-0 hidden sm:flex">
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
                "inline-flex h-12 w-12 items-center justify-center rounded-full transition-all duration-200 ring-1 shrink-0",
                isOutOfStock
                  ? "bg-[var(--surface-sunken)] dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed ring-gray-200 dark:ring-gray-700"
                  : justAdded
                    ? "bg-[var(--data-success-500)] text-white scale-90 ring-[var(--data-success-500)]/30"
                    : inCartQty > 0
                      ? "bg-[var(--accent-600,var(--accent))] text-white hover:bg-[var(--accent)]/90 hover:scale-105 active:scale-95 shadow-md ring-[var(--accent)]/40"
                      : "bg-[var(--accent-600,var(--accent))] text-white hover:bg-[var(--accent)]/90 hover:scale-105 active:scale-95 shadow-md ring-[var(--accent)]/30",
              )}
            >
              {justAdded ? (
                <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden />
              ) : (
                <ShoppingCart className="h-5 w-5" strokeWidth={2} aria-hidden />
              )}
            </button>
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

        {/* Pill "✓ Ya pediste N" — feedback secundario debajo del precio.
            Brandon 2026-05-18 v3: oculto en mobile porque el stepper inline
            de abajo ya muestra la cantidad. Solo sm+. */}
        {inCartQty > 0 && (
          <div className="hidden sm:flex mt-2 -mb-1 items-center justify-end">
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">
              <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              Ya pediste {inCartQty}
            </span>
          </div>
        )}

        {/* ── CTA MOBILE estilo Rappi/Glovo ─────────────────────────────
            Brandon 2026-05-18 v3 rediseño:
            · Estado 0 → botón pill h-13 full-width con icon + "Agregar al
              carrito", gradient sutil del accent, sombra accent/30,
              ring inset, ripple-feel via active:scale.
            · Estado N (sin modifiers) → stepper Rappi-style:
              [ − ] [ qty grande tabular ] [ + ]   — toda la fila accent,
              botones h-12 generosos, qty en el centro con presence visual.
            · Estado con modifiers → vuelve al botón "Agregar otro" porque
              cada variante necesita pasar por el modal.
            · justAdded → flash verde "Agregado ✓" 1.2s.
            · Agotado → estado disabled con texto explícito. */}
        <div className="sm:hidden mt-3">
          {!isOutOfStock && inCartQty > 0 && !hasModifiers ? (
            <div
              role="group"
              aria-label={`${product.name} — ${inCartQty} en carrito`}
              className={cn(
                "inline-flex h-12 w-full items-center justify-between rounded-xl px-1 transition-all duration-200 shadow-md shadow-[var(--accent)]/20 ring-1 ring-[var(--accent)]/30",
                justAdded
                  ? "bg-[var(--data-success-500)]"
                  : "bg-linear-to-r from-[var(--accent-600,var(--accent))] to-[var(--accent)]",
              )}
            >
              <button
                type="button"
                onClick={handleDecrement}
                aria-label={inCartQty === 1 ? `Quitar ${product.name} del carrito` : `Restar ${product.name}`}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 text-white hover:bg-white/25 active:scale-90 transition-all"
              >
                <Minus className="h-5 w-5" strokeWidth={2.75} aria-hidden />
              </button>
              <motion.span
                key={inCartQty}
                initial={{ scale: 0.7, opacity: 0.4 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 540, damping: 22 }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 text-white"
              >
                {justAdded ? (
                  <>
                    <Check className="h-5 w-5" strokeWidth={2.75} aria-hidden />
                    <span className="text-sm font-extrabold uppercase tracking-wide">Agregado</span>
                  </>
                ) : (
                  <>
                    <span className="text-lg font-black tabular-nums">{inCartQty}</span>
                    <span className="text-[length:var(--ts-xs)] font-bold opacity-85">
                      {inCartQty === 1 ? "unidad" : "unidades"}
                    </span>
                  </>
                )}
              </motion.span>
              <button
                type="button"
                onClick={handleAdd}
                aria-label={`Agregar otro ${product.name}`}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 text-white hover:bg-white/25 active:scale-90 transition-all"
              >
                <Plus className="h-5 w-5" strokeWidth={2.75} aria-hidden />
              </button>
            </div>
          ) : (
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
                "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-extrabold uppercase tracking-wide transition-all duration-200 active:scale-[0.985] ring-1",
                isOutOfStock
                  ? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed ring-[var(--rule-soft)]"
                  : justAdded
                    ? "bg-[var(--data-success-500)] text-white shadow-md shadow-[var(--data-success-500)]/30 ring-[var(--data-success-500)]/40"
                    : "bg-linear-to-br from-[var(--accent-600,var(--accent))] to-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/30 ring-[var(--accent)]/40 hover:shadow-lg hover:shadow-[var(--accent)]/35",
              )}
            >
              {justAdded ? (
                <>
                  <Check className="h-4 w-4" strokeWidth={2.75} aria-hidden />
                  Agregado
                </>
              ) : isOutOfStock ? (
                <>Agotado</>
              ) : (
                <>
                  <ShoppingCart className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  Agregar al carrito
                </>
              )}
            </button>
          )}
        </div>

        {/* Aviso limite comparar */}
        {compareLimitMsg && (
          <p
            role="alert"
            className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-center text-[length:var(--ts-xs)] text-[var(--data-warning-700)] dark:bg-amber-950/30 dark:text-amber-400"
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
