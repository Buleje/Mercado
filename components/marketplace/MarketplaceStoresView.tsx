"use client";

import { useRef, memo } from "react";
import {
  MapPin,
  Star,
  Package,
  LocateFixed,
  Plane,
  HardHat,
  Moon,
  Bike,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { m } from "framer-motion";
import type { MarketplaceStore } from "@/components/marketplace/useMarketplaceGeo";
import type { QuickChipId } from "@/components/marketplace/QuickFilterChips";
import { StoreCardCanonical } from "@buleje/design-system";
import MiniBulejeBanner from "@/components/marketplace/MiniBulejeBanner";
import FollowStoreButton from "@/components/marketplace/FollowStoreButton";
import {
  useLastOrdersByStore,
  formatDaysAgo,
  type LastOrderInfo,
} from "@/hooks/use-last-orders-by-store";

/* ── Category config ───────────────────────────────────────────────────────── */

export const CATEGORIES = [
  { id: "todos", label: "Todos" },
  { id: "bodega", label: "Bodegas" },
  { id: "minimarket", label: "Minimarkets" },
  { id: "fruteria", label: "Fruterías" },
  { id: "carniceria", label: "Carnicerías" },
  { id: "panaderia", label: "Panaderías" },
  { id: "licoreria", label: "Licorerías" },
  { id: "farmacia", label: "Farmacias" },
  { id: "restaurante", label: "Restaurantes" },
];

/* ── Zones ─────────────────────────────────────────────────────────────────── */

// ZONES re-exportado del catálogo canónico — `/tiendas` lo deriva runtime de
// los stores publicados via `deriveActiveZones(stores)`. Esta constante se
// mantiene SOLO como fallback estático cuando la lista aún no cargó (skeleton
// del filtro) y para tests. No debería usarse para inventar zonas que no
// están realmente representadas en datos.
import {
  MARKETPLACE_ZONES,
  deriveActiveZones,
} from "@/lib/marketplace-zones";

export const ZONES = [
  { id: "", label: "Todas las zonas" },
  ...MARKETPLACE_ZONES.map((z) => ({ id: z.id, label: z.label })),
];

export { deriveActiveZones };

/* ── StoreCardWrapper ──────────────────────────────────────────────────────── */
/**
 * Envuelve StoreCardCanonical con:
 * - Framer Motion entrada animada (por index).
 * - Product preview strip (carga on hover/focus — lazy fetch).
 * - Badges: categoria + vacation + rating como slots del canonical.
 *
 * No reemplaza la logica de negocio de hover-preview: esa logica vive aqui
 * porque es especifica de esta vista y el DS canonical no la incluye.
 */
/**
 * UnderConstructionOverlay — diagonal banner sobre la portada de la card
 * cuando el dueno habilita el flag "Tienda en construccion" en el admin
 * (/admin?tab=marketplace → Mi Tienda Personal). Cubre la imagen con tinte
 * + cinta amarilla con el mensaje custom o "Tienda en construccion" default.
 */
/**
 * ClosedNowOverlay — marca de agua semi-transparente sobre la portada cuando
 * la tienda está fuera de su horario configurado. Distinto de
 * UnderConstructionOverlay (cinta amarilla diagonal) — éste es un velo
 * gris con ícono luna + "CERRADA" + próxima apertura.
 */
/** Formatea ISO "2026-05-04T08:00:00" → "Abre mañana 8:00 AM" / "Abre lunes 7:00 AM". */
function formatNextOpening(iso?: string | null): string | null {
  if (!iso) return null;
  const next = new Date(iso);
  if (Number.isNaN(next.getTime())) return null;
  const now = new Date();
  const sameDay = next.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = next.toDateString() === tomorrow.toDateString();
  const time = next.toLocaleTimeString("es-PE", { hour: "numeric", minute: "2-digit", hour12: true });
  if (sameDay) return `Abre hoy ${time}`;
  if (isTomorrow) return `Abre mañana ${time}`;
  const day = next.toLocaleDateString("es-PE", { weekday: "long" });
  return `Abre ${day} ${time}`;
}

function ClosedNowOverlay({ nextOpeningLabel }: { nextOpeningLabel?: string | null }) {
  return (
    <div
      aria-hidden
      className="absolute inset-0 z-10 bg-linear-to-br from-slate-900/55 via-slate-800/55 to-slate-900/55 flex flex-col items-center justify-center text-center pointer-events-none backdrop-blur-[1px]"
    >
      <div className="inline-flex items-center justify-center h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-slate-100 text-slate-700 shadow-lg">
        <Moon className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2} />
      </div>
      <p className="mt-2 px-3 text-sm sm:text-base font-extrabold uppercase tracking-widest text-white drop-shadow-md">
        Cerrada ahora
      </p>
      {nextOpeningLabel && (
        <p className="mt-1 px-3 text-xs sm:text-sm font-medium text-white/90 drop-shadow">
          {nextOpeningLabel}
        </p>
      )}
    </div>
  );
}

