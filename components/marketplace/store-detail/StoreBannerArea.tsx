"use client";

/**
 * StoreBannerArea — banner superior de la Store Detail Page.
 *
 * Si la tienda subió un banner propio, lo muestra como hero image cubriendo
 * todo el contenedor. Si NO hay banner, renderiza BulejeBrandBanner — un
 * banner de marca por defecto creativo: gradiente teal→ink, patrón de
 * puntos, formas geométricas y wordmark "Buleje · Pucallpa".
 *
 * Encima del banner, una fila flotante con el logo de la tienda (avatar
 * circular) + nombre + categoría — todo legible sobre cualquier banner.
 *
 * Sin emojis, sin saturación. Estilo Holded/Buleje.
 */

import Image from "next/image";
import { useState } from "react";
import { m as motion } from "framer-motion";
import { Store as StoreIcon, Sparkles } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface StoreBannerAreaProps {
  /** URL del banner subido por el dueño. null/empty → default Buleje. */
  banner?: string | null;
  /** Logo de la tienda. null → avatar inicial. */
  logo?: string | null;
  /** Nombre — usado para overlay y para el avatar fallback. */
  name: string;
  /** Categoría — chip pequeño debajo del nombre. */
  category?: string | null;
  /** Zona — segundo chip. */
  zone?: string | null;
}

export default function StoreBannerArea({
  banner,
  logo,
  name,
  category,
  zone,
}: StoreBannerAreaProps) {
  // FIX 2026-05-07: si el banner externo no carga (DNS, 404, CORS), caemos al
  // BulejeBrandBanner default. Antes el alt text "Banner de Buleje" quedaba
  // visible como texto raw — UX rota.
  const [bannerError, setBannerError] = useState(false);
  const hasBanner = Boolean(banner && banner.trim().length > 0) && !bannerError;
  const initial = name.trim().charAt(0).toUpperCase();

  return (
    <section
      aria-label={`Cabecera de ${name}`}
      className="relative w-full overflow-hidden"
    >
      {/* ── Banner background ─────────────────────────────────────────────── */}
      {/* Compact: era h-44/56/64 — estiraba muy alto en desktop. Ahora 32/36/40
          (~37% mas chico) para que se vea proporcionado al banner real subido
          desde admin/configuracion en vez de tipo poster gigante. */}
      <motion.div
        initial={{ opacity: 0, scale: 1.04 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative h-32 sm:h-36 lg:h-40 w-full"
      >
        {hasBanner ? (
          <Image
            src={banner!}
            // Brandon 2026-05-20 v12 audit F1: banner es LCP candidate del
            // storefront. alt descriptivo (no vacío) ayuda a Google Images
            // + accesibilidad. Incluye nombre + categoría + zona.
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
        {/* Gradient overlay — siempre, garantiza contraste del overlay */}
        <div
          aria-hidden
          className="absolute inset-0 bg-linear-to-t from-black/60 via-black/15 to-transparent"
        />
      </motion.div>

      {/* ── Floating identity row ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8"
      >
        <div className="-mt-11 sm:-mt-12 lg:-mt-14 relative z-10 flex items-end gap-3.5">
          {/* Avatar — más proporcionado (no tipo poster), bordes suaves + ring + sombra */}
          <div
            className={cn(
              "shrink-0 h-20 w-20 sm:h-24 sm:w-24 lg:h-28 lg:w-28 rounded-2xl overflow-hidden",
              "bg-[var(--surface-raised)] border-4 border-[var(--surface-canvas)]",
              "shadow-lg ring-1 ring-black/5 flex items-center justify-center",
            )}
          >
            {logo ? (
              <Image
                src={logo}
                alt={`Logo de ${name}`}
                width={112}
                height={112}
                sizes="(max-width: 768px) 80px, 112px"
                className="object-cover w-full h-full"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-linear-to-br from-[var(--accent)] to-[var(--accent)]/70 text-white text-2xl sm:text-3xl font-black">
                {initial}
              </div>
            )}
          </div>

          {/* Identity text — debajo del banner para no taparlo */}
          <div className="flex-1 min-w-0 pb-2 sm:pb-3">
            <div className="flex flex-wrap items-center gap-2">
              {category && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  <StoreIcon className="h-3 w-3" aria-hidden />
                  {category}
                </span>
              )}
              {zone && (
                <span className="inline-flex items-center rounded-full border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  {zone}
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

/* ── BulejeBrandBanner ────────────────────────────────────────────────────────
 * Default banner usado cuando la tienda no subió uno propio. Composición:
 *   - Background: gradiente teal-aqua (var(--accent)) → ink oscuro
 *   - Patrón: dots SVG inline
 *   - Decoración: tres círculos concéntricos animados sutilmente
 *   - Wordmark: "Buleje" + "Hecho con cariño en Pucallpa"
 *   - storeName: badge inferior izquierdo "Tienda en Buleje"
 *
 * Todo CSS+SVG nativo, sin imágenes externas — carga instantánea, 0 KB extra.
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
      {/* Dot pattern */}
      <svg
        aria-hidden
        className="absolute inset-0 h-full w-full opacity-[0.18] mix-blend-soft-light"
      >
        <defs>
          <pattern id="buleje-dots" x="0" y="0" width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.4" fill="white" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#buleje-dots)" />
      </svg>

      {/* Decorative circles top-right */}
      <div aria-hidden className="absolute -top-24 -right-20 h-72 w-72 rounded-full border border-white/15" />
      <div aria-hidden className="absolute -top-12 -right-10 h-48 w-48 rounded-full border border-white/10" />
      <div aria-hidden className="absolute top-6 right-12 h-24 w-24 rounded-full bg-white/10 backdrop-blur-sm" />

      {/* Diagonal accent line bottom-left */}
      <div
        aria-hidden
        className="absolute bottom-0 left-0 h-1.5 w-1/3 bg-white/40"
        style={{ clipPath: "polygon(0 0, 100% 0, 96% 100%, 4% 100%)" }}
      />

      {/* Wordmark + tagline */}
      <div className="relative z-10 h-full w-full px-6 sm:px-10 lg:px-14 flex flex-col justify-center max-w-screen-2xl mx-auto">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-white/15 backdrop-blur-sm">
            <Sparkles className="h-4 w-4 text-white" strokeWidth={2} aria-hidden />
          </span>
          <span className="text-[length:var(--ts-xs)] font-bold uppercase tracking-[0.32em] text-white/85">
            Tienda Buleje
          </span>
        </div>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-[var(--ls-tight)] text-white leading-[1.05] drop-shadow-sm">
          {storeName}
        </h2>
        <p className="mt-2 text-sm sm:text-base font-medium text-white/80 max-w-md">
          Hecho con cariño en Ciudad Constitución &middot; delivery rápido y atención local
        </p>
      </div>

      {/* Bottom-right wordmark */}
      <div
        aria-hidden
        className="absolute bottom-3 right-4 sm:bottom-5 sm:right-8 text-[length:var(--ts-2xs)] font-black uppercase tracking-[0.4em] text-white/40"
      >
        Buleje &middot; Ciudad Constitución &middot; PE
      </div>
    </div>
  );
}
