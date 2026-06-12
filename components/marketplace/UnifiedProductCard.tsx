"use client";
"use memo";

// React Compiler annotation (audit perf 2026-05-19): opt-in al auto-memo
// del compiler. Este componente se renderiza decenas de veces por página
// de catálogo (UnifiedProductCard es la card principal del marketplace).
// El compiler auto-memoiza props + hooks, reduce re-renders innecesarios.
import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { m as motion } from "framer-motion";
import {
  ShoppingCart,
  Store as StoreIcon,
  GitCompareArrows,
  // Brandon 2026-06-11: Minus + Plus re-incorporados — el CTA del card ahora es
  // un stepper inline (− N +) una vez agregado, sin borde de caja. Reemplaza el
  // botón circular con borde + badge flotante. El decremento ya no obliga a ir
  // al carrito: se hace desde la misma card.
  Minus,
  Plus,
  Heart,
  MessageCircle,
  // Brandon 2026-06-12: agotados ya no muestran un carrito muerto — muestran
  // "Avísame" (campana) que abre WhatsApp a Buleje para avisar al reponer.
  BellRing,
  Timer,
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
import { BRAND_GEO } from "@/lib/geo";
import { celebrate } from "@/lib/celebrate";
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
  /** Logo de la tienda — se muestra como avatar al costado del nombre. */
  storeLogo?: string | null;
  unit?: string | null;
  category?: string;
  stock?: number;
  discount?: number;
  /** Indica si el producto es peruano/nacional — muestra badge "PERUANO" */
  isPeruvian?: boolean;
  /** Grupos de modificadores configurados — si presente, abre selector pre-add. */
  modifierGroups?: DbStoreProductModifierGroup[];
  /** Comentarios públicos del producto (estilo IG) — chip con globo + count. */
  commentCount?: number;
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
  /**
   * Layout del card:
   * - `"list"` (default): mobile HORIZONTAL (imagen 176px izq + contenido der),
   *   desktop vertical. Para listas/grids full-width 1-columna en mobile.
   * - `"compact"`: SIEMPRE vertical (imagen cuadrada arriba + contenido abajo),
   *   en todos los breakpoints. Para carruseles horizontales donde cada card
   *   vive en un slot angosto (~42vw) — el horizontal no entra y "corta todo".
   */
  layout?: "list" | "compact";
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
  layout = "list",
}: UnifiedProductCardProps) {
  const isCompact = layout === "compact";
  // Brandon 2026-05-18 v6: importamos `addItem` directo (sin drawer) para
  // el flow de modifiers — cuando el cliente confirma desde el modal de
  // adicionales NO queremos abrir el AddedToCartDrawer encima (sería un
  // modal sobre otro modal). El producto se agrega al cart y se cierra.
  const { items: cartItems, addItem, updateQuantity } = useMarketplaceCart();
  const { add: addToCompare, remove: removeFromCompare, has: isInCompare, items: compareItems, max: compareMax } = useCompare();
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

  // Líneas del carrito que corresponden a ESTE producto. Puede haber varias si
  // se agregó con distintos adicionales (mismo producto, modifierHash distinto).
  // El stepper de la card opera sobre estas líneas para sumar/restar.
  // Brandon 2026-06-09 fix: el match por storeId fallaba en secciones que no
  // pasan storeId (ej. "Lo más pedido hoy") → contador siempre 0. Ahora se
  // matchea por storeProductId (clave única store-producto que pasan top-today,
  // catálogo y storefront) con fallback a storeId/storeSlug.
  const cartLines = useMemo(() => {
    return cartItems.filter((i) => {
      if (product.storeProductId && i.storeProductId)
        return i.storeProductId === product.storeProductId;
      if (i.productId !== product.id) return false;
      if (product.storeId) return i.storeId === product.storeId;
      if (product.storeSlug) return i.storeSlug === product.storeSlug;
      return false;
    });
  }, [cartItems, product.id, product.storeId, product.storeSlug, product.storeProductId]);

  // Cantidad total ya en el carrito — suma todas las líneas del producto.
  const inCartQty = useMemo(
    () => cartLines.reduce((acc, i) => acc + i.quantity, 0),
    [cartLines],
  );

  const productHref =
    href ??
    (product.storeSlug ? `/marketplace/${product.storeSlug}` : "/marketplace");

  const { onMouseEnter, onMouseLeave } = useHoverPrefetch(productHref);

  const isOutOfStock = product.stock === 0;

  // Brandon 2026-06-12: "Avísame cuando llegue" para agotados. Sin DB: abre
  // WhatsApp al número central de Buleje con el producto + tienda prellenados.
  // Captura demanda perdida (quién quería qué) y le da salida al cliente en
  // vez de un carrito muerto. Upgrade futuro: waitlist persistida.
  const notifyWaHref = useMemo(() => {
    const digits = BRAND_GEO.phone.replace(/[^0-9]/g, "");
    const text = encodeURIComponent(
      `Hola Buleje 👋 Avísenme cuando vuelva a haber ${product.name}` +
        (product.storeName ? ` de ${product.storeName}` : "") +
        ", por favor.",
    );
    return `https://wa.me/${digits}?text=${text}`;
  }, [product.name, product.storeName]);
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


  // Brandon 2026-05-18 v5: handleDecrement removido — el stepper mobile
  // del card se quitó (CTA mobile ahora es círculo icon-only igual que
  // desktop). El decremento se hace desde el carrito (/marketplace/carrito).

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
    // Brandon 2026-05-27: SIEMPRE abrir el modal "Armá tu pedido" — tenga o no
    // adicionales. Sin grupos, el modal muestra solo la cantidad + agregar
    // (quick add). Unifica el flujo de agregado en un único formato.
    setModifierModalOpen(true);
  }, [isOutOfStock]);

  // Brandon 2026-05-31: add-to-cart DIRECTO (sin abrir modal) — lo usa el
  // "Ver rápido" (QuickViewModal), donde el cliente YA eligió la cantidad
  // dentro de ese modal. Antes su onAddToCart llamaba a handleAdd() → abría
  // ProductModifierModal ENCIMA del QuickView (modal anidado roto: parecía que
  // "no agregaba"). Ahora agrega directo con precio base y sin modificadores.
  const addDirect = useCallback(
    (quantity: number) => {
      // Mismo shape que el onConfirm del ProductModifierModal (ya tipado OK).
      addItem({
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
        modifiers: [],
        modifierHash: modifierHashOf([]),
        quantity: Math.max(1, quantity),
      });
      celebrate({ intensity: "sm" }); // 🎉 agregado al carrito
    },
    [addItem, product],
  );

  // Tope de stock: si el producto controla stock, no dejar sumar más allá.
  const atStockCap =
    product.stock != null && product.stock > 0 && inCartQty >= product.stock;

  // Stepper "+": suma una unidad. Con adicionales abre el modal (para elegir
  // los del nuevo ítem); producto simple suma directo a la línea base.
  const handleIncrement = useCallback(() => {
    if (isOutOfStock || atStockCap) return;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(20);
      } catch {
        /* silent */
      }
    }
    if ((product.modifierGroups?.length ?? 0) > 0) {
      setModifierModalOpen(true);
      return;
    }
    addItem({
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
      modifiers: [],
      modifierHash: modifierHashOf([]),
      quantity: 1,
      stock: product.stock ?? undefined,
    });
  }, [isOutOfStock, atStockCap, product, addItem]);

  // Stepper "−": resta una unidad de la ÚLTIMA línea agregada del producto.
  // Si la línea llega a 0, updateQuantity la elimina. Maneja multi-línea.
  const handleDecrement = useCallback(() => {
    const line = cartLines[cartLines.length - 1];
    if (!line) return;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(20);
      } catch {
        /* silent */
      }
    }
    updateQuantity(line.storeId, line.productId, line.quantity - 1, line.modifierHash);
  }, [cartLines, updateQuantity]);

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
        // Cornershop) — imagen a la izquierda, info + precio + CTA en columna
        // derecha. Desktop conserva el vertical card original (sm:flex-col).
        // layout="compact": SIEMPRE vertical (carruseles angostos donde el
        // horizontal no entra). Default "list" = horizontal mobile.
        // Brandon 2026-06-07: recto (sin rounded), sin glow/sombra ni borde de
        // hover (se veía un borde negro feo). El único feedback de hover es el
        // movimiento sutil de la imagen (group-hover:scale).
        "group relative flex w-full overflow-hidden",
        isCompact ? "flex-col" : "flex-row sm:flex-col",
        "bg-[var(--surface-raised)] border border-[var(--rule-soft)]",
        isOutOfStock && "opacity-70",
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* ── Zona imagen ────────────────────────────────────────────────────────
          Mobile (xs): wrapper 176×176 con shrink-0 a la izquierda — imagen
          aún más grande y dominante (Brandon 2026-05-18 v5: pidió que la
          imagen ocupe más ancho del card para que el cliente la vea bien).
          Desktop (sm+): wrapper full-width aspect-[4/3] como siempre. */}
      <div className={cn("relative", isCompact ? "w-full shrink" : "w-44 sm:w-full shrink-0 sm:shrink")}>
        {/* Brandon 2026-05-18 v3: en MOBILE el Link a detalles queda inerte
            (`pointer-events-none`) — el cliente que toca el card ya no se va
            a /producto/[slug]. La única acción mobile es el botón "Agregar"
            inline más abajo. En sm+ recupera `pointer-events-auto` y vuelve
            a comportarse como link normal (hover, tap → detalles).
            El href se conserva para SEO/crawlers. */}
        <Link
          href={productHref}
          className={isCompact ? "block" : "block pointer-events-none sm:pointer-events-auto"}
          tabIndex={isCompact ? undefined : -1}
          aria-hidden={isCompact ? undefined : "true"}
        >
          {/* list: mobile aspect-square / desktop aspect-[4/3] landscape.
              compact: aspect-square en todos los breakpoints (imagen arriba).
              Brandon 2026-05-24: object-contain (no cover) + fondo claro para
              MOSTRAR LA FOTO COMPLETA del producto, sin recortar. */}
          <div
            className={cn(
              // Audit mobile #17: well SIEMPRE blanco (también en dark) — las
              // fotos de producto con fondo transparente se veían "ajedrez" gris
              // sobre gray-900. Sobre blanco lucen limpias en cualquier tema.
              "relative overflow-hidden bg-white",
              isCompact ? "aspect-square h-auto" : "aspect-square sm:aspect-[4/3] h-full sm:h-auto",
            )}
          >
            {product.image ? (
              <Image
                src={product.image}
                alt={product.name}
                fill
                className="object-contain p-2 transition-transform duration-500 group-hover:scale-[1.04]"
                sizes={
                  isCompact
                    ? "(max-width: 640px) 42vw, (max-width: 1024px) 210px, 230px"
                    : "(max-width: 640px) 176px, (max-width: 1024px) 50vw, 33vw"
                }
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
        <div className={cn("absolute top-2 left-2 z-10 flex-col gap-1.5", isCompact ? "flex" : "hidden sm:flex")}>
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

        {/* Acciones top-right — quick view + compare. Audit mobile #5: son
            features de DESKTOP (hover) → ocultas en celular para una card limpia
            tipo Rappi. En lg+ aparecen al hover como siempre. */}
        <div className="absolute top-2 right-2 z-10 hidden lg:flex flex-col gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
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
            descuento. Posición top-left. Diseño compacto pill.
            En compact el bloque de badges de arriba ya lo muestra (flex en
            todos los breakpoints) — no duplicar. */}
        {!isCompact && product.discount != null && product.discount > 0 && (
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

        {/* Brandon 2026-06-12: CTA FLOTANTE dentro de la imagen, abajo-derecha
            (estilo Rappi/PedidosYa). Estado vacío = botón circular accent con
            carrito. Con items = stepper (− N +) en pill flotante. Agotado =
            "Avísame". Toda la lógica (handleAdd/Increment/Decrement) intacta. */}
        <div className="absolute bottom-2 right-2 z-20">
          {inCartQty > 0 && !isOutOfStock ? (
            <div
              role="group"
              aria-label={`${product.name}: ${inCartQty} en el carrito`}
              className="inline-flex h-11 items-center gap-0.5 rounded-full bg-[var(--surface-raised)]/95 px-1 shadow-md ring-1 ring-[var(--rule-soft)] backdrop-blur"
            >
              <button
                type="button"
                onClick={handleDecrement}
                aria-label={`Quitar un ${product.name} del carrito`}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-primary)] transition-all duration-150 hover:bg-[var(--surface-sunken)] active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <Minus className="h-5 w-5" strokeWidth={2.75} aria-hidden />
              </button>
              <motion.span
                key={inCartQty}
                initial={{ scale: 0.6, opacity: 0.4 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 22 }}
                aria-hidden
                className="min-w-[1.5rem] text-center text-base font-black tabular-nums leading-none text-[var(--text-primary)]"
              >
                {inCartQty > 99 ? "99+" : inCartQty}
              </motion.span>
              <button
                type="button"
                onClick={handleIncrement}
                disabled={atStockCap}
                aria-label={
                  atStockCap
                    ? `${product.name}: alcanzaste el stock disponible`
                    : `Agregar otro ${product.name} al carrito`
                }
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-full transition-all duration-150 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                  atStockCap
                    ? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed"
                    : "bg-[var(--accent)] text-white hover:opacity-90 hover:scale-105",
                )}
              >
                <Plus className="h-5 w-5" strokeWidth={2.75} aria-hidden />
              </button>
            </div>
          ) : isOutOfStock ? (
            <a
              href={notifyWaHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Avísame cuando llegue ${product.name}`}
              className="inline-flex h-11 items-center gap-1.5 rounded-full bg-[var(--surface-raised)]/95 px-3.5 text-[length:var(--ts-xs)] font-bold text-[var(--accent)] shadow-md ring-1 ring-[var(--rule-soft)] backdrop-blur transition-all duration-200 hover:bg-[var(--accent)] hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <BellRing className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
              <span className="whitespace-nowrap">Avísame</span>
            </a>
          ) : (
            <button
              type="button"
              onClick={handleAdd}
              aria-label={`Agregar ${product.name} al carrito`}
              // Brandon 2026-06-12: fondo BLANCO + icono NEGRO (antes accent).
              // El well de la imagen es blanco también en dark → icono dark fijo
              // (gray-900 en ambos temas) para contraste garantizado.
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-900 dark:text-gray-900 shadow-lg ring-1 ring-black/5 transition-all duration-200 hover:bg-white hover:scale-105 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-raised)]"
            >
              <ShoppingCart className="h-5 w-5" strokeWidth={2.25} aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* ── Contenido ──────────────────────────────────────────────────────────
          Brandon 2026-05-18 v3: mobile compacto (p-3, gap-y reducido), desktop
          igual (p-4 con min-h del título para alinear cards en grid). */}
      <div className="flex flex-1 flex-col p-2.5 sm:p-3 min-w-0">
        {/* Nombre — text-base font-bold, 2 lineas, mayor presencia.
            Mobile: sin min-h (card horizontal escala según content).
            Link inerte en mobile (el cliente en cel solo usa "Agregar"). */}
        <Link
          href={productHref}
          className={isCompact ? undefined : "pointer-events-none sm:pointer-events-auto"}
          tabIndex={isCompact ? undefined : -1}
          aria-hidden={isCompact ? undefined : "true"}
        >
          <h3 className="text-sm sm:text-[0.95rem] font-bold leading-snug text-[var(--text-primary)] line-clamp-2 sm:min-h-[2.5rem] transition-colors">
            {product.name}
          </h3>
        </Link>

        {/* Descripción — text-sm bold-medium, leading generoso.
            Mobile: 1 línea truncate (espacio limitado en card horizontal). */}
        {product.description && (
          <p className="mt-0.5 text-xs font-medium leading-snug text-[var(--text-secondary)] line-clamp-1">
            {product.description}
          </p>
        )}

        {/* Tienda — logo (avatar) + nombre, CLICKEABLE → /marketplace/[slug].
            Brandon 2026-06-05: el cliente identifica la tienda de un vistazo
            (ej. "Pollería El Dorado" con su logo) y puede ir directo a verla.
            Visible también en mobile (antes era sm+) porque el logo es señal
            clave de confianza/marca. En storefront propio (hideStore) se omite. */}
        {product.storeName && !hideStore && (
          <Link
            href={product.storeSlug ? `/marketplace/${product.storeSlug}` : productHref}
            className="mt-2 flex w-fit max-w-full items-center gap-1.5 text-xs sm:text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
            aria-label={`Ver tienda ${product.storeName}`}
          >
            {product.storeLogo ? (
              <span className="relative h-5 w-5 sm:h-6 sm:w-6 shrink-0 overflow-hidden rounded-full border border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
                <Image
                  src={product.storeLogo}
                  alt={product.storeName}
                  fill
                  sizes="24px"
                  className="object-cover"
                />
              </span>
            ) : (
              <StoreIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate hover:underline">{product.storeName}</span>
          </Link>
        )}

        {/* Comentarios — chip social proof (Brandon 2026-06-06): globo + count.
            Click → abre el modal del producto donde viven los comentarios. */}
        {(product.commentCount ?? 0) > 0 && (
          <button
            type="button"
            onClick={handleAdd}
            aria-label={`Ver ${product.commentCount} comentario${product.commentCount === 1 ? "" : "s"} de ${product.name}`}
            className="mt-1.5 inline-flex w-fit items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
          >
            <MessageCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
            <span className="tabular-nums">{product.commentCount}</span>
            <span className="hidden sm:inline">comentario{product.commentCount === 1 ? "" : "s"}</span>
          </button>
        )}

        {/* Precio — RESALTADO + ahorro visible. Brandon 2026-06-12: el CTA
            (carrito) ahora FLOTA dentro de la imagen (abajo-derecha), así que
            acá va SOLO el precio → bloque más compacto y junto. */}
        <div className="mt-auto pt-1.5">
          <div className="min-w-0">
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
                  "text-base sm:text-lg font-black leading-none tabular-nums tracking-[var(--ls-tight)]",
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
            {/* MK-12 — Stock con jerarquía de urgencia. Audit mobile #5: la
                urgencia (≤5: "Quedan 3 — se agota") sí ayuda a comprar y se ve
                en TODOS lados. El genérico "Stock: 999" es ruido → SOLO desktop. */}
            {product.stock != null && product.stock > 0 && product.stock <= 5 && (
              <span
                className={cn(
                  "mt-1 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider",
                  product.stock <= 3 ? "text-[var(--data-error-500)]" : "text-[var(--data-warning-500)]",
                )}
              >
                {product.stock <= 3 && (
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--data-error-500)] animate-pulse" />
                )}
                {`Quedan ${product.stock}${product.stock <= 3 ? " — se agota" : ""}`}
              </span>
            )}
            {product.stock != null && product.stock > 5 && (
              <span className="mt-1 hidden lg:inline-flex items-center gap-1 text-xs font-medium text-[var(--text-tertiary)]">
                {`Stock: ${product.stock}`}
              </span>
            )}
          </div>

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
          onAddToCart={(qty) => {
            // Brandon 2026-05-31 fix: antes llamaba handleAdd() → abría el
            // ProductModifierModal ENCIMA del QuickView (modal anidado) y el
            // item NO entraba al carrito ("no agrega" reportado). Ahora:
            //  - con adicionales → cierra el peek y abre "Armá tu pedido"
            //  - sin adicionales → agrega DIRECTO la cantidad elegida y cierra.
            if ((product.modifierGroups?.length ?? 0) > 0) {
              setQuickViewOpen(false);
              setModifierModalOpen(true);
            } else {
              addDirect(qty);
              setQuickViewOpen(false);
            }
          }}
        />
      )}

      {/* Modal "Armá tu pedido" — SIEMPRE disponible (Brandon 2026-05-27).
          Con adicionales muestra los grupos; sin adicionales, solo cantidad. */}
      {(
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
            storeLogo: product.storeLogo ?? null,
            description: product.description ?? null,
          }}
          groups={product.modifierGroups ?? []}
          onConfirm={({ quantity, modifiers, finalUnitPrice }) => {
            // Brandon 2026-05-18 v6: usar `addItem` directo (NO
            // addItemWithUndo) para evitar abrir el AddedToCartDrawer
            // encima del modal de modifiers. El producto + adicionales
            // se agregan al cart (y se persisten al checkout/admin igual)
            // y el cliente vuelve al storefront sin un segundo modal.
            addItem({
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
              modifiers,
              modifierHash: modifierHashOf(modifiers),
              quantity,
            });
            setModifierModalOpen(false);
            celebrate({ intensity: "sm" }); // 🎉 agregado al carrito
          }}
        />
      )}
    </motion.article>
  );
}
