"use client";

import { useRef, memo, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  MapPin,
  Star,
  Package,
  LocateFixed,
  Plane,
  HardHat,
  Moon,
  Bike,
  ShoppingBag,
  ArrowUpRight,
  ArrowRight,
  Tag,
  Check,
  Wallet,
  Clock,
  Truck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { FeaturedNearbyStore } from "@/lib/db/marketplace-featured.db";
import {
  type MarketplaceStore,
  haversineKm,
  ZONE_COORDS,
} from "@/components/marketplace/useMarketplaceGeo";
import { todayHoursLabel, type StoreHours } from "@/lib/marketplace-store-hours";
// Agrupación por "mundo" (Comida/Bodega/Ferretería/Electro/Farmacia) en el
// estado de navegación por defecto — mismo taxonomía que la home y los chips.
import {
  MARKETPLACE_VERTICALS,
  verticalForStoreCategory,
} from "@/lib/marketplace/verticals";
import {
  UtensilsCrossed,
  ShoppingBasket,
  Wrench,
  Smartphone,
  Pill,
  Store as StoreIcon,
  type LucideIcon,
} from "@buleje/design-system/icons";

// Drawer "Vista rápida" (peek + add sin salir de /tiendas). Lazy — usa
// framer-motion; solo se carga al primer click en una card premium.
const StoreQuickPreviewDrawer = dynamic(
  () => import("@/components/marketplace/StoreQuickPreviewDrawer"),
);

// Modal de ubicación/distancia (mapa Leaflet) — client-only, carga al 1er click.
const StoreDistanceMapModal = dynamic(
  () => import("@/components/marketplace/StoreDistanceMapModal"),
  { ssr: false },
);

// Audit #5: toFeaturedStore removido — era el adapter para la card premium
// ancha (PremiumStoreCard), que ya no se usa (todas las tiendas usan la card
// estándar).
import type { QuickChipId } from "@/components/marketplace/QuickFilterChips";
import { StoreCardCanonical } from "@buleje/design-system";
import StorePromoBanner from "./StorePromoBanner";
import { PaymentMethodIcon } from "./PaymentIcons";
// Nivel "Premium" (beneficio superadmin): card de fila completa con preview de
// productos. Se re-habilita para que /tiendas honre los niveles que promete la
// previsualizacion de /superadmin/stores (Brandon 2026-07-05).
import PremiumStoreCard, { type PremiumProduct } from "./PremiumStoreCard";
import MiniBulejeBanner from "@/components/marketplace/MiniBulejeBanner";
import FollowStoreButton from "@/components/marketplace/FollowStoreButton";
import ShareStoreButton from "@/components/marketplace/ShareStoreButton";
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
  // Brandon 2026-07-06: rediseño minimalista — fuera el gris pesado que tapaba la
  // foto. Ahora: velo blanco MUY sutil (se lee "en pausa" sin ocultar la tienda)
  // + pill limpio arriba-izquierda con el estado. La foto de la tienda se sigue
  // viendo (más apetecible que un rectángulo gris).
  const opensAt = nextOpeningLabel?.replace(/^Abre\s+/i, "") ?? null;
  return (
    <div aria-hidden className="absolute inset-0 z-10 pointer-events-none">
      {/* Atenuado sutil — la foto se sigue viendo, apenas "en pausa" (sin gris). */}
      <div className="absolute inset-0 bg-linear-to-t from-black/40 via-transparent to-black/10" />
      {/* Una sola pill limpia (minimalista). Arriba-izquierda, sin encimarse con
          nada (el cluster Destacada/promos se oculta cuando está cerrada). */}
      <span className="absolute left-2.5 top-2.5 inline-flex max-w-[calc(100%-1.25rem)] items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 shadow-sm backdrop-blur-sm dark:bg-gray-950/90">
        <Moon className="h-3 w-3 shrink-0 text-[var(--text-secondary)]" strokeWidth={2.5} aria-hidden />
        <span className="truncate text-[length:var(--ts-2xs)] font-extrabold text-[var(--text-primary)]">
          Cerrada{opensAt ? <span className="font-semibold text-[var(--text-secondary)]"> · abre {opensAt}</span> : ""}
        </span>
      </span>
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
  userCoords,
}: {
  store: MarketplaceStore;
  index: number;
  lastOrder?: LastOrderInfo;
  userCoords?: { lat: number; lng: number } | null;
}) {
  const [mapOpen, setMapOpen] = useState(false);

  // Distancia a la tienda — solo si el cliente compartió su ubicación y la
  // tienda tiene coords reales o, en su defecto, el centroide de su zona.
  const distanceKm = useMemo(() => {
    if (!userCoords) return null;
    let coords: [number, number] | null = null;
    if (typeof store.lat === "number" && typeof store.lng === "number") {
      coords = [store.lat, store.lng];
    } else {
      const zoneKey = store.zone?.toLowerCase().replace(/ /g, "_") ?? "";
      coords = ZONE_COORDS[zoneKey] ?? null;
    }
    if (!coords) return null;
    return haversineKm(userCoords.lat, userCoords.lng, coords[0], coords[1]);
  }, [userCoords, store.lat, store.lng, store.zone]);
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
  // Brandon 2026-07-06: cuando la tienda está CERRADA, el cover solo muestra el
  // badge de cerrada (ClosedNowOverlay). Ocultamos el cluster Destacada/promos/
  // vacaciones para que NADA se encime (antes chocaban top-left). El nivel
  // featured igual se distingue por el anillo teal.
  const isClosed = store.isOpenNow === false;
  const coverOverlay = isClosed ? undefined : (
    <>
      {/* Nivel "Destacada" (superadmin) — badge visible, como promete la
          previsualización de /superadmin/stores. Premium usa su propia card
          (PremiumStoreCard), así que acá solo aparece featured. */}
      {store.displayTier === "featured" && (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--accent)] text-white text-[length:var(--ts-2xs)] font-black uppercase tracking-[var(--ls-wider)] shadow-sm"
          title="Tienda destacada"
        >
          <Star className="h-2.5 w-2.5 fill-current" strokeWidth={2.5} aria-hidden="true" />
          Destacada
        </span>
      )}
      {/* Brandon 2026-06-08: rating movido a la DESCRIPCIÓN (body) → el cover
          queda limpio. Acá solo ofertas / último pedido / vacaciones. */}
      {store.activePromos != null && store.activePromos > 0 && (
        <span
          className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-rose-500 text-white text-[length:var(--ts-2xs)] font-extrabold shadow-sm tabular-nums"
          title={`${store.activePromos} ${store.activePromos === 1 ? "oferta" : "ofertas"}`}
          aria-label={`${store.activePromos} ${store.activePromos === 1 ? "oferta" : "ofertas"}`}
        >
          <Tag className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden="true" />
          {store.activePromos}
        </span>
      )}
      {lastOrder && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--accent)] text-white text-[length:var(--ts-2xs)] font-extrabold shadow-sm">
          <span aria-hidden className="h-1 w-1 rounded-full bg-white" />
          {formatDaysAgo(lastOrder.daysAgo)}
        </span>
      )}
      {store.vacationMode && (
        <span
          className="inline-flex items-center justify-center p-1 rounded-full bg-white/95 dark:bg-gray-950/90 backdrop-blur-sm text-[var(--data-warning-500)] shadow-sm"
          title="De vacaciones"
          aria-label="De vacaciones"
        >
          <Plane className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
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

  // Horario de HOY (config del admin) — solo si la tienda está abierta y no en
  // construcción. Las cerradas ya muestran su overlay "Abre …". Degrada a null
  // si el horario no viene con el shape esperado (no ensucia la card).
  const hoursToday =
    store.isOpenNow !== false && !store.underConstruction
      ? todayHoursLabel(store.openHours as unknown as StoreHours | null | undefined, new Date())
      : null;

  // Multi-zona de cobertura (config del admin en "Mi Tienda"). La zona principal
  // ya va en la meta; acá señalamos si reparte a más zonas.
  const coverageCount = Array.isArray(store.coverageZones) ? store.coverageZones.length : 0;

  // Rediseño card 2026-06-08 (Brandon): jerarquía limpia → rating · meta · trust
  // · divisor · "Ver tienda". Verificada va inline con el NOMBRE (nameSuffix del
  // DS); el nivel "Destacada" lo señala el anillo teal (isFeatured), sin chip.
  const footer = (
    <div className="flex flex-col gap-1.5">
      {/* sr-only enriched aria description (rating, zone, vacación). */}
      <span className="sr-only">{ariaLabel}</span>

      {/* Rating + reseñas — o badge "Nueva" si aún no tiene reseñas (recién
          abierta). Brandon 2026-07-06 (descubrimiento). */}
      {store.rating > 0 ? (
        <div className="flex items-center gap-1 text-[length:var(--ts-xs)]">
          <Star className="h-3.5 w-3.5 shrink-0 fill-current text-[var(--accent)]" aria-hidden="true" />
          <span className="font-extrabold tabular-nums text-[var(--text-primary)]">
            {Number(store.rating).toFixed(1)}
          </span>
          {store.reviewCount > 0 && (
            <span className="font-semibold tabular-nums text-[var(--text-tertiary)]">
              ({store.reviewCount})
            </span>
          )}
        </div>
      ) : (
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-[var(--data-success-500)]/12 px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wide text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--data-success-500)]" />
          Nueva
        </span>
      )}

      {/* Meta: categoría · zona · delivery time (1 línea, truncate). En celular
          el logo del negocio va acá; desktop usa el pin + el logo del cover. */}
      <div className="flex items-center gap-1.5 text-[length:var(--ts-xs)] text-[var(--text-tertiary)] min-w-0">
        <span
          className="md:hidden h-6 w-6 shrink-0 overflow-hidden rounded-md border border-[var(--rule-base)] bg-[var(--surface-raised)] inline-flex items-center justify-center"
          aria-hidden="true"
        >
          {store.logo ? (
            <Image src={store.logo} alt="" width={24} height={24} sizes="24px" quality={70} loading="lazy" className="object-cover w-full h-full" />
          ) : (
            <span className="text-[10px] font-black text-[var(--text-secondary)] bg-[var(--surface-sunken)] h-full w-full flex items-center justify-center">
              {store.name.trim().charAt(0).toUpperCase()}
            </span>
          )}
        </span>
        <MapPin className="hidden md:block h-3 w-3 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
        <span className="truncate font-semibold text-[var(--text-secondary)]">
          {metaParts.join(" · ")}
        </span>
      </div>

      {/* Horario de hoy (config del admin) — línea sutil, solo abiertas. */}
      {hoursToday && (
        <div className="flex items-center gap-1.5 text-[length:var(--ts-xs)] text-[var(--text-tertiary)] min-w-0">
          <Clock className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden="true" />
          <span className="truncate font-semibold text-[var(--text-secondary)]">
            Hoy {hoursToday}
          </span>
        </div>
      )}

      {/* Multi-zona de cobertura (config del admin) — solo si reparte a 2+ zonas. */}
      {coverageCount >= 2 && (
        <div className="flex items-center gap-1.5 text-[length:var(--ts-xs)] text-[var(--text-tertiary)] min-w-0">
          <Truck className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden="true" />
          <span className="truncate font-semibold text-[var(--text-secondary)]">
            Llega a {coverageCount} zonas
          </span>
        </div>
      )}

      {/* Trust chips: envío gratis, mín pedido y/o acepta fiado (condicional) */}
      {(store.freeDelivery ||
        store.acceptsFiado ||
        (store.minOrderAmount != null && store.minOrderAmount > 0)) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Fiado Digital — diferenciador #1 de Buleje. Chip destacado en teal
              para que "compra ahora, paga después" salte a la vista. */}
          {store.acceptsFiado && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--accent-soft)] max-md:bg-[var(--surface-sunken)] text-[length:var(--ts-2xs)] font-bold text-[var(--accent)] max-md:text-[var(--text-primary)]">
              <Wallet className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
              Acepta fiado
            </span>
          )}
          {store.freeDelivery && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--accent-soft)] max-md:bg-[var(--surface-sunken)] text-[length:var(--ts-2xs)] font-bold text-[var(--accent)] max-md:text-[var(--text-primary)]">
              <Bike className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
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

      {/* Pagos aceptados — estándar Buleje (Yape/Plin/Efectivo). Trust de un
          vistazo (Brandon 2026-07-06). Fila sutil bajo los chips. */}
      <div className="flex items-center gap-1.5">
        <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)]">
          Pagás:
        </span>
        <span className="flex items-center gap-1">
          {(["yape", "plin", "efectivo"] as const).map((m) => (
            <PaymentMethodIcon key={m} method={m} size="sm" />
          ))}
        </span>
      </div>

      {/* Divisor + acción "Ver tienda" — el corazón/compartir (overlay absoluto
          bottom-right) alinean a la derecha de esta fila. pr-16 reserva su lugar. */}
      <div className="mt-0.5 flex items-center border-t border-[var(--rule-soft)] pt-2 pr-16">
        <span className="inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-extrabold text-[var(--accent)] max-md:text-[var(--text-primary)] group-hover:gap-1.5 transition-all">
          Ver tienda
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
        </span>
      </div>
    </div>
  );

  // Destacada: anillo teal + leve realce para distinguirla de las estándar.
  // Audit #5 (Brandon 2026-07-05): premium ya NO usa card ancha propia — todas
  // las tiendas usan esta card estándar (grid parejo para comparar); premium y
  // featured comparten el realce "Destacada" + van primero (orderedStores).
  const isFeatured = store.displayTier === "featured" || store.displayTier === "premium";
  // Brandon 2026-05-30 (audit #5): era <m.div> con initial={false} + animate
  // estático = animación NO-OP que arrastraba framer-motion (~30KB) al bundle
  // inicial de /tiendas. <div> plano = comportamiento idéntico (el card ya
  // renderizaba en su estado final, sin transición visible).
  return (
    <div
      ref={cardRef}
      className={`relative transition-transform duration-200 ease-out hover:z-10 hover:scale-[1.02] ${isFeatured ? "rounded-2xl p-0.5 bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark,var(--accent))] shadow-lg max-md:rounded-none max-md:p-0 max-md:bg-none max-md:shadow-none" : ""}`}
    >
      {/* Wrapper interno para que el anillo teal envuelva la card en Destacada */}
      <div className={isFeatured ? "rounded-[14px] overflow-hidden bg-[var(--surface-raised)] max-md:rounded-none" : "contents"}>
      {/* Badges de nivel + verificada movidos al cluster `coverOverlay`
          (top-left, icon-only) — Brandon 2026-05-31. Antes flotaban sueltos y
          el de nivel chocaba con el botón Seguir (top-right). */}

      {/* Overlay status (cerrado / construcción) — sobrepuesto al canonical
          card limitado al área del cover (aspect-[16/9] mobile, [4/3] desktop)
          via posicionamiento absoluto. El aspect-ratio debe matchear el del
          StoreCardCanonical para que el overlay cubra exactamente el cover.
          Brandon 2026-05-21: mobile cards más bajas estilo Rappi → 16/9. */}
      {store.underConstruction ? (
        <div className="absolute top-0 left-0 right-0 aspect-[16/9] sm:aspect-[4/3] pointer-events-none z-10 rounded-t-lg overflow-hidden max-md:rounded-none">
          <UnderConstructionOverlay message={store.underConstructionMessage} />
        </div>
      ) : store.isOpenNow === false ? (
        <div className="absolute top-0 left-0 right-0 aspect-[16/9] sm:aspect-[4/3] pointer-events-none z-10 rounded-t-lg overflow-hidden max-md:rounded-none">
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
        // Check de verificado inline con el nombre (Brandon 2026-06-08).
        nameSuffix={
          store.verified ? (
            <span
              className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[var(--accent)] align-middle"
              title="Tienda verificada"
              aria-label="Tienda verificada"
            >
              <Check className="h-3 w-3 text-white" strokeWidth={3.5} aria-hidden="true" />
            </span>
          ) : undefined
        }
        slug={store.slug}
        imageUrl={store.cover || store.logo}
        variant="default"
        // Brandon 2026-06-07: cards cuadradas en mobile (max-md-) en /tiendas y
        // /marketplace — rediseño ejecutivo "todo recto". El root del DS es
        // `rounded-lg`; max-md:rounded-none lo cuadra <768px (border 1px se queda).
        className="max-md:rounded-none"
        footer={footer}
        coverOverlay={coverOverlay}
        coverBottomLeft={
          <div
            className="h-9 w-9 sm:h-11 sm:w-11 rounded-full overflow-hidden bg-[var(--surface-raised)] border-2 border-white dark:border-gray-900 shadow-md hidden md:flex items-center justify-center"
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
              <span className="text-sm sm:text-base font-black text-[var(--text-secondary)] bg-[var(--surface-sunken)] h-full w-full flex items-center justify-center">
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
            // · sizes ajustado: mobile 1 col (100vw), tablet 2 cols (50vw),
            //   desktop lg con sidebar 280px → disponible ~(100vw-280px)/2,
            //   desktop xl con sidebar → (100vw-280px)/3 ≈ 320px máx.
            // · Los 3 primeros cards = LCP candidates → priority + fetchPriority high.
            //   Resto lazy con fetchPriority low para no competir con LCP.
            sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, (max-width:1280px) calc((100vw - 280px - 64px) / 2), 360px"
            quality={70}
            priority={index < 3}
            fetchPriority={index < 3 ? "high" : "low"}
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
      {/* TS-15 follow store + compartir — fuera del Link para no anidar interactivos.
          Brandon 2026-06-08: bajados del cover (top-right) a la zona de la
          DESCRIPCIÓN — abajo-derecha del body, a la altura de "Ver tienda".
          Quedan acoplados al contenido, no flotando sobre la foto. */}
      <div className="absolute bottom-3 right-3 z-10 hidden md:flex items-center gap-1.5">
        <ShareStoreButton slug={store.slug} name={store.name} />
        <FollowStoreButton slug={store.slug} storeName={store.name} />
      </div>
      {/* Mobile: SIN compartir; el corazón de favorito baja a la zona de la
          descripción (abajo-derecha), recto, fuera del Link. Brandon 2026-06-07. */}
      <div className="absolute bottom-2.5 right-2.5 z-10 md:hidden">
        <FollowStoreButton
          slug={store.slug}
          storeName={store.name}
          className="rounded-none"
        />
      </div>

      {/* Distancia + ver en mapa — pill clickeable (overlay, fuera del Link).
          Solo cuando el cliente compartió su ubicación y hay coords de la tienda. */}
      {distanceKm != null && userCoords && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMapOpen(true);
          }}
          aria-label={`Ver ubicación de ${store.name} en el mapa — a ${distanceKm.toFixed(1)} km de ti`}
          /* Brandon 2026-06-08: subido al cover (top-right). Antes estaba en
             bottom-3 right-3 → TAPABA el corazón/compartir (mismo lugar). */
          className="absolute top-3 right-3 z-20 inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-base)] bg-white/95 px-2.5 py-1.5 text-[length:var(--ts-xs)] font-extrabold text-[var(--text-primary)] shadow-md backdrop-blur-sm transition-all hover:scale-105 hover:border-[var(--accent)] hover:text-[var(--accent)] active:scale-95 dark:bg-gray-950/90"
        >
          <MapPin className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={2.5} aria-hidden="true" />
          <span className="tabular-nums">{distanceKm.toFixed(1)} km</span>
        </button>
      )}

      {mapOpen && userCoords && (
        <StoreDistanceMapModal
          open={mapOpen}
          onClose={() => setMapOpen(false)}
          store={store}
          userCoords={userCoords}
        />
      )}
      </div>
    </div>
  );
}, (prev, next) =>
  prev.store.id === next.store.id &&
  prev.store.slug === next.store.slug &&
  prev.store.rating === next.store.rating &&
  prev.store.vacationMode === next.store.vacationMode &&
  prev.index === next.index &&
  prev.userCoords === next.userCoords,
);

