"use client";

/**
 * StoreHero — hero editorial de la Store Detail Page.
 *
 * Left: Kicker + H1 + subtitle + stats strip + CTAs.
 * Right: ilustración DS en card canvas (BodegaAbriendo o DoniaElena).
 *
 * Diseño: Buleje/Holded — cero emojis, cero saturación, dark-mode completo.
 * Grid: 1 col mobile → 2 col lg (60/40).
 */

import { MapPin, Clock, Star, Truck, Phone, Heart } from "@buleje/design-system/icons";
import StoreInfoPanel from "./StoreInfoPanel";

interface StoreHeroProps {
  name: string;
  category: string;
  zone: string | null;
  description: string | null;
  rating: number;
  reviewCount: number;
  /** Minutos promedio de entrega */
  deliveryMin?: number;
  /** Distancia en km formateada (ej: "0.8 km") */
  distanceLabel?: string;
  /** Horario legible (ej: "Abierto hasta 11pm") */
  scheduleLabel?: string;
  /** Dirección física para el panel de info (Google Maps) */
  address?: string | null;
  /** Métodos de pago habilitados — hint para el panel */
  paymentMethods?: string[];
  /** True si la tienda está abierta ahora */
  isOpen?: boolean;
  /** Delivery gratis */
  freeDelivery?: boolean;
  whatsappNumber?: string | null;
}

const TRUST_CHIPS = [
  { label: "Verificada", icon: Star },
  { label: "Delivery incluido", icon: Truck },
  { label: "Atención WhatsApp", icon: Phone },
  { label: "Pago en casa", icon: Heart },
] as const;

export default function StoreHero({
  name,
  category,
  zone,
  description,
  rating,
  reviewCount,
  deliveryMin = 25,
  distanceLabel = "Callería",
  scheduleLabel = "Abierto",
  address,
  paymentMethods = ["yape", "efectivo"],
  isOpen = true,
  freeDelivery = true,
  whatsappNumber,
}: StoreHeroProps) {
  const ratingLabel = rating > 0 ? rating.toFixed(1) : null;

  // Compactación 2026-04: el cliente quiere ver productos primero. Antes el
  // hero ocupaba ~70vh con kicker grande, H1 a 5xl, subtítulo en 2 líneas,
  // stats strip y trust chips. Ahora consolido todo en 1 fila densa con los
  // datos esenciales (nombre, categoría, rating, ubicación, horario) +
  // CTAs inline. El info panel completo se mueve a un drawer expandible
  // al pulsar "Más datos" — opt-in en lugar de espacio fijo.
  return (
    <section
      aria-labelledby="store-hero-heading"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5"
    >
      <div className="flex flex-col gap-3">
        {/* ── Fila 1: nombre + CTAs ──────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-block text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
              {category}
            </span>
            <h1
              id="store-hero-heading"
              className="text-xl sm:text-2xl font-extrabold tracking-[-0.01em] text-gray-900 dark:text-white leading-tight mt-0.5"
            >
              {name}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href="#catalogo"
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 dark:bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
            >
              Ver catálogo
            </a>
            {whatsappNumber && (
              <a
                href={`https://wa.me/51${whatsappNumber.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent p-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400"
              >
                <Phone className="h-4 w-4" aria-hidden />
              </a>
            )}
            <button
              type="button"
              aria-label="Agregar a favoritos"
              className="inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400"
            >
              <Heart className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        {/* ── Fila 2: stats inline (rating, delivery, ubicación, horario) — tipografía base */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-base font-medium text-[var(--text-secondary)]">
          {ratingLabel && (
            <span className="flex items-center gap-1.5">
              <Star className="h-4 w-4 fill-amber-500 text-amber-500" aria-hidden />
              <span className="text-[var(--text-primary)] font-bold tabular-nums">
                {ratingLabel}
              </span>
              <span className="text-[var(--text-tertiary)] tabular-nums">({reviewCount})</span>
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Truck className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
            <span className="font-semibold">{deliveryMin} min</span>
            {freeDelivery && (
              <span className="ml-1 text-[var(--data-success)] font-bold">· gratis</span>
            )}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
            <span className="font-semibold">{zone ?? distanceLabel}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
            <span className={isOpen ? "text-[var(--data-success)] font-bold" : "text-[var(--data-error)] font-bold"}>
              {isOpen ? "Abierto" : "Cerrado"}
            </span>
            <span className="text-[var(--text-tertiary)]">· {scheduleLabel === "Abierto" ? "6am–11pm" : scheduleLabel}</span>
          </span>
          {paymentMethods.length > 0 && (
            <span className="text-[var(--text-tertiary)] font-medium">
              {paymentMethods.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" · ")}
            </span>
          )}
        </div>

        {/* ── Fila 3 (opcional): descripción 1 línea + drawer info detallada — texto base */}
        {description && (
          <details className="group">
            <summary className="cursor-pointer list-none flex items-center gap-2 text-base font-medium text-[var(--text-secondary)] select-none hover:text-[var(--text-primary)]">
              <span className="line-clamp-1 flex-1">{description}</span>
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)] group-open:hidden shrink-0">
                Más datos
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)] hidden group-open:inline shrink-0">
                Ocultar
              </span>
            </summary>
            <div className="mt-3 lg:max-w-md">
              <StoreInfoPanel
                name={name}
                zone={zone}
                address={address ?? null}
                scheduleLabel={scheduleLabel === "Abierto" ? "Lun a Dom · 6am – 11pm" : scheduleLabel}
                isOpen={isOpen}
                rating={rating}
                reviewCount={reviewCount}
                deliveryMin={deliveryMin}
                freeDelivery={freeDelivery}
                whatsappNumber={whatsappNumber ?? null}
                paymentMethods={paymentMethods}
              />
            </div>
          </details>
        )}
      </div>
    </section>
  );
}