function UnderConstructionOverlay({ message }: { message?: string | null }) {
  return (
    <>
      {/* Tinte semi-translucido + iconos centro */}
      <div
        aria-hidden
        className="absolute inset-0 z-10 bg-linear-to-br from-amber-900/45 via-[var(--data-warning-500)]/40 to-[var(--data-warning-500)]/35 flex flex-col items-center justify-center text-center pointer-events-none"
      >
        <div className="inline-flex items-center justify-center h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-[var(--data-warning-500)] text-white shadow-lg">
          <HardHat className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2} />
        </div>
        <p className="mt-2 px-3 text-[length:var(--ts-xs)] sm:text-sm font-extrabold uppercase tracking-wider text-white drop-shadow-md">
          {message?.trim() ? message : "Tienda en construcción"}
        </p>
      </div>
      {/* Cinta diagonal amarillo/negro */}
      <div
        aria-hidden
        className="absolute -left-8 top-3 z-20 rotate-[-25deg] bg-[var(--data-warning-500)] text-black px-10 py-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-widest shadow-md pointer-events-none"
      >
        En construcción
      </div>
    </>
  );
}

const StoreCardWrapper = memo(function StoreCardWrapper({
  store,
  index,
  lastOrder,
}: {
  store: MarketplaceStore;
  index: number;
  lastOrder?: LastOrderInfo;
}) {
  // Brandon, mayo 14 2026: product preview strip eliminado de las cards.
  // Antes mostrábamos 3 productos en hover/intersección — generaba ~10×
  // requests adicionales y saturaba visualmente la card. Si el cliente
  // quiere ver productos, hace click → storefront completo.
  const cardRef = useRef<HTMLDivElement>(null);

  // ── Slots para StoreCardCanonical ──────────────────────────────────────────
  // Brandon 2026-05-21 rediseño Rappi/Uber Eats:
  // - Rating + promos → coverOverlay (encima del cover, top-left)
  // - badges del DS → vacío (no usamos esa fila)
  // - footer del DS → contiene TODO el contenido del body:
  //     línea 1: nombre + rating pill (justify-between)
  //     línea 2: meta (categoría · zona · delivery min, truncate)
  //     línea 3 condicional: trust chips (envío gratis, mín pedido)

  // Aria description enriquecida — antes vivía en el avatar overlay que
  // removimos. Se usa adentro del footer como sr-only.
  const ratingTextAria = store.rating > 0 ? `, ${Number(store.rating).toFixed(1)} estrellas` : "";
  const zoneTextAria = store.zone ? `, ${store.zone}` : "";
  const ariaLabel = `${store.name}${zoneTextAria}${ratingTextAria}${store.vacationMode ? " — de vacaciones" : ""}`;

  // ── Overlay sobre el cover: rating pill + promo + vacaciones ──
  const coverOverlay = (
    <>
      {store.rating > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/95 dark:bg-gray-950/90 backdrop-blur-sm shadow-sm text-[length:var(--ts-2xs)] font-extrabold text-[var(--text-primary)]">
          <Star className="h-3 w-3 fill-current text-[var(--accent)]" aria-hidden="true" />
          <span className="tabular-nums">{Number(store.rating).toFixed(1)}</span>
          {store.reviewCount > 0 && (
            <span className="text-[var(--text-tertiary)] font-semibold tabular-nums">
              · {store.reviewCount}
            </span>
          )}
        </span>
      )}
      {store.activePromos != null && store.activePromos > 0 && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-500 text-white text-[length:var(--ts-2xs)] font-extrabold shadow-sm">
          {store.activePromos} {store.activePromos === 1 ? "oferta" : "ofertas"}
        </span>
      )}
      {lastOrder && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--accent)] text-white text-[length:var(--ts-2xs)] font-extrabold shadow-sm">
          <span aria-hidden className="h-1 w-1 rounded-full bg-white" />
          {formatDaysAgo(lastOrder.daysAgo)}
        </span>
      )}
      {store.vacationMode && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/95 dark:bg-gray-950/90 backdrop-blur-sm text-[length:var(--ts-2xs)] font-extrabold text-[var(--data-warning-500)] shadow-sm">
          <Plane className="h-2.5 w-2.5" strokeWidth={2} aria-hidden="true" />
          Vacaciones
        </span>
      )}
    </>
  );

  // ── Body: nombre + meta + trust en bloque único pasado como footer ──
  // El DS renderiza `footer` debajo del nombre por default, pero acá pasamos
  // `name=""` al canonical via `aria-label` y montamos TODO el contenido nosotros.
  // En realidad el canonical SIEMPRE renderiza el nombre — entonces:
  //   - canonical renderiza name como p (línea 1, line-clamp-2)
  //   - footer renderiza línea 2 (meta) + línea 3 (trust)
  // Pero queremos nombre + rating en MISMA línea (justify-between). El rating
  // ya está en coverOverlay → el body puede mantener su layout natural y la
  // línea 1 (nombre) usa todo el ancho sin competir con rating.
  const deliveryLabel =
    store.deliveryMinutes && store.deliveryMinutes > 0
      ? `${Math.max(15, store.deliveryMinutes - 10)}–${store.deliveryMinutes + 5} min`
      : "25–35 min";

  const metaParts = [
    store.category && store.category !== "todos"
      ? store.category.charAt(0).toUpperCase() + store.category.slice(1)
      : null,
    store.zone || null,
    deliveryLabel,
  ].filter(Boolean) as string[];

  const footer = (
    <div className="flex flex-col gap-1.5">
      {/* sr-only enriched aria description (rating, zone, vacación) — antes
          vivía en el `avatar` overlay que ya removimos (rediseño Rappi v3). */}
      <span className="sr-only">{ariaLabel}</span>
      {/* Línea meta: categoría · zona · delivery time (1 línea, truncate) */}
      <div className="flex items-center gap-1 text-[length:var(--ts-xs)] text-[var(--text-tertiary)] truncate">
        <MapPin className="h-3 w-3 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
        <span className="truncate font-semibold text-[var(--text-secondary)]">
          {metaParts.join(" · ")}
        </span>
      </div>

      {/* Línea trust chips: envío gratis y/o mín pedido (condicional) */}
      {(store.freeDelivery ||
        (store.minOrderAmount != null && store.minOrderAmount > 0)) && (
        <div className="flex items-center gap-1.5">
          {store.freeDelivery && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[length:var(--ts-2xs)] font-extrabold text-[var(--accent)]">
              <Bike className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden="true" />
              Envío gratis
            </span>
          )}
          {store.minOrderAmount != null && store.minOrderAmount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--surface-sunken)] text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] tabular-nums">
              Mín. S/{store.minOrderAmount}
            </span>
          )}
        </div>
      )}
    </div>
  );

  return (
    <m.div
      ref={cardRef}
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      className="relative"
    >
      {/* Overlay status (cerrado / construcción) — sobrepuesto al canonical
          card limitado al área del cover (aspect-[16/9] mobile, [4/3] desktop)
          via posicionamiento absoluto. El aspect-ratio debe matchear el del
          StoreCardCanonical para que el overlay cubra exactamente el cover.
          Brandon 2026-05-21: mobile cards más bajas estilo Rappi → 16/9. */}
      {store.underConstruction ? (
        <div className="absolute top-0 left-0 right-0 aspect-[16/9] sm:aspect-[4/3] pointer-events-none z-10 rounded-t-lg overflow-hidden">
          <UnderConstructionOverlay message={store.underConstructionMessage} />
        </div>
      ) : store.isOpenNow === false ? (
        <div className="absolute top-0 left-0 right-0 aspect-[16/9] sm:aspect-[4/3] pointer-events-none z-10 rounded-t-lg overflow-hidden">
          <ClosedNowOverlay nextOpeningLabel={formatNextOpening(store.nextOpeningAt)} />
        </div>
      ) : null}

      {/* StoreCardCanonical: aria-label override via href hack not needed —
          the canonical already sets aria-label={name} on the <a>. The richer
          aria description (zone, rating, vacation) is provided via the sr-only
          text rendered inside the footer slot, which screen readers will read. */}
      <StoreCardCanonical
        storeId={store.id || store.slug}
        name={store.name}
        slug={store.slug}
        imageUrl={store.cover || store.logo}
        variant="compact"
        footer={footer}
        coverOverlay={coverOverlay}
        coverBottomLeft={
          <div
            className="h-9 w-9 sm:h-11 sm:w-11 rounded-full overflow-hidden bg-[var(--surface-raised)] border-2 border-white dark:border-gray-900 shadow-md flex items-center justify-center"
            aria-hidden="true"
          >
            {store.logo ? (
              <Image
                src={store.logo}
                alt=""
                width={48}
                height={48}
                sizes="48px"
                quality={70}
                loading="lazy"
                className="object-cover w-full h-full"
              />
            ) : (
              <span className="text-sm sm:text-base font-black text-white bg-linear-to-br from-[var(--accent)] to-[var(--accent)]/70 h-full w-full flex items-center justify-center">
                {store.name.trim().charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        }
        // Brandon 2026-05-21: mobile cards menos altas estilo Rappi.
        // 16/9 mobile (360x202) vs 4/3 desktop (360x270). Reduce el alto
        // del cover en 70px aprox., permite ver más cards sin scroll en cel.
        imageWrapperClassName="aspect-[16/9] sm:aspect-[4/3]"
        renderImage={({ src, alt, className }) => (
          <Image
            src={src}
            alt={alt}
            fill
            className={className}
            // Brandon 2026-05-20 perf:
            // · quality=65 → cards de listing son thumbnails 50vw mobile, no
            //   pierden nitidez visible y ahorra ~25% bytes vs default 75.
            // · sizes ajustado: en mobile 1 columna del grid (no 50vw), en
            //   tablet 2 cols, desktop 3 cols (~360px máx) — Next escoge la
            //   variante de imagen más chica que sirva.
            // · Los 2 primeros cards (index 0,1) = LCP candidates → priority
            //   + fetchPriority high. Resto lazy con fetchPriority low para
            //   no competir con el LCP por bandwidth.
            sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 360px"
            quality={70}
            priority={index < 2}
            fetchPriority={index < 2 ? "high" : "low"}
          />
        )}
        renderImageFallback={() => (
          <MiniBulejeBanner storeName={store.name} category={store.category} />
        )}
        // Brandon 2026-05-21 perf v4: SPA navigation con Next Link en lugar de
        // <a> nativo. El DS expone el slot `renderLink` precisamente para que
        // los consumers Next obtengan prefetch automático + client-side routing.
        // Sin este slot, cada click a una tienda hacía full page reload (TTFB
        // 0.3s+ visible). Con Link, navegación instantánea (chunks pre-warm).
        renderLink={({ href, className, ariaLabel, children }) => (
          <Link href={href} className={className} aria-label={ariaLabel}>
            {children}
          </Link>
        )}
      />
      {/* TS-15 follow store — fuera del Link para no anidar interactivos */}
      <div className="absolute top-3 right-3 z-10">
        <FollowStoreButton slug={store.slug} storeName={store.name} />
      </div>
    </m.div>
  );
}, (prev, next) =>
  prev.store.id === next.store.id &&
  prev.store.slug === next.store.slug &&
  prev.store.rating === next.store.rating &&
  prev.store.vacationMode === next.store.vacationMode &&
  prev.index === next.index,
);

/* ── MarketplaceStoresView Props ───────────────────────────────────────────── */

interface MarketplaceStoresViewProps {
  stores: MarketplaceStore[];
  loading: boolean;
  error: string | null;
  search: string;
  category: string;
  zone: string;
  geoActive: boolean;
  /** Live store count for the sr-only aria-live region */
  filteredStores: MarketplaceStore[];
  onRetry: () => void;
  onClearAll: () => void;
  /** Quick-filter chips active in MarketplaceContent */
  activeChips?: Set<QuickChipId>;
}

/* ── Chip filter helpers + MarketplaceStoresView ───────────────────────────── */

/**
 * Returns true when the store passes every active quick-filter chip.
 * Fields that don't exist on a given store are skipped (tolerant).
 */
function passesChips(
  store: MarketplaceStore & Partial<StoreChipFields>,
  chips: Set<QuickChipId>,
): boolean {
  if (chips.size === 0) return true;

  for (const chip of chips) {
    switch (chip) {
      case "open_now": {
        // Only filter if the store carries openHours data.
        // PENTEST 2026-05-18 Fase 2 P0 #28: openHours puede venir como
        // Array<DayHours> O como Record<string, unknown> (JSONB del backend
        // se deserializa como objeto en algunos paths). Si es Object con keys
        // string, store.openHours[dayIndex] retorna undefined → return false
        // silenciaba tiendas que SÍ están abiertas. Fix: validar Array.isArray
        // antes de indexar. Si NO es array, skipear el filtro (mejor mostrar
        // la tienda y dejar que el usuario decida que filtrarla por error).
        if (!("openHours" in store) || store.openHours == null) break;
        if (!Array.isArray(store.openHours)) {
          // Schema desconocido — saltar el filtro en lugar de silenciar la tienda
          break;
        }
        const now = new Date();
        const dayIndex = now.getDay(); // 0=Sun … 6=Sat
        const minutesNow = now.getHours() * 60 + now.getMinutes();
        const todayHours = store.openHours[dayIndex];
        if (!todayHours || typeof todayHours.open !== "number") break;
        const open = todayHours.open * 60 + (todayHours.openMin ?? 0);
        const close = todayHours.close * 60 + (todayHours.closeMin ?? 0);
        if (minutesNow < open || minutesNow >= close) return false;
        break;
      }
      case "free_delivery": {
        if (!("deliveryFee" in store) && !("freeDelivery" in store)) break;
        const isFree =
          store.freeDelivery === true || store.deliveryFee === 0;
        if (!isFree) return false;
        break;
      }
      case "has_offers": {
        if (!("hasOffers" in store) && !("activePromos" in store)) break;
        const hasOffers =
          store.hasOffers === true ||
          (typeof store.activePromos === "number" && store.activePromos > 0);
        if (!hasOffers) return false;
        break;
      }
      case "top_rated": {
        if ((store.rating ?? 0) < 4.5) return false;
        break;
      }
      case "new_stores": {
        if (!("createdAt" in store) || store.createdAt == null) break;
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        const age = Date.now() - new Date(store.createdAt).getTime();
        if (age >= thirtyDaysMs) return false;
        break;
      }
      // ── TS-05 chips nuevos ──
      case "accepts_yape": {
        if (!("paymentMethods" in store)) break;
        const methods = store.paymentMethods;
        if (!Array.isArray(methods) || !methods.includes("yape")) return false;
        break;
      }
      case "no_min_order": {
        if (!("minOrderAmount" in store)) break;
        if ((store.minOrderAmount ?? 0) > 0) return false;
        break;
      }
      case "open_24h": {
        if (!("openHours" in store) || store.openHours == null) break;
        // Una tienda es 24h si todos los días tiene open=0 close=24 (o equivalente).
        const all24h = store.openHours.every(
          (h) =>
            h != null &&
            h.open === 0 &&
            h.openMin === 0 &&
            (h.close === 24 || (h.close === 23 && h.closeMin === 59)),
        );
        if (!all24h) return false;
        break;
      }
    }
  }
  return true;
}

/* ── Optional extended fields that may exist on store objects ───────────────── */

interface DayHours {
  open: number;
  openMin: number;
  close: number;
  closeMin: number;
}

interface StoreChipFields {
  openHours: DayHours[] | null;
  deliveryFee: number;
  freeDelivery: boolean;
  hasOffers: boolean;
  activePromos: number;
  createdAt: string | Date;
  paymentMethods: string[];
  minOrderAmount: number;
}

export default function MarketplaceStoresView({
  stores: _stores,
  loading,
  error,
  search,
  category,
  zone,
  geoActive,
  filteredStores: filteredStoresProp,
  onRetry,
  onClearAll,
  activeChips,
}: MarketplaceStoresViewProps) {
  const chips = activeChips ?? new Set<QuickChipId>();

  // TS-08 — mapa storeSlug → último pedido del cliente (cache 5min)
  const lastOrdersByStore = useLastOrdersByStore();

  // Apply chip filters on top of whatever geo/category filtering already happened
  const filteredStores =
    chips.size === 0
      ? filteredStoresProp
      : filteredStoresProp.filter((s) =>
          passesChips(s as MarketplaceStore & Partial<StoreChipFields>, chips),
        );

  return (
    <>
      {/* Error state */}
      {error && (
        <div
          role="alert"
          className="mt-6 flex items-center gap-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-2xl px-5 py-4"
        >
          <span className="text-sm text-[var(--data-error-700)] dark:text-red-400 flex-1">{error}</span>
          <button
            onClick={onRetry}
            aria-label="Reintentar cargar tiendas"
            className="text-xs font-bold text-[var(--data-error-600)] hover:text-red-800 underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Loading state — skeleton matched al grid final (1 col mobile, 2/3/4 desktop) */}
      {loading && (
        <div
          aria-busy="true"
          aria-label="Cargando tiendas..."
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-4 mt-6"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              aria-hidden="true"
              className="bg-[var(--surface-raised)] border border-[var(--rule-soft)] rounded-2xl overflow-hidden"
            >
              {/* Image area + badges shimmer */}
              <div className="relative aspect-[4/3] bg-[var(--surface-sunken)] animate-pulse">
                <div className="absolute top-3 left-3 flex gap-2">
                  <div className="h-6 w-12 rounded-full bg-[var(--surface-raised)]/70" />
                  <div className="h-6 w-16 rounded-full bg-[var(--surface-raised)]/70" />
                </div>
              </div>
              {/* Body */}
              <div className="p-4 space-y-3">
                <div className="h-5 bg-[var(--surface-sunken)] rounded-lg w-3/4 animate-pulse" />
                <div className="h-3 bg-[var(--surface-sunken)] rounded-lg w-full animate-pulse" />
                <div className="flex items-center gap-3">
                  <div className="h-3 bg-[var(--surface-sunken)] rounded-lg w-16 animate-pulse" />
                  <div className="h-3 bg-[var(--surface-sunken)] rounded-lg w-20 animate-pulse" />
                  <div className="h-3 bg-[var(--surface-sunken)] rounded-lg w-16 animate-pulse" />
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-[var(--rule-soft)]">
                  <div className="h-4 bg-[var(--surface-sunken)] rounded-lg w-24 animate-pulse" />
                  <div className="h-3 bg-[var(--surface-sunken)] rounded-lg w-16 animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state — uses EmptyState slots from components/ui-system/EmptyState */}
      {!loading && !error && filteredStores.length === 0 && (
        <div className="mt-12 flex flex-col items-center justify-center text-center py-16">
          <div className="w-24 h-24 rounded-full bg-[var(--surface-sunken)] flex items-center justify-center mb-6">
            <Package className="h-12 w-12 text-[var(--text-tertiary)]" aria-hidden="true" />
          </div>
          <h3 className="text-xl font-extrabold text-[var(--text-primary)] mb-2">
            No encontramos tiendas
          </h3>
          <p className="text-sm text-[var(--text-secondary)] max-w-md">
            {search
              ? `No hay tiendas que coincidan con "${search}". Prueba con otro nombre.`
              : "Aún no hay tiendas publicadas en esta categoría. ¡Pronto habrá más!"}
          </p>
          {(search || category !== "todos" || zone || geoActive) && (
            <button
              onClick={onClearAll}
              aria-label="Quitar todos los filtros y ver todas las tiendas"
              className="mt-4 px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
            >
              Ver todas las tiendas
            </button>
          )}
        </div>
      )}

      {/* Results count live region */}
      {!loading && !error && filteredStores.length > 0 && (
        <p
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {`Mostrando ${filteredStores.length} tienda${filteredStores.length !== 1 ? "s" : ""}`}
        </p>
      )}

      {/* Store grid */}
      {!loading && !error && filteredStores.length > 0 && (
        <div
          role="list"
          aria-label={`${filteredStores.length} tienda${filteredStores.length !== 1 ? "s" : ""} encontrada${filteredStores.length !== 1 ? "s" : ""}`}
          // Brandon 2026-05-21 rediseño UX: 1 col mobile (modelo Doordash/
          // Airbnb/Yelp/Uber Eats) en lugar de 2 cols compactas.
          // Razón: Buleje tiene 3-6 tiendas hoy, density NO es prioridad.
          // Cards full-width mobile dan:
          // - imagen hero 360×180 (en vez de 150×100 squeezed)
          // - nombre tienda completo sin truncate
          // - rating + zona + tiempo de entrega legibles
          // - mejor tap target para conversión
          // Desktop sin cambios significativos (sm:2, md:3, xl:4 sigue
          // teniendo density útil cuando hay más viewport).
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-4 mt-6"
        >
          {filteredStores.map((store, i) => (
            <div key={store.id} role="listitem">
              <StoreCardWrapper
                store={store}
                index={i}
                lastOrder={lastOrdersByStore[store.slug]}
              />
            </div>
          ))}
        </div>
      )}

      {/* Geo active indicator (sr-only) */}
      {geoActive && (
        <p className="sr-only" aria-live="polite">
          <LocateFixed className="h-4 w-4" aria-hidden="true" />
          Ordenado por cercanía
        </p>
      )}
    </>
  );
}
