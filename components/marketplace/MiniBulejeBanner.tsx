"use client";

/**
 * MiniBulejeBanner — versión reducida de BulejeBrandBanner usada en las
 * cards del directorio de tiendas (/tiendas) cuando la tienda no subió
 * logo/banner propio.
 *
 * Composición compacta:
 *   - Gradient tonal por categoría → ink + dot pattern
 *   - Avatar grande con la inicial del store
 *   - Wordmark "TIENDA BULEJE" arriba
 *
 * Sin imágenes externas — 100% CSS+SVG inline. Carga instantánea.
 */

import { m as motion } from "framer-motion";
import { Sparkles } from "@buleje/design-system/icons";

/**
 * Mapeo categoría → tonalidad. Diferenciación visual instantánea sin
 * crear nuevos colores en el DS — solo elige el var ya existente.
 *
 * Default: bodega usa --accent (teal) que sigue siendo la marca.
 */
const CATEGORY_BASE: Record<string, string> = {
  bodega: "var(--accent)",
  panaderia: "#d97706", // amber 600 — pan recién horneado
  panaderías: "#d97706",
  farmacia: "#0284c7", // sky 600 — confianza médica
  licoreria: "#be123c", // rose 700 — vino/licor
  licorería: "#be123c",
  minimarket: "#7c3aed", // violet 600
  abarrotes: "var(--accent)",
  bebidas: "#0d9488", // teal 600
  limpieza: "#0891b2", // cyan 600
  frescos: "#16a34a", // green 600
};

function resolveBase(category?: string | null): string {
  if (!category) return CATEGORY_BASE.bodega;
  const key = category.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return CATEGORY_BASE[key] ?? CATEGORY_BASE.bodega;
}

export default function MiniBulejeBanner({
  storeName,
  category,
}: {
  storeName: string;
  category?: string | null;
}) {
  const initial = storeName.trim().charAt(0).toUpperCase();
  const base = resolveBase(category);
  // ID único por banner para evitar colisión de patterns SVG
  const patternId = `mini-buleje-dots-${initial}-${(category ?? "x").replace(/[^a-z]/gi, "")}`;
  return (
    <div
      className="group/mini absolute inset-0 overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${base} 0%, color-mix(in oklch, ${base} 65%, #051418) 70%, #051418 100%)`,
      }}
      aria-hidden
    >
      {/* Dot pattern */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.18] mix-blend-soft-light">
        <defs>
          <pattern id={patternId} x="0" y="0" width="18" height="18" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.2" fill="white" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>

      {/* Decorative circles */}
      <div className="absolute -top-10 -right-8 h-32 w-32 rounded-full border border-white/15" />
      <div className="absolute -top-4 -right-2 h-20 w-20 rounded-full bg-white/10 backdrop-blur-sm" />

      {/* Wordmark top-left — sparkle gira/escala en hover de la card */}
      <div className="absolute top-3 left-3 inline-flex items-center gap-1.5">
        <motion.span
          className="inline-flex items-center justify-center h-5 w-5 rounded-md bg-white/20 backdrop-blur-sm"
          initial={false}
          whileHover={{ rotate: 18, scale: 1.12 }}
          transition={{ type: "spring", stiffness: 320, damping: 16 }}
        >
          <Sparkles className="h-3 w-3 text-white" strokeWidth={2} />
        </motion.span>
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.32em] text-white/85">
          Tienda Buleje
        </span>
      </div>

      {/* Big initial center — sutil scale en hover */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        initial={false}
        whileHover={{ scale: 1.05 }}
        transition={{ type: "spring", stiffness: 240, damping: 22 }}
      >
        <span className="text-6xl sm:text-7xl font-black tracking-[-0.04em] text-white drop-shadow-md">
          {initial}
        </span>
      </motion.div>

      {/* Bottom-right wordmark */}
      <div className="absolute bottom-2 right-3 text-[length:var(--ts-2xs)] font-black uppercase tracking-[0.4em] text-white/40">
        Pucallpa
      </div>
    </div>
  );
}
