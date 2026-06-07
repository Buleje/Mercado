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
  MessageCircle,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Wallet,
} from "@buleje/design-system/icons";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

// Mapa real (OSM) — client-only. Sin onPick = solo lectura (marker fijo).
const LeafletMap = dynamic(() => import("@/components/LeafletMap"), {
  ssr: false,
  loading: () => <div className="h-[196px] w-full animate-pulse bg-[var(--surface-sunken)]" />,
});

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
  /** Identidad para el chat Messenger (botón "Mensaje" → buleje:open-chat) */
  storeId?: string | null;
  storeSlug?: string | null;
  storeLogo?: string | null;
  /** Coordenadas para el mapa (null → centro de Ciudad Constitución). */
  lat?: number | null;
  lng?: number | null;
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
  storeId,
  storeSlug,
  storeLogo,
  lat,
  lng,
}: StoreHeroProps) {
  const ratingLabel = rating > 0 ? rating.toFixed(1) : null;
  const locationLabel = zone ?? distanceLabel;

  // Mapa: coords de la tienda o centro de Ciudad Constitución como fallback.
  const mapLat = lat ?? -9.8549;
  const mapLng = lng ?? -75.0213;
  const hasCoords = lat != null && lng != null;
  const mapsHref = `https://www.google.com/maps/search/${encodeURIComponent(
    hasCoords ? `${lat},${lng}` : `${name} ${zone ?? "Ciudad Constitución"}`,
  )}`;
  const waLink = whatsappNumber ? `https://wa.me/51${whatsappNumber.replace(/\D/g, "")}` : null;
  const payLabel = paymentMethods.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" · ");

  // Retroceder + Guardar integrados en la sección de la tienda (Brandon 2026-06-06).
  const router = useRouter();
  const [favorited, setFavorited] = useState(false);
  useEffect(() => {
    if (!storeSlug) return;
    try { setFavorited(localStorage.getItem(`buleje:fav-store:${storeSlug}`) === "1"); } catch { /* ignore */ }
  }, [storeSlug]);
  const toggleFavorite = useCallback(() => {
    if (!storeSlug) return;
    setFavorited((prev) => {
      const next = !prev;
      try {
        if (next) localStorage.setItem(`buleje:fav-store:${storeSlug}`, "1");
        else localStorage.removeItem(`buleje:fav-store:${storeSlug}`);
      } catch { /* ignore */ }
      return next;
    });
  }, [storeSlug]);
  const goBack = useCallback(() => router.push("/tiendas"), [router]);

  return (
    // Brandon, mayo 14 2026: hero entero oculto en mobile. El nombre,
    // descripcion, "Ver catalogo" y favorito viajaron al BackToTiendasButton
    // como toolbar compacta (StoreDetailClient). El banner + categorias chips
    // sticky bastan para identidad en mobile.
    <section
      aria-labelledby="store-hero-heading"
      className="hidden md:block max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-2"
    >
      <div
        className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] shadow-sm"
      >
        {/* ── Barra superior: retroceder + guardar (dentro de la tienda) ── */}
        <div className="flex items-center justify-between gap-3 border-b-2 border-[var(--rule-base)] px-5 sm:px-7 lg:px-8 py-2.5">
          <button
            type="button"
            onClick={goBack}
            aria-label="Volver a Tiendas"
            className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--accent)]"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2.5} aria-hidden /> Tiendas
          </button>
          <button
            type="button"
            onClick={toggleFavorite}
            aria-pressed={favorited}
            aria-label={favorited ? "Quitar de favoritos" : "Agregar a favoritos"}
            title={favorited ? "Tienda favorita" : "Guardar como favorita"}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-bold transition-colors active:scale-[0.96]",
              favorited
                ? "border-[var(--data-error-500)] bg-[var(--data-error-500)]/10 text-[var(--data-error-500)]"
                : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--data-error-500)] hover:text-[var(--data-error-500)]",
            )}
          >
            <Heart className={cn("h-4 w-4", favorited && "fill-[var(--data-error-500)]")} strokeWidth={2.25} aria-hidden />
            {favorited ? "Guardada" : "Guardar"}
          </button>
        </div>

        {/* ── Header — identidad + CTAs ───────────────────────────────── */}
        <div className="flex flex-col gap-4 p-4 sm:p-5 lg:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]">
              <Sparkles className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              Tienda Buleje · {category}
            </span>
            <h1
              id="store-hero-heading"
              className="mt-2 text-2xl sm:text-3xl lg:text-4xl font-black leading-[1.05] tracking-[var(--ls-tight)] text-[var(--text-primary)]"
            >
              {name}
            </h1>
            {description && (
              <p className="mt-1.5 max-w-2xl text-sm sm:text-base leading-relaxed text-[var(--text-secondary)]">
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
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--text-primary)] px-5 text-sm font-black text-[var(--surface-raised)] transition-all hover:opacity-90 hover:scale-[1.01] active:scale-[0.98]"
            >
              Ver catálogo
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            </button>
            {/* Mensaje — abre el chat Messenger del nav directo en esta
                tienda (Brandon 2026-06-06). El ChatNavLauncher escucha el
                evento global; sin sesión, él mismo abre el AuthModal. */}
            {storeId && (
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent("buleje:open-chat", {
                      detail: { storeId, storeName: name, storeSlug: storeSlug ?? null, storeLogo: storeLogo ?? null },
                    }),
                  );
                }}
                aria-label={`Enviar mensaje a ${name}`}
                title="Chatea con la tienda"
                className="inline-flex h-12 items-center gap-2 rounded-xl border-2 border-[var(--text-primary)]/20 bg-transparent px-4 text-sm font-black text-[var(--text-primary)] transition-all hover:border-[var(--text-primary)] hover:bg-[var(--text-primary)] hover:text-[var(--surface-raised)] active:scale-[0.98]"
              >
                <MessageCircle className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                Mensaje
              </button>
            )}
            {whatsappNumber && (
              <a
                href={`https://wa.me/51${whatsappNumber.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                title="Pedí por WhatsApp"
                className="inline-flex h-12 w-12 items-center justify-center rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)] transition-all hover:border-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
              >
                <Phone className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              </a>
            )}
          </div>
        </div>

        {/* ── Stats strip — 4 KPIs con dividers ───────────────────────
            Brandon, mayo 14 2026: en mobile el stats + trust strip toman
            mucho scroll antes del catalogo y duplican info que ya vive en
            el banner cerrado/abierto. Solo desktop (md+) los mantiene. */}
        <div className="hidden md:grid grid-cols-2 sm:grid-cols-4 border-t-2 border-[var(--rule-base)]">
          {/* Rating — sin reseñas muestra empty state explícito en lugar
              de un guión "—" críptico (designer audit). */}
          <div className="flex flex-col gap-1 p-3 sm:p-4 sm:border-r-2 border-b-2 sm:border-b-0 border-[var(--rule-base)]">
            <span className="flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              <Star
                className="h-3 w-3 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]"
                aria-hidden
              />
              Rating
            </span>
            {ratingLabel ? (
              <p className="text-lg sm:text-xl font-black tabular-nums text-[var(--text-primary)] leading-tight">
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
          <div className="flex flex-col gap-1 p-3 sm:p-4 sm:border-r-2 border-b-2 sm:border-b-0 border-[var(--rule-base)]">
            <span className="flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              <Truck className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              Delivery
            </span>
            <p className="text-lg sm:text-xl font-black tabular-nums text-[var(--text-primary)] leading-tight">
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
          <div className="flex flex-col gap-1 p-3 sm:p-4 sm:border-r-2 border-[var(--rule-base)]">
            <span className="flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              <MapPin className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              Zona
            </span>
            <p className="text-lg sm:text-xl font-black text-[var(--text-primary)] leading-tight truncate">
              {locationLabel}
            </p>
          </div>

          {/* Horario / abierto */}
          <div className="flex flex-col gap-1 p-3 sm:p-4">
            <span className="flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              <Clock className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              Estado
            </span>
            <p className="flex items-center gap-1.5 text-lg sm:text-xl font-black leading-tight">
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

        {/* ── Datos del negocio — full width, TODO visible (sin toggle) + mapa ──
             Brandon 2026-06-06: ejecutivo y compacto. Mapa real a la izquierda,
             datos en grilla a la derecha. Solo desktop (en mobile, modal de info). */}
        <div className="grid grid-cols-1 border-t-2 border-[var(--rule-base)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          {/* Mapa real */}
          <div className="relative min-h-[196px] border-b-2 border-[var(--rule-base)] lg:border-b-0 lg:border-r-2 [&_.leaflet-container]:!rounded-none">
            <LeafletMap lat={mapLat} lon={mapLng} zoom={15} height={196} />
            <a
              href={mapsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-3 right-3 z-[500] inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] shadow-md transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <MapPin className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden /> Cómo llegar
            </a>
          </div>

          {/* Datos */}
          <div className="bg-[var(--surface-sunken)] p-4 sm:p-5 lg:rounded-br-3xl">
            <div className="grid grid-cols-2 gap-x-5 gap-y-3">
              <InfoRow icon={MapPin} label="Ubicación" value={zone ?? "Ciudad Constitución"} />
              <InfoRow icon={Clock} label="Horario" value={scheduleLabel === "Abierto" ? "Lun a Dom · 6am – 11pm" : scheduleLabel} valueClass={isOpen ? "text-[var(--data-success-500)]" : "text-[var(--text-primary)]"} />
              <InfoRow icon={Truck} label="Delivery" value={`${deliveryMin} min${freeDelivery ? " · gratis" : ""}`} />
              {payLabel && <InfoRow icon={Wallet} label="Pagos" value={payLabel} />}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--rule-base)] pt-4">
              {waLink && (
                <a href={waLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]">
                  <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden /> WhatsApp
                </a>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/8 px-3 py-1.5 text-xs font-bold text-[var(--data-success-500)]">
                <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden /> Verificada por Buleje
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function InfoRow({ icon: Icon, label, value, valueClass }: { icon: typeof MapPin; label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
        <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] leading-tight">{label}</p>
        <p className={cn("text-sm font-bold leading-snug text-[var(--text-primary)]", valueClass)}>{value}</p>
      </div>
    </div>
  );
}
