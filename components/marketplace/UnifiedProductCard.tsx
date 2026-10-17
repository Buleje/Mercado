"use client";
"use memo";

// React Compiler annotation (audit perf 2026-05-19): opt-in al auto-memo
// del compiler. Este componente se renderiza decenas de veces por página
// de catálogo (UnifiedProductCard es la card principal del marketplace).
// El compiler auto-memoiza props + hooks, reduce re-renders innecesarios.
import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { m as motion } from "framer-motion";
import {
  ShoppingCart,
  Plus,
  Eye,
  Store as StoreIcon,
  GitCompareArrows,
  MessageCircle,
  // Brandon 2026-06-12: agotados ya no muestran un carrito muerto — muestran
  // "Avísame" (campana) que abre WhatsApp a Buleje para avisar al reponer.
  BellRing,
  Timer,
} from "@buleje/design-system/icons";

import { ProductPhotoFallback } from "@/components/marketplace/ProductPhotoFallback";
import { cn } from "@/lib/utils";
import { useAgregarProducto } from "@/hooks/use-agregar-producto";
import { useHoverPrefetch } from "@/hooks/use-hover-prefetch";
import { useCompare } from "@/contexts/compare-context";
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
  /** Prueba social de la tienda — alimenta el bloque de confianza del modal. */
  storeReviewCount?: number;
  storeCategory?: string | null;
  /** Tamaño real del catálogo (no unidades vendidas). */
  storeProductCount?: number;
  /** ISO de creación de la tienda — antigüedad ("X años en Buleje"). */
  storeSince?: string | null;
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
  /**
   * La sección que contiene este card está SOBRE EL PLIEGUE.
   *
   * Sólo entonces las primeras imágenes se piden con `priority` (eager +
   * fetchpriority high). Antes iba `priority={index < 4}` a secas: cada carrusel
   * de la página se llevaba cuatro imágenes eager, incluidas las de secciones a
   * 5.000px de scroll. En la home eso eran 15 imágenes descargándose antes de lo
   * que el usuario sí ve, compitiendo con el render — y medido, el LCP de la
   * home ni siquiera es una imagen, es texto.
   *
   * El card no puede saber dónde está; la sección sí. Por eso es opt-in.
   */
  aboveFold?: boolean;
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
  aboveFold = false,
}: UnifiedProductCardProps) {
  const isCompact = layout === "compact";
  // Lógica de carrito compartida con la tarjeta de la home (hooks/use-agregar-producto):
  // líneas del carrito, cantidad, tope de stock, «Avísame», vuelo al carrito y
  // el modal «Arma tu pedido» con su re-edición. Mismo comportamiento de siempre.
  const {
    inCartQty,
    isOutOfStock,
    atStockCap,
    notifyWaHref,
    imgWrapRef,
    handleAdd,
    handleIncrement,
    setModifierModalOpen,
    modalProps,
  } = useAgregarProducto(product);
  const { add: addToCompare, remove: removeFromCompare, has: isInCompare, items: compareItems, max: compareMax } = useCompare();
  const [compareLimitMsg, setCompareLimitMsg] = useState(false);
  const countdown = useCountdown(variant === "flash" ? endsAt : undefined);

  // Brandon 2026-07-06: al tocar un producto → su PÁGINA DE DETALLE (no la
  // tienda). Antes el default caía a `/marketplace/{slug}` (portada de la
  // tienda), lo que confundía en "Productos destacados"/recomendados. Los callers
  // que ya pasan `href` explícito (catálogo) mantienen su destino.
  const productHref =
    href ??
    (product.storeSlug
      ? `/marketplace/${product.storeSlug}/producto/${product.id}`
      : "/marketplace");

  const { onMouseEnter, onMouseLeave } = useHoverPrefetch(productHref);

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
      // perf audit P2: las primeras ~4 cards (above-the-fold) pintan SIN fade ni
      // delay para no penalizar el LCP; el resto conserva la entrada escalonada
      // (con delay capeado a 6 para que no se acumule indefinidamente).
      initial={index < 4 ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 6) * 0.04 }}
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
        // Agotado: NO atenuamos toda la card (el texto debe quedar legible); el
        // "apagado" vive solo en la imagen (velo claro sutil arriba). Brandon 2026-07-05.
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
            ref={imgWrapRef}
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
                // Las primeras ~4 imágenes son candidatas a LCP, pero SÓLO si
                // la sección está sobre el pliegue (ver `aboveFold`).
                priority={aboveFold && index < 4}
                className="object-contain p-2 transition-transform duration-500 group-hover:scale-[1.04]"
                sizes={
                  isCompact
                    ? "(max-width: 640px) 42vw, (max-width: 1024px) 210px, 230px"
                    : "(max-width: 640px) 176px, (max-width: 1024px) 50vw, 33vw"
                }
              />
            ) : (
              <ProductPhotoFallback name={product.name} category={product.category} />
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

          {/* Timer badge (flash) — coral de urgencia (mismo lenguaje que el
              countdown de OfertasDelDiaHero), sólido para resaltar sobre el well
              blanco de la foto. Brandon 2026-07-06. */}
          {variant === "flash" && countdown && countdown !== "Expirado" && (
            <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[length:var(--ts-2xs)] font-bold tabular-nums bg-[var(--data-warning-600)] text-[var(--surface-canvas)] shadow-sm">
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

        {/* Acciones top-right — solo Comparar. La "Vista" (quick view) se movió
            a la barra inferior deslizante (Brandon 2026-06-24). Desktop-only al
            hover para una card limpia tipo Rappi en mobile. */}
        <div className="absolute top-2 right-2 z-10 hidden lg:flex flex-col gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
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
                ? "bg-primary/10 border-[var(--accent)]/30 text-[var(--accent)]"
                : "bg-white/95 dark:bg-gray-900/95 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:border-[var(--accent)]",
            )}
          >
            <GitCompareArrows className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          </button>
        </div>

        {/* Brandon 2026-06-24: barra inferior deslizante (hover desktop) — un
            solo botón "Previsualizar" que abre el modal "Arma tu pedido"
            (opciones + datos de tienda + agregar al carrito). Sube desde abajo
            de la imagen con animación. Oculta en mobile (card limpia tipo Rappi). */}
        <div className="absolute inset-x-0 bottom-0 z-20 hidden translate-y-full opacity-0 transition-all duration-[var(--dur-base)] group-hover:translate-y-0 group-hover:opacity-100 focus-within:translate-y-0 focus-within:opacity-100 lg:flex">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setModifierModalOpen(true);
            }}
            className="flex flex-1 items-center justify-center gap-1.5 border-t border-primary bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
            aria-label={`Previsualizar ${product.name}`}
          >
            <Eye className="h-4 w-4" strokeWidth={2} aria-hidden /> Previsualizar
          </button>
        </div>

        {/* Brandon 2026-05-18 v3: badge -N% mini en mobile xs cuando hay
            descuento. Posición top-left. Diseño compacto pill.
            En compact el bloque de badges de arriba ya lo muestra (flex en
            todos los breakpoints) — no duplicar. */}
        {!isCompact && product.discount != null && product.discount > 0 && (
          <span
            className="sm:hidden absolute top-1.5 left-1.5 z-10 inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-black tabular-nums bg-[var(--accent-600,var(--accent))] text-[var(--surface-canvas)] shadow-sm"
            aria-label={`${product.discount}% de descuento`}
          >
            -{product.discount}%
          </span>
        )}

        {/* Agotado — minimalista/elegante (Brandon 2026-07-05): sin velo negro ni
            pill oscuro centrado. Velo CLARO sutil que atenúa la imagen + chip
            discreto arriba-izquierda con tokens del DS. El nombre y el precio
            quedan nítidos (legibles), la foto se ve "apagada". */}
        {isOutOfStock && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[var(--surface-canvas)]/45"
            />
            <span className="absolute left-2 top-2 z-10 inline-flex items-center rounded-full bg-[var(--surface-canvas)]/85 px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-secondary)] shadow-sm ring-1 ring-[var(--rule-base)] backdrop-blur-sm">
              Agotado
            </span>
          </>
        )}

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
          <h3 className="text-sm sm:text-[0.95rem] font-medium leading-snug text-[var(--text-primary)] line-clamp-2 sm:min-h-[2.5rem] transition-colors">
            {product.name}
          </h3>
        </Link>

        {/* Descripción + carrito rápido (Brandon 2026-06-24): el icono de
            carrito vive a la DERECHA de la descripción y queda SIEMPRE visible
            (antes flotaba sobre la imagen). Tipografía liviana (font-normal)
            para un tono serio/profesional. Agotado → "Avísame". */}
        <div className="mt-0.5 flex items-center gap-2">
          <p className="min-w-0 flex-1 text-xs font-normal leading-snug text-[var(--text-secondary)] line-clamp-1">
            {product.description}
          </p>
          {isOutOfStock ? (
            <a
              href={notifyWaHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Avísame cuando llegue ${product.name}`}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-3 text-[length:var(--ts-xs)] font-bold text-[var(--accent)] ring-1 ring-[var(--rule-soft)] transition-all duration-200 hover:bg-[var(--accent)] hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <BellRing className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
              <span className="whitespace-nowrap">Avísame</span>
            </a>
          ) : (
            <button
              type="button"
              // Brandon 2026-06-24: primer agregado (vacío) → abre el MODAL
              // "Armá tu pedido" (opciones + tienda). Ya agregado → suma +1
              // directo + animación "vuela al carrito". Con adicionales,
              // handleIncrement abre el modal cuando hace falta elegir opciones.
              onClick={inCartQty === 0 ? handleAdd : handleIncrement}
              disabled={atStockCap}
              aria-label={
                inCartQty > 0
                  ? atStockCap
                    ? `${product.name}: alcanzaste el stock disponible`
                    : `Agregar otro ${product.name} — ${inCartQty} en el carrito`
                  : `Agregar ${product.name} al carrito`
              }
              // Minimalista (Brandon 2026-06-24): círculo claro + carrito de
              // trazo fino con insignia "+" — agregar discreto y profesional
              // (icono adapta al tema vía tokens del DS). El badge muestra "+"
              // cuando está vacío y la cantidad cuando ya hay líneas.
              className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[var(--text-primary)] ring-1 ring-[var(--rule-base)] shadow-sm transition-all duration-200 hover:ring-[var(--text-primary)]/40 hover:scale-105 active:scale-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-raised)]"
            >
              <ShoppingCart className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.5} aria-hidden />
              {inCartQty > 0 ? (
                <motion.span
                  key={inCartQty}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 20 }}
                  aria-hidden
                  className="absolute -top-1.5 -right-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[length:var(--ts-2xs)] font-black tabular-nums text-white ring-2 ring-[var(--surface-raised)]"
                >
                  {inCartQty > 99 ? "99+" : inCartQty}
                </motion.span>
              ) : (
                <span
                  aria-hidden
                  // "Agregar desde cero": SOLO borde negro (sin relleno) — se
                  // diferencia del contador (badge teal sólido con la cantidad).
                  className="absolute -top-1 -right-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-[var(--text-primary)] bg-transparent text-[var(--text-primary)]"
                >
                  <Plus className="h-2.5 w-2.5" strokeWidth={3} aria-hidden />
                </span>
              )}
            </button>
          )}
        </div>

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
            className="mt-1.5 inline-flex w-fit items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:bg-primary/10 hover:text-[var(--accent)]"
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

      {/* Modal "Arma tu pedido" — SIEMPRE disponible (Brandon 2026-05-27).
          Con adicionales muestra los grupos; sin adicionales, solo cantidad. */}
      <ProductModifierModal {...modalProps} />
    </motion.article>
  );
}