/* ── MarketplaceStoresView Props ───────────────────────────────────────────── */

interface MarketplaceStoresViewProps {
  stores: MarketplaceStore[];
  /** Productos por slug para las cards Premium (beneficio superadmin). */
  premiumProducts?: Record<string, import("./PremiumStoreCard").PremiumProduct[]>;
  loading: boolean;
  error: string | null;
  search: string;
  category: string;
  zone: string;
  geoActive: boolean;
  /** Coords GPS del cliente (logueado o no) — para distancia + mapa por card. */
  userCoords?: { lat: number; lng: number } | null;
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
export function passesChips(
  store: MarketplaceStore & Partial<StoreChipFields>,
  chips: Set<QuickChipId>,
): boolean {
  if (chips.size === 0) return true;

  for (const chip of chips) {
    switch (chip) {
      case "open_now": {
        // Brandon 2026-05-31: preferir el flag `isOpenNow` derivado server-side
        // de businessHours (getStoreOpenStatus). Es la fuente real — sin esto el
        // toggle "Abierto ahora" no filtraba NADA porque las stores de /tiendas
        // no traen el array legacy `openHours`. El bloque de abajo queda como
        // fallback para consumers que sí lo provean.
        if (typeof (store as MarketplaceStore).isOpenNow === "boolean") {
          if (!(store as MarketplaceStore).isOpenNow) return false;
          break;
        }
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
      case "accepts_fiado": {
        // El campo viaja en MarketplaceStore (benefits.acceptsFiado). Si no
        // está presente (consumer legacy), no filtramos — mejor mostrar.
        if (!("acceptsFiado" in store)) break;
        if (store.acceptsFiado !== true) return false;
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

export interface StoreChipFields {
  openHours: DayHours[] | null;
  deliveryFee: number;
  freeDelivery: boolean;
  hasOffers: boolean;
  activePromos: number;
  createdAt: string | Date;
  paymentMethods: string[];
  minOrderAmount: number;
  acceptsFiado: boolean;
}

// Icono por vertical — mismo mapping que MarketplaceVerticalChips (single-source
// de la taxonomía en lib/marketplace/verticals). "Otras" cae al icono Store.
const VERTICAL_ICONS: Record<string, LucideIcon> = {
  comida: UtensilsCrossed,
  bodega: ShoppingBasket,
  ferreteria: Wrench,
  electro: Smartphone,
  farmacia: Pill,
};

/**
 * StoreGrid — grilla responsiva de cards. Extraída para reusarla tanto en el
 * listado plano (con filtros activos) como en cada sección por categoría.
 */
const StoreGrid = memo(function StoreGrid({
  stores,
  lastOrdersByStore,
  userCoords,
  ariaLabel,
}: {
  stores: MarketplaceStore[];
  lastOrdersByStore: Record<string, LastOrderInfo>;
  userCoords?: { lat: number; lng: number } | null;
  ariaLabel: string;
}) {
  return (
    <div
      role="list"
      aria-label={ariaLabel}
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4"
    >
      {stores.map((store, i) => (
        <div key={store.id} role="listitem">
          <StoreCardWrapper
            store={store}
            index={i}
            lastOrder={lastOrdersByStore[store.slug]}
            userCoords={userCoords}
          />
        </div>
      ))}
    </div>
  );
});

/**
 * TieredStores — renderiza una lista respetando el NIVEL de cada tienda
 * (superadmin): las Premium como card de fila completa con preview de productos
 * (arriba), y el resto (Destacada + Estándar) en la grilla. Así /tiendas honra
 * lo que promete la previsualización de /superadmin/stores. Reusado en el
 * listado plano y en cada sección por categoría.
 */
const TieredStores = memo(function TieredStores({
  stores,
  premiumProducts,
  lastOrdersByStore,
  userCoords,
  ariaLabel,
}: {
  stores: MarketplaceStore[];
  premiumProducts: Record<string, PremiumProduct[]>;
  lastOrdersByStore: Record<string, LastOrderInfo>;
  userCoords?: { lat: number; lng: number } | null;
  ariaLabel: string;
}) {
  const premiums = stores.filter((s) => s.displayTier === "premium");
  const rest = stores.filter((s) => s.displayTier !== "premium");
  return (
    <div className="space-y-4">
      {premiums.map((s) => (
        <PremiumStoreCard
          key={s.id}
          slug={s.slug}
          name={s.name}
          logo={s.logo}
          cover={s.cover}
          category={s.category}
          zone={s.zone}
          rating={s.rating}
          reviewCount={s.reviewCount}
          verified={s.verified}
          acceptsFiado={s.acceptsFiado}
          isOpenNow={s.isOpenNow}
          nextOpeningLabel={formatNextOpening(s.nextOpeningAt)}
          products={premiumProducts[s.slug] ?? []}
          lat={s.lat}
          lng={s.lng}
          userCoords={userCoords}
        />
      ))}
      {rest.length > 0 && (
        <StoreGrid
          stores={rest}
          lastOrdersByStore={lastOrdersByStore}
          userCoords={userCoords}
          ariaLabel={ariaLabel}
        />
      )}
    </div>
  );
});

export default function MarketplaceStoresView({
  stores: _stores,
  // premiumProducts (Brandon 2026-07-05): RE-HABILITADO. Alimenta el preview de
  // productos de las cards de nivel Premium (beneficio superadmin), para que
  // /tiendas honre lo que promete la previsualizacion de /superadmin/stores.
  premiumProducts = {},
  loading,
  error,
  search,
  category,
  zone,
  geoActive,
  userCoords,
  filteredStores: filteredStoresProp,
  onRetry,
  onClearAll,
  activeChips,
}: MarketplaceStoresViewProps) {
  const chips = activeChips ?? new Set<QuickChipId>();

  // A2 — drawer "Vista rápida": peek de productos sin salir de /tiendas. El
  // "agregar" navega al producto (el carrito cross-store del checkout necesita
  // storeProductId + modifiers que no tenemos en el preview).
  const [quickViewStore, setQuickViewStore] = useState<FeaturedNearbyStore | null>(null);
  const router = useRouter();

  // TS-08 — mapa storeSlug → último pedido del cliente (cache 5min)
  const lastOrdersByStore = useLastOrdersByStore();

  // Apply chip filters on top of whatever geo/category filtering already happened
  const filteredStores =
    chips.size === 0
      ? filteredStoresProp
      : filteredStoresProp.filter((s) =>
          passesChips(s as MarketplaceStore & Partial<StoreChipFields>, chips),
        );

  // Orden por beneficio (superadmin):
  //  - Premium primero (se renderiza como card de fila completa via TieredStores).
  //  - Destacada (featured) después, con badge + realce; luego estándar.
  //  - searchBoost sube dentro de su grupo. Cerradas al final de cada grupo.
  const orderedStores = useMemo(() => {
    // Brandon 2026-07-05 (audit comprador): las tiendas CERRADAS ahora van
    // SIEMPRE al final (dentro de su grupo), abiertas primero. Antes se
    // mezclaban con las abiertas y el comprador no sabía cuáles podía usar ya.
    // `isOpenNow === false` = cerrada; undefined/true = tratamos como abierta
    // (no penalizar tiendas sin horario cargado).
    const closedLast = (s: MarketplaceStore) => (s.isOpenNow === false ? 1 : 0);
    const premiums = [...filteredStores.filter((s) => s.displayTier === "premium")].sort(
      (a, b) => closedLast(a) - closedLast(b),
    );
    const rest = [...filteredStores.filter((s) => s.displayTier !== "premium")].sort((a, b) => {
      const ca = closedLast(a);
      const cb = closedLast(b);
      if (ca !== cb) return ca - cb; // abiertas primero
      const ta = a.displayTier === "featured" ? 0 : 1;
      const tb = b.displayTier === "featured" ? 0 : 1;
      if (ta !== tb) return ta - tb;
      const ba = a.searchBoost ? 0 : 1;
      const bb = b.searchBoost ? 0 : 1;
      return ba - bb;
    });
    // Premium primero, luego el resto. TieredStores separa premium (full-width)
    // del grid; acá solo garantizamos el orden premium → featured → standard.
    return [...premiums, ...rest];
  }, [filteredStores]);

  // ── Agrupación por categoría (Brandon 2026-07-05) ──────────────────────────
  // En el estado de navegación por defecto (sin búsqueda / filtro / zona / geo /
  // chips) el directorio se organiza en secciones por "mundo" — Comida, Bodega,
  // Ferretería, Electro, Farmacia — cada una con su encabezado + icono. Así el
  // vecino escanea por tipo de tienda en vez de una grilla plana. Con CUALQUIER
  // filtro activo volvemos al grid plano (el resultado ya está acotado).
  const isDefaultBrowse =
    !search && (!category || category === "todos") && !zone && !geoActive && chips.size === 0;

  const verticalGroups = useMemo(() => {
    if (!isDefaultBrowse) return null;
    const buckets = new Map<string, MarketplaceStore[]>();
    for (const s of orderedStores) {
      const vId = verticalForStoreCategory(s.category) ?? "otros";
      const arr = buckets.get(vId);
      if (arr) arr.push(s);
      else buckets.set(vId, [s]);
    }
    const groups: { id: string; label: string; Icon: LucideIcon; stores: MarketplaceStore[] }[] =
      [];
    // Orden de secciones = MARKETPLACE_VERTICALS; "Otras tiendas" al final.
    for (const v of MARKETPLACE_VERTICALS) {
      const arr = buckets.get(v.id);
      if (arr && arr.length) {
        groups.push({ id: v.id, label: v.label, Icon: VERTICAL_ICONS[v.id] ?? StoreIcon, stores: arr });
      }
    }
    const otras = buckets.get("otros");
    if (otras && otras.length) {
      groups.push({ id: "otros", label: "Otras tiendas", Icon: StoreIcon, stores: otras });
    }
    return groups;
  }, [isDefaultBrowse, orderedStores]);

  // Solo agrupamos si hay ≥2 mundos distintos — con uno solo, un encabezado
  // gigante para toda la página es ruido. En ese caso: grid plano.
  const showGroups = verticalGroups !== null && verticalGroups.length >= 2;

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

      {/* Loading state — skeleton matched al grid final (1 col mobile, 2/3 desktop con sidebar) */}
      {loading && (
        <div
          aria-busy="true"
          aria-label="Cargando tiendas..."
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 mt-6"
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
              ? `No hay tiendas con el nombre "${search}".`
              : "Aún no hay tiendas publicadas en esta categoría. ¡Pronto habrá más!"}
          </p>

          {/* A3 — si buscó un término de PRODUCTO ("gaseosa", "arroz"), no hay
              tienda con ese nombre pero SÍ puede haber productos. Le ofrecemos
              la búsqueda cross-tienda como acción PRIMARIA. */}
          {search && (
            <Link
              href={`/marketplace/buscar?q=${encodeURIComponent(search.trim())}`}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 h-12 text-sm font-extrabold text-white shadow-md transition-all hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]"
            >
              <ShoppingBag className="h-4.5 w-4.5" strokeWidth={2} aria-hidden="true" />
              Buscar &quot;{search.trim()}&quot; en productos
              <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            </Link>
          )}

          {(search || category !== "todos" || zone || geoActive) && (
            <button
              onClick={onClearAll}
              aria-label="Quitar todos los filtros y ver todas las tiendas"
              className="mt-3 px-6 py-2.5 rounded-xl border-2 border-[var(--rule-base)] text-[var(--text-primary)] text-sm font-bold hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
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

      {/* Banners propios (beneficio superadmin "Banner propio") — arriba del
          listado, full-width. Máx 2 para no saturar. */}
      {!loading && !error && filteredStores.some((s) => s.ownBanner) && (
        <div className="mt-6 space-y-3">
          {filteredStores.filter((s) => s.ownBanner).slice(0, 2).map((s) => (
            <StorePromoBanner
              key={`banner-${s.id}`}
              slug={s.slug}
              name={s.name}
              banner={s.banner}
              cover={s.cover}
              logo={s.logo}
              category={s.category}
              zone={s.zone}
            />
          ))}
        </div>
      )}

      {/* Store grid — agrupado por categoría en navegación por defecto (Brandon
          2026-07-05); grid plano cuando hay búsqueda/filtro/zona/geo/chip activo
          (el resultado ya viene acotado, no hace falta seccionar).
          Grid: 1 col mobile (Doordash/Uber Eats) · 2 en lg (sidebar 280px) ·
          3 en xl · 4 en 2xl. */}
      {!loading &&
        !error &&
        filteredStores.length > 0 &&
        (showGroups && verticalGroups ? (
          <div className="mt-6 space-y-10">
            {/* Saltos por categoría — atajo a cada sección (tabla de contenidos
                + leyenda de mundos disponibles). Scrollea suave al encabezado. */}
            <nav
              aria-label="Ir a una categoría"
              className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {verticalGroups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    document
                      .getElementById(`cat-${g.id}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  <g.Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
                  {g.label}
                  <span className="tabular-nums text-[var(--text-tertiary)]">{g.stores.length}</span>
                </button>
              ))}
            </nav>
            {verticalGroups.map((g) => (
              <section
                key={g.id}
                id={`cat-${g.id}`}
                aria-labelledby={`vsec-${g.id}`}
                className="scroll-mt-28"
              >
                {/* Encabezado del mundo: icono en chip + nombre + conteo. */}
                <div className="mb-4 flex items-center gap-2.5">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                    <g.Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                  </span>
                  <h3
                    id={`vsec-${g.id}`}
                    className="text-lg font-extrabold tracking-[-0.01em] text-[var(--text-primary)] sm:text-xl"
                  >
                    {g.label}
                  </h3>
                  <span className="text-[length:var(--ts-xs)] font-bold tabular-nums text-[var(--text-tertiary)]">
                    {g.stores.length}
                  </span>
                </div>
                <TieredStores
                  stores={g.stores}
                  premiumProducts={premiumProducts}
                  lastOrdersByStore={lastOrdersByStore}
                  userCoords={userCoords}
                  ariaLabel={`${g.stores.length} tienda${g.stores.length !== 1 ? "s" : ""} de ${g.label}`}
                />
              </section>
            ))}
          </div>
        ) : (
          <div className="mt-6">
            <TieredStores
              stores={orderedStores}
              premiumProducts={premiumProducts}
              lastOrdersByStore={lastOrdersByStore}
              userCoords={userCoords}
              ariaLabel={`${filteredStores.length} tienda${filteredStores.length !== 1 ? "s" : ""} encontrada${filteredStores.length !== 1 ? "s" : ""}`}
            />
          </div>
        ))}

      {/* Geo active indicator (sr-only) */}
      {geoActive && (
        <p className="sr-only" aria-live="polite">
          <LocateFixed className="h-4 w-4" aria-hidden="true" />
          Ordenado por cercanía
        </p>
      )}

      {/* A2 — drawer "Vista rápida": productos de la tienda con add-to-cart
          sin salir del directorio. Se monta lazy al primer click. */}
      <StoreQuickPreviewDrawer
        store={quickViewStore}
        open={quickViewStore !== null}
        onClose={() => setQuickViewStore(null)}
        onAddToCart={(p) => {
          const slug = quickViewStore?.slug;
          if (slug) router.push(`/marketplace/${slug}/producto/${p.productId}`);
        }}
      />
    </>
  );
}
