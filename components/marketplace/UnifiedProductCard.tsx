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
  Check,
  Heart,
  Timer,
  // Brandon 2026-05-18 v5: Minus + Plus removidos — el stepper mobile inferior
  // se quitó porque ahora el CTA mobile = círculo icon-only (igual que desktop).
  // El decremento se hace desde el carrito.
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
  const { items: cartItems, addItem } = useMarketplaceCart();
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
        "group relative flex w-full overflow-hidden rounded-2xl sm:rounded-xl",
        isCompact ? "flex-col" : "flex-row sm:flex-col",
        "bg-[var(--surface-raised)] border border-[var(--rule-soft)]",
        "transition-[border-color,box-shadow,transform] duration-200",
        "hover:border-[var(--accent)]/60 hover:shadow-[0_12px_32px_-8px_color-mix(in oklab, var(--accent) 28%, transparent)]",
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
              "relative overflow-hidden bg-white dark:bg-gray-900",
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
          className={isCompact ? undefined : "pointer-events-none sm:pointer-events-auto"}
          tabIndex={isCompact ? undefined : -1}
          aria-hidden={isCompact ? undefined : "true"}
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

          {/* Brandon 2026-05-18 v5: CTA inline UNIFICADO desktop + mobile.
              Antes el mobile tenía un CTA full-width separado debajo del
              contenido — Brandon pidió "solo el icono", así que ahora el
              círculo h-12 w-12 al lado del precio (mismo que desktop) se
              muestra también en mobile. La imagen del card ocupa más ancho
              (w-44/176px) sin competir con un CTA full-width. */}
          <div className="relative shrink-0 flex">
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

        {/* Brandon 2026-05-18 v5: CTA mobile inferior REMOVIDO. El botón
            circular icon-only (h-12 w-12) inline al lado del precio
            arriba ya sirve tanto para mobile como desktop — un solo CTA,
            sin duplicación visual. Más espacio para que la imagen w-44
            (176px) ocupe más del ancho del card. */}

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
              setJustAdded(true);
              setTimeout(() => setJustAdded(false), 1200);
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
            setJustAdded(true);
            celebrate({ intensity: "sm" }); // 🎉 agregado al carrito
            setTimeout(() => setJustAdded(false), 1200);
          }}
        />
      )}
    </motion.article>
  );
}
