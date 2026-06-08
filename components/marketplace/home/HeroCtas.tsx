"use client";

/**
 * HeroCtas — buscador protagonista + atajos del hero de la home (B2C).
 *
 * Brandon 2026-06-08: la home arranca SHOP-FIRST (estilo Mercado Libre/Temu).
 * El BUSCADOR es la acción #1 del hero (antes solo vivía en el navbar). Debajo,
 * dos atajos secundarios: "Ver todas las tiendas" y "Ofertas del día".
 *  - "Ofertas del día" SOLO fuera del "modo tienda" (tiendas-only). Mientras el
 *    modo no resuelve (SSR/hidratación) se trata como tiendas-only → no parpadea.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Store, ArrowUpRight, Sparkles, Search } from "@buleje/design-system/icons";
import { useMarketplaceNavMode } from "@/hooks/use-marketplace-nav-mode";

export default function HeroCtas() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const mode = useMarketplaceNavMode();
  const showOfertas = mode !== null && mode !== "tiendas-only";

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/marketplace/buscar?q=${encodeURIComponent(term)}` : "/marketplace/buscar");
  };

  return (
    <>
      {/* ── Buscador protagonista (acción #1 de la home) ── */}
      <form
        role="search"
        aria-label="Buscar en Buleje"
        onSubmit={onSearch}
        className="mt-7 sm:mt-9 mx-auto w-full max-w-2xl"
      >
        <div className="flex items-stretch gap-1.5 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-sm transition-colors focus-within:border-[var(--accent)]">
          <span className="pl-4 sm:pl-5 flex items-center text-[var(--text-tertiary)]">
            <Search className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Busca productos, tiendas o categorías…"
            aria-label="Buscar productos, tiendas o categorías"
            className="flex-1 min-w-0 bg-transparent border-0 outline-none px-2 py-4 sm:py-5 text-base sm:text-lg text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
          />
          <button
            type="submit"
            aria-label="Buscar"
            className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl m-1.5 px-4 sm:px-7 font-extrabold text-white text-base bg-[var(--accent)] transition-opacity hover:opacity-90 active:scale-[0.98]"
          >
            <Search className="h-5 w-5 sm:hidden" strokeWidth={2.5} aria-hidden />
            <span className="hidden sm:inline">Buscar</span>
          </button>
        </div>
      </form>

      {/* ── Atajos secundarios (el buscador es la acción #1) ── */}
      <div className="mt-4 sm:mt-5 flex flex-col sm:flex-row items-stretch sm:items-center sm:justify-center gap-3 sm:flex-wrap">
        <Link
          href="/tiendas"
          aria-label="Ver todas las tiendas"
          className="group inline-flex w-full sm:w-auto justify-center items-center gap-2 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 h-[52px] text-base font-extrabold text-[var(--text-primary)] shadow-sm transition-all hover:border-[var(--accent)] hover:text-[var(--accent)] hover:shadow-md"
        >
          <Store className="h-5 w-5" strokeWidth={2.25} aria-hidden />
          Ver todas las tiendas
          <ArrowUpRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            strokeWidth={2.75}
            aria-hidden
          />
        </Link>

        {showOfertas && (
          <Link
            href="/marketplace/ofertas"
            className="inline-flex w-full sm:w-auto justify-center items-center gap-2 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 h-[52px] text-base font-extrabold text-[var(--text-primary)] shadow-sm transition-all hover:border-[var(--accent)] hover:text-[var(--accent)] hover:shadow-md"
          >
            <Sparkles className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            Ofertas del día
          </Link>
        )}
      </div>
    </>
  );
}
