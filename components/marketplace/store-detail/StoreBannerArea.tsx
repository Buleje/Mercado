"use client";

/**
 * StoreBannerArea — banner + hero integrado de la Store Detail Page.
 *
 * Mobile / tablet (<lg): franja fina con la imagen del banner (o el
 * BulejeBrandBanner default). La identidad y datos viven en la barra slim
 * sticky + trust strip + StoreHero (tablet).
 *
 * Desktop (lg+): el banner se vuelve un HERO tipo cover — Brandon 2026-07-07
 * pidió que la info del negocio esté "adentro del banner, acomodada y acoplada".
 * La imagen es el fondo, un scrim oscuro garantiza contraste, y encima (en
 * frente) van: identidad (logo + nombre + categoría + verificada), datos clave
 * (rating · estado · delivery · horario · pagos) y CTAs (Guardar + Mensaje).
 * La barra lateral queda SOLO con categorías.
 *
 * Sin emojis, sin saturación. Estilo Holded/Buleje.
 */

import Image from "next/image";
import { useState, useEffect, useCallback } from "react";
import { m as motion } from "framer-motion";
import {
  Sparkles,
  Star,
  Truck,
  Clock,
  ShieldCheck,
  MessageCircle,
  Heart,
  MapPin,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCategoryLabel } from "@/lib/format-category";
import { PaymentMethodIcon } from "@/components/marketplace/PaymentIcons";

const PAYMENT_LABELS: Record<string, string> = {
  yape: "Yape",
  plin: "Plin",
  efectivo: "Efectivo",
  card: "Tarjeta",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};

interface StoreBannerAreaProps {
  /** URL del banner subido por el dueño. null/empty → default Buleje. */
  banner?: string | null;
  /** Logo de la tienda — avatar del hero. null → inicial. */
  logo?: string | null;
  name: string;
  category?: string | null;
  zone?: string | null;
  rating?: number;
  reviewCount?: number;
  deliveryMin?: number;
  freeDelivery?: boolean;
  isOpen?: boolean;
  scheduleLabel?: string;
  paymentMethods?: string[];
  /** Identidad para el chat Messenger (botón "Mensaje"). */
  storeId?: string | null;
  storeSlug?: string | null;
  acceptsFiado?: boolean;
}

