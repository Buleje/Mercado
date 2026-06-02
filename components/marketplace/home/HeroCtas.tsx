"use client";

/**
 * HeroCtas — botones de acción del hero de la home (B2C).
 *
 * Brandon 2026-05-30:
 *  - "Ver todas las tiendas" es ahora la acción PRIMARIA (botón grande relleno),
 *    porque el buscador salió del hero — el listado de tiendas es el destino.
 *  - "Ofertas del día" SOLO aparece fuera del "modo tienda" (tiendas-only, el
 *    default del marketplace). Mientras el modo no resuelve (SSR/hidratación) se
 *    trata como tiendas-only → no parpadea apareciendo y desapareciendo.
 */

import Link from "next/link";
import { Store, ArrowUpRight, Sparkles } from "@buleje/design-system/icons";
import { useMarketplaceNavMode } from "@/hooks/use-marketplace-nav-mode";

export default function HeroCtas() {
  const mode = useMarketplaceNavMode();
  const showOfertas = mode !== null && mode !== "tiendas-only";

  return (
    <div className="mt-7 sm:mt-9 flex flex-col sm:flex-row items-stretch sm:items-center sm:justify-center gap-3 sm:flex-wrap">
      {/* CTA primaria — más impactante (Brandon 2026-06-01): gradient + glow
          pulsante + barrido de luz continuo + flecha en movimiento. En MOBILE
          es full-width para máximo énfasis (es la acción #1: navegar tiendas).
          Respeta prefers-reduced-motion (motion-reduce:* corta animaciones). */}
      <Link
        href="/tiendas"
        aria-label="Ver todas las tiendas"
        className="group relative inline-flex w-full sm:w-auto justify-center items-center gap-2.5 overflow-hidden rounded-full px-8 sm:px-10 h-[54px] sm:h-[60px] text-base sm:text-lg font-black text-white transition-transform duration-300 hover:scale-[1.04] active:scale-[0.97] animate-[bjGlow_2.6s_ease-in-out_infinite] motion-reduce:animate-none"
        style={{
          background:
            "linear-gradient(115deg, var(--accent) 0%, var(--accent-dark, color-mix(in oklab, var(--accent) 78%, black)) 100%)",
        }}
      >
        {/* Barrido de luz continuo (movimiento) */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-[bjShine_3.4s_ease-in-out_infinite] motion-reduce:hidden"
          style={{
            background:
              "linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.45) 50%, transparent 65%)",
            backgroundSize: "250% 100%",
          }}
        />
        <Store className="relative h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.25} aria-hidden />
        <span className="relative">Ver todas las tiendas</span>
        <ArrowUpRight
          className="relative h-5 w-5 sm:h-6 sm:w-6 transition-transform animate-[bjArrow_1.5s_ease-in-out_infinite] group-hover:animate-none group-hover:translate-x-1 group-hover:-translate-y-1 motion-reduce:animate-none"
          strokeWidth={2.75}
          aria-hidden
        />
      </Link>

      {showOfertas && (
        <Link
          href="/marketplace/ofertas"
          className="inline-flex w-full sm:w-auto justify-center items-center gap-2 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 h-[54px] sm:h-[60px] text-base font-extrabold text-[var(--text-primary)] shadow-sm transition-all hover:border-[var(--accent)] hover:text-[var(--accent)] hover:shadow-md"
        >
          <Sparkles className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          Ofertas del día
        </Link>
      )}

      <style>{`
        @keyframes bjShine { 0% { background-position: 160% 0; } 55%, 100% { background-position: -60% 0; } }
        @keyframes bjArrow { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(2px, -2px); } }
        @keyframes bjGlow {
          0%, 100% { box-shadow: 0 10px 28px -10px color-mix(in oklab, var(--accent) 50%, transparent); }
          50%      { box-shadow: 0 16px 40px -8px color-mix(in oklab, var(--accent) 72%, transparent); }
        }
      `}</style>
    </div>
  );
}
