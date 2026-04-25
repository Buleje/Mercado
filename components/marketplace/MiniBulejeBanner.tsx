"use client";

/**
 * MiniBulejeBanner — versión reducida de BulejeBrandBanner usada en las
 * cards del directorio de tiendas (/tiendas) cuando la tienda no subió
 * logo/banner propio.
 *
 * Composición compacta:
 *   - Gradient teal→ink + dot pattern
 *   - Avatar grande con la inicial del store
 *   - Wordmark "TIENDA BULEJE" arriba
 *
 * Sin imágenes externas — 100% CSS+SVG inline. Carga instantánea.
 */

import { Sparkles } from "@buleje/design-system/icons";

export default function MiniBulejeBanner({ storeName }: { storeName: string }) {
  const initial = storeName.trim().charAt(0).toUpperCase();
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, var(--accent) 0%, color-mix(in oklch, var(--accent) 65%, #051418) 70%, #051418 100%)",
      }}
      aria-hidden
    >
      {/* Dot pattern */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.18] mix-blend-soft-light">
        <defs>
          <pattern
            id={`mini-buleje-dots-${initial}`}
            x="0"
            y="0"
            width="18"
            height="18"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="1.2" fill="white" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#mini-buleje-dots-${initial})`} />
      </svg>

      {/* Decorative circles */}
      <div className="absolute -top-10 -right-8 h-32 w-32 rounded-full border border-white/15" />
      <div className="absolute -top-4 -right-2 h-20 w-20 rounded-full bg-white/10 backdrop-blur-sm" />

      {/* Wordmark top-left */}
      <div className="absolute top-3 left-3 inline-flex items-center gap-1.5">
        <span className="inline-flex items-center justify-center h-5 w-5 rounded-md bg-white/20 backdrop-blur-sm">
          <Sparkles className="h-3 w-3 text-white" strokeWidth={2} />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.32em] text-white/85">
          Tienda Buleje
        </span>
      </div>

      {/* Big initial center */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-6xl sm:text-7xl font-black tracking-[-0.04em] text-white drop-shadow-md">
          {initial}
        </span>
      </div>

      {/* Bottom-right wordmark */}
      <div className="absolute bottom-2 right-3 text-[9px] font-black uppercase tracking-[0.4em] text-white/40">
        Pucallpa
      </div>
    </div>
  );
}
