"use client";

/**
 * StoreBannerArea — banner superior de la Store Detail Page.
 *
 * Si la tienda subió un banner propio, lo muestra como hero image cubriendo
 * todo el contenedor. Si NO hay banner, renderiza BulejeBrandBanner — un
 * banner de marca por defecto creativo: gradiente teal→ink, patrón de
 * puntos, formas geométricas y wordmark "Buleje · Pucallpa".
 *
 * Brandon 2026-07-07: la fila flotante con logo + chips de categoría/zona se
 * REMOVIÓ. Esa identidad ya vive en la barra lateral (desktop) y en la barra
 * slim sticky + trust strip (mobile) — repetirla sobre el banner era ruido.
 * El banner queda como una franja hero limpia.
 *
 * Sin emojis, sin saturación. Estilo Holded/Buleje.
 */

import Image from "next/image";
import { useState } from "react";
import { m as motion } from "framer-motion";
import { Sparkles } from "@buleje/design-system/icons";

interface StoreBannerAreaProps {
  /** URL del banner subido por el dueño. null/empty → default Buleje. */
  banner?: string | null;
  /** Nombre — usado para el alt text y el wordmark del banner default. */
  name: string;
  /** Categoría — solo para enriquecer el alt text (SEO/a11y). */
  category?: string | null;
  /** Zona — solo para enriquecer el alt text (SEO/a11y). */
  zone?: string | null;
}

export default function StoreBannerArea({
  banner,
  name,
  category,
  zone,
}: StoreBannerAreaProps) {
  // FIX 2026-05-07: si el banner externo no carga (DNS, 404, CORS), caemos al
  // BulejeBrandBanner default. Antes el alt text "Banner de Buleje" quedaba
  // visible como texto raw — UX rota.
  const [bannerError, setBannerError] = useState(false);
  const hasBanner = Boolean(banner && banner.trim().length > 0) && !bannerError;

  return (
    <section aria-label={`Cabecera de ${name}`} className="relative w-full overflow-hidden">
      {/* ── Banner background ─────────────────────────────────────────────── */}
      {/* Compact: era h-44/56/64 — estiraba muy alto en desktop. Ahora 32/36/40
          (~37% mas chico) para que se vea proporcionado al banner real subido
          desde admin/configuracion en vez de tipo poster gigante. */}
      <motion.div
        initial={{ opacity: 0, scale: 1.04 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative h-[6.5rem] sm:h-[7.25rem] lg:h-[8rem] w-full"
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
          <pattern
            id="buleje-dots"
            x="0"
            y="0"
            width="22"
            height="22"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="1.4" fill="white" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#buleje-dots)" />
      </svg>

      {/* Decorative circles top-right */}
      <div
        aria-hidden
        className="absolute -top-24 -right-20 h-72 w-72 rounded-full border border-white/15"
      />
      <div
        aria-hidden
        className="absolute -top-12 -right-10 h-48 w-48 rounded-full border border-white/10"
      />
      <div
        aria-hidden
        className="absolute top-6 right-12 h-24 w-24 rounded-full bg-white/10 backdrop-blur-sm"
      />

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
