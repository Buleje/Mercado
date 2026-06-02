"use client";

/**
 * StoreHero — hero profesional Buleje de la Store Detail Page.
 *
 * Diseño:
 *   - Card prominente con padding generoso, surface-raised + border-2.
 *   - Layout 2 cols (lg+): identidad (kicker + h1 + tagline italic serif) + meta CTAs.
 *   - Stats strip: 4 KPIs grandes con dividers (rating, delivery, ubicación, horario).
 *   - Trust chips: "Yape · Plin · Efectivo · Sin permanencia" con iconos del DS.
 *   - Drawer "Más datos" sigue disponible para info detallada (no rompe mobile).
 *
 * Tokens DS — sin colores hex, todo via var(--accent), var(--surface-*).
 */

import {
  MapPin,
  Clock,
  Star,
  Truck,
  Phone,
  Heart,
  ShieldCheck,
  Sparkles,
  ArrowRight,
} from "@buleje/design-system/icons";
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
  const locationLabel = zone ?? distanceLabel;

  return (
    // Brandon, mayo 14 2026: hero entero oculto en mobile. El nombre,
    // descripcion, "Ver catalogo" y favorito viajaron al BackToTiendasButton
    // como toolbar compacta (StoreDetailClient). El banner + categorias chips
    // sticky bastan para identidad en mobile.
    <section
      aria-labelledby="store-hero-heading"
      className="hidden md:block max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 sm:pt-4 pb-2"
    >
      <div
        className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] shadow-sm"
      >
        {/* ── Header — identidad + CTAs ───────────────────────────────── */}
        <div className="flex flex-col gap-5 p-5 sm:p-7 lg:p-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--accent)]/25 bg-[var(--accent-soft)] px-3 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
              <Sparkles className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              Tienda Buleje · {category}
            </span>
            <h1
              id="store-hero-heading"
              className="mt-3 text-3xl sm:text-4xl lg:text-[2.75rem] font-black leading-[1.05] tracking-[var(--ls-tight)] text-[var(--text-primary)]"
            >
              {name}
            </h1>
            {description && (
              <p className="mt-2 max-w-2xl text-base sm:text-lg leading-relaxed text-[var(--text-secondary)]">
                <span className="italic font-serif text-[var(--text-primary)]">
                  &ldquo;{description}&rdquo;
                </span>
              </p>
            )}
          </div>

          {/* CTAs — derecha en desktop, full-width abajo en mobile */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                // Smooth scroll al catalogo sin recargar la pagina (Brandon,
                // mayo 14 2026). El href="#catalogo" provocaba que el browser
                // mueva el hash y, con Next 16 + RSC, terminaba reordenando
                // el subarbol y haciendo flashear el header.
                const el = document.getElementById("catalogo");
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }}
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-black text-white shadow-md transition-all hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]"
            >
              Ver catálogo
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            </button>
            {whatsappNumber && (
              <a
                href={`https://wa.me/51${whatsappNumber.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                title="Pedí por WhatsApp"
                className="inline-flex h-12 w-12 items-center justify-center rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)] transition-all hover:border-[var(--accent)] hover:bg-[var(--accent)]/5"
              >
                <Phone className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              </a>
            )}
            <button
              type="button"
              aria-label="Agregar a favoritos"
              title="Guardar como favorita"
              className="inline-flex h-12 w-12 items-center justify-center rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)] transition-all hover:border-[var(--data-error-500)] hover:text-[var(--data-error-500)]"
            >
              <Heart className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </button>
          </div>
        </div>

        {/* ── Stats strip — 4 KPIs con dividers ───────────────────────
            Brandon, mayo 14 2026: en mobile el stats + trust strip toman
            mucho scroll antes del catalogo y duplican info que ya vive en
            el banner cerrado/abierto. Solo desktop (md+) los mantiene. */}
        <div className="hidden md:grid grid-cols-2 sm:grid-cols-4 border-t-2 border-[var(--rule-base)]">
          {/* Rating — sin reseñas muestra empty state explícito en lugar
              de un guión "—" críptico (designer audit). */}
          <div className="flex flex-col gap-1 p-4 sm:p-5 sm:border-r-2 border-b-2 sm:border-b-0 border-[var(--rule-base)]">
            <span className="flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              <Star
                className="h-3 w-3 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]"
                aria-hidden
              />
              Rating
            </span>
            {ratingLabel ? (
              <p className="text-xl sm:text-2xl font-black tabular-nums text-[var(--text-primary)] leading-tight">
                {ratingLabel}
                <span className="ml-1 text-sm font-bold text-[var(--text-tertiary)]">
                  ({reviewCount})
                </span>
              </p>
            ) : (
              <p className="text-sm font-semibold text-[var(--text-secondary)] leading-snug">
                Sin reseñas aún
              </p>
            )}
          </div>

          {/* Delivery */}
          <div className="flex flex-col gap-1 p-4 sm:p-5 sm:border-r-2 border-b-2 sm:border-b-0 border-[var(--rule-base)]">
            <span className="flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              <Truck className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              Delivery
            </span>
            <p className="text-xl sm:text-2xl font-black tabular-nums text-[var(--text-primary)] leading-tight">
              {deliveryMin}
              <span className="ml-0.5 text-sm font-bold text-[var(--text-tertiary)]">
                min
              </span>
              {freeDelivery && (
                <span className="ml-1.5 text-xs font-black text-[var(--data-success-500)]">
                  GRATIS
                </span>
              )}
            </p>
          </div>

          {/* Ubicación */}
          <div className="flex flex-col gap-1 p-4 sm:p-5 sm:border-r-2 border-[var(--rule-base)]">
            <span className="flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              <MapPin className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              Zona
            </span>
            <p className="text-xl sm:text-2xl font-black text-[var(--text-primary)] leading-tight truncate">
              {locationLabel}
            </p>
          </div>

          {/* Horario / abierto */}
          <div className="flex flex-col gap-1 p-4 sm:p-5">
            <span className="flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              <Clock className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              Estado
            </span>
            <p className="flex items-center gap-1.5 text-xl sm:text-2xl font-black leading-tight">
              <span
                aria-hidden
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  isOpen
                    ? "bg-[var(--data-success-500)] shadow-[0_0_0_4px_color-mix(in_oklch,var(--data-success)_25%,transparent)]"
                    : "bg-[var(--data-error-500)]"
                }`}
              />
              <span
                className={
                  isOpen
                    ? "text-[var(--data-success-500)]"
                    : "text-[var(--data-error-500)]"
                }
              >
                {isOpen ? "Abierto" : "Cerrado"}
              </span>
            </p>
          </div>
        </div>

        {/* ── Trust chips strip — payment methods + sello marca ───────
            Mobile: oculto junto al stats strip (Brandon, mayo 14 2026). */}
        <div className="hidden md:flex flex-wrap items-center gap-2 p-4 sm:px-7 sm:py-4 lg:px-8 border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] rounded-b-3xl">
          <span
            className="inline-flex items-center justify-center rounded-full border-2 border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/8 p-1.5 text-[var(--data-success-500)]"
            title="Tienda verificada"
            aria-label="Tienda verificada"
          >
            <ShieldCheck className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          </span>
          {paymentMethods.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)]">
              Pagás con{" "}
              <strong className="text-[var(--text-primary)]">
                {paymentMethods
                  .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
                  .join(" · ")}
              </strong>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)]">
            Atención por WhatsApp
          </span>
          {description && (
            <details className="ml-auto group">
              <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-1 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors">
                <span className="group-open:hidden">Más datos</span>
                <span className="hidden group-open:inline">Ocultar</span>
                <ArrowRight
                  className="h-3 w-3 transition-transform group-open:rotate-90"
                  strokeWidth={2.5}
                  aria-hidden
                />
              </summary>
              <div className="mt-3 lg:max-w-md">
                <StoreInfoPanel
                  name={name}
                  zone={zone}
                  address={address ?? null}
                  scheduleLabel={
                    scheduleLabel === "Abierto"
                      ? "Lun a Dom · 6am – 11pm"
                      : scheduleLabel
                  }
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
      </div>
    </section>
  );
}
