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
    <div className="mt-7 sm:mt-9 flex items-center justify-center gap-3 flex-wrap">
      <Link
        href="/tiendas"
        className="group inline-flex items-center gap-2.5 rounded-full px-7 sm:px-9 h-12 sm:h-14 text-base font-extrabold text-white shadow-lg shadow-[var(--accent)]/30 hover:shadow-xl hover:shadow-[var(--accent)]/40 hover:scale-[1.03] active:scale-[0.98] transition-all"
        style={{ background: "var(--accent)" }}
      >
        <Store className="h-5 w-5" strokeWidth={2.25} aria-hidden />
        Ver todas las tiendas
        <ArrowUpRight
          className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          strokeWidth={2.5}
          aria-hidden
        />
      </Link>

      {showOfertas && (
        <Link
          href="/marketplace/ofertas"
          className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 h-12 sm:h-14 text-base font-extrabold text-[var(--text-primary)] shadow-sm transition-all hover:border-[var(--accent)] hover:text-[var(--accent)] hover:shadow-md"
        >
          <Sparkles className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          Ofertas del día
        </Link>
      )}
    </div>
  );
}