export default function StoreBannerArea({
  banner,
  logo,
  name,
  category,
  zone,
  rating = 0,
  reviewCount = 0,
  deliveryMin = 25,
  freeDelivery = true,
  isOpen = true,
  scheduleLabel = "Lun a Dom · 7am – 11pm",
  paymentMethods = ["yape", "efectivo"],
  storeId,
  storeSlug,
  acceptsFiado = false,
}: StoreBannerAreaProps) {
  // FIX 2026-05-07: si el banner externo no carga (DNS, 404, CORS), caemos al
  // BulejeBrandBanner default.
  const [bannerError, setBannerError] = useState(false);
  const hasBanner = Boolean(banner && banner.trim().length > 0) && !bannerError;
  const initial = name.trim().charAt(0).toUpperCase();
  const ratingLabel = rating > 0 ? rating.toFixed(1) : null;

  // "Guardar tienda" — favorito por dispositivo. Misma key que StoreHero para
  // que el estado sea consistente entre breakpoints.
  const [favorited, setFavorited] = useState(false);
  useEffect(() => {
    if (!storeSlug) return;
    try {
      setFavorited(localStorage.getItem(`buleje:fav-store:${storeSlug}`) === "1");
    } catch {
      /* ignore */
    }
  }, [storeSlug]);
  const toggleFavorite = useCallback(() => {
    if (!storeSlug) return;
    setFavorited((prev) => {
      const next = !prev;
      try {
        if (next) localStorage.setItem(`buleje:fav-store:${storeSlug}`, "1");
        else localStorage.removeItem(`buleje:fav-store:${storeSlug}`);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [storeSlug]);

  return (
    <section aria-label={`Cabecera de ${name}`} className="relative w-full overflow-hidden">
      {/* ── Banner background — fino en mobile/tablet, alto (hero) en desktop ── */}
      <motion.div
        initial={{ opacity: 0, scale: 1.04 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative h-[6.5rem] sm:h-[7.25rem] lg:h-[21rem] w-full"
      >
        {hasBanner ? (
          <Image
            src={banner!}
            alt={`${name}${category ? ` — ${category}` : ""}${zone ? ` en ${zone}` : ""}`}
            fill
            priority
            sizes="100vw"
            className="object-cover"
            onError={() => setBannerError(true)}
          />
        ) : (
          <BulejeBrandBanner storeName={name} />
        )}
        {/* Scrim base (mobile) — contraste del gradiente inferior. En desktop el
            scrim del hero (abajo) es más fuerte para legibilidad del texto. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-linear-to-t from-black/60 via-black/15 to-transparent lg:hidden"
        />

        {/* ── HERO overlay — SOLO desktop (lg+). La info va en frente del banner. ── */}
        <div
          aria-hidden
          className="hidden lg:block absolute inset-0 bg-linear-to-t from-black/88 via-black/50 to-black/10"
        />
        <div className="hidden lg:flex absolute inset-0 max-w-[1760px] mx-auto px-8 flex-col justify-end pb-6">
          {/* Guardar — arriba a la derecha, sobre el scrim */}
          <button
            type="button"
            onClick={toggleFavorite}
            aria-pressed={favorited}
            aria-label={favorited ? "Quitar de guardadas" : "Guardar tienda"}
            className={cn(
              "absolute top-5 right-8 inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-bold backdrop-blur-sm transition-colors active:scale-[0.97]",
              favorited
                ? "border-white bg-white text-[var(--text-primary)]"
                : "border-white/40 bg-black/25 text-white hover:bg-black/40",
            )}
          >
            <Heart className={cn("h-4 w-4", favorited && "fill-current")} strokeWidth={2.25} aria-hidden />
            {favorited ? "Guardada" : "Guardar"}
          </button>

          {/* Identidad + datos + CTAs, anclados abajo */}
          <div className="flex items-end justify-between gap-6">
            <div className="flex items-end gap-4 min-w-0">
              {/* Avatar */}
              <span className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[var(--surface-raised)] ring-4 ring-white/90 shadow-xl">
                {logo ? (
                  <Image
                    src={logo}
                    alt={`Logo de ${name}`}
                    width={80}
                    height={80}
                    sizes="80px"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-2xl font-black text-[var(--accent)]">{initial}</span>
                )}
              </span>

              <div className="min-w-0 pb-1">
                {/* Categoría + verificada */}
                <div className="flex flex-wrap items-center gap-2">
                  {category && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-sm px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white">
                      <Sparkles className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                      {formatCategoryLabel(category)}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold text-white/90">
                    <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden /> Verificada
                    por Buleje
                  </span>
                </div>

                {/* Nombre */}
                <h1 className="mt-1 text-3xl xl:text-4xl font-black leading-[1.05] tracking-[var(--ls-tight)] text-white drop-shadow-sm truncate">
                  {name}
                </h1>

                {/* Datos clave — una fila, separados por dots */}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm font-semibold text-white/95">
                  {ratingLabel && (
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-4 w-4 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" strokeWidth={0} aria-hidden />
                      {ratingLabel}
                      <span className="font-medium text-white/70">({reviewCount})</span>
                    </span>
                  )}
                  <Dot />
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className={cn("h-2 w-2 rounded-full", isOpen ? "bg-[#34d399]" : "bg-[#f87171]")}
                    />
                    {isOpen ? "Abierto ahora" : "Cerrado"}
                  </span>
                  <Dot />
                  <span className="inline-flex items-center gap-1.5">
                    <Truck className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                    {Math.max(15, deliveryMin - 10)}–{deliveryMin + 5} min
                    {freeDelivery && <span className="font-bold text-[#34d399]">· Gratis</span>}
                  </span>
                  <Dot />
                  <span className="inline-flex items-center gap-1.5 text-white/85">
                    <Clock className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                    {scheduleLabel}
                  </span>
                </div>

                {/* Pagos + fiado */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {paymentMethods.map((m) => (
                    <span
                      key={m}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white/90 py-0.5 pl-1 pr-2.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]"
                    >
                      <PaymentMethodIcon method={m} size={16} title={PAYMENT_LABELS[m] ?? m} />
                      {PAYMENT_LABELS[m] ?? m}
                    </span>
                  ))}
                  {acceptsFiado && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold text-white">
                      Acepta fiado
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* CTAs a la derecha */}
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={`https://www.google.com/maps/search/${encodeURIComponent(
                  `${name} ${zone ?? "Ciudad Constitución"}`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-white/40 bg-black/25 px-4 text-sm font-bold text-white backdrop-blur-sm transition-colors hover:bg-black/40"
              >
                <MapPin className="h-4 w-4" strokeWidth={2.25} aria-hidden /> Cómo llegar
              </a>
              {storeId && (
                <button
                  type="button"
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent("buleje:open-chat", {
                        detail: { storeId, storeName: name, storeSlug: storeSlug ?? null, storeLogo: logo ?? null },
                      }),
                    )
                  }
                  aria-label={`Enviar mensaje a ${name}`}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-[var(--text-primary)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  <MessageCircle className="h-4 w-4" strokeWidth={2.5} aria-hidden /> Mensaje
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

function Dot() {
  return <span aria-hidden className="hidden sm:inline text-white/40">·</span>;
}

/* ── BulejeBrandBanner ────────────────────────────────────────────────────────
 * Default banner cuando la tienda no subió uno propio: gradiente teal→ink +
 * patrón de puntos + wordmark. En desktop (hero overlay) el wordmark se oculta
 * para no chocar con la identidad superpuesta.
 */
function BulejeBrandBanner({ storeName }: { storeName: string }) {
  return (
    <div
      className="relative h-full w-full"
      style={{
        background:
          "linear-gradient(135deg, var(--accent) 0%, color-mix(in oklch, var(--accent) 70%, #051418) 65%, #051418 100%)",
      }}
    >
      <svg aria-hidden className="absolute inset-0 h-full w-full opacity-[0.18] mix-blend-soft-light">
        <defs>
          <pattern id="buleje-dots" x="0" y="0" width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.4" fill="white" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#buleje-dots)" />
      </svg>
      <div aria-hidden className="absolute -top-24 -right-20 h-72 w-72 rounded-full border border-white/15" />
      <div aria-hidden className="absolute -top-12 -right-10 h-48 w-48 rounded-full border border-white/10" />

      {/* Wordmark — se oculta en desktop (lg) donde el hero overlay pone el nombre. */}
      <div className="relative z-10 h-full w-full px-6 sm:px-10 flex flex-col justify-center max-w-screen-2xl mx-auto lg:hidden">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-white/15 backdrop-blur-sm">
            <Sparkles className="h-4 w-4 text-white" strokeWidth={2} aria-hidden />
          </span>
          <span className="text-[length:var(--ts-xs)] font-bold uppercase tracking-[0.32em] text-white/85">
            Tienda Buleje
          </span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-black tracking-[var(--ls-tight)] text-white leading-[1.05] drop-shadow-sm">
          {storeName}
        </h2>
      </div>
    </div>
  );
}
