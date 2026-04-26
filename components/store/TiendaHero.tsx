"use client";

/**
 * TiendaHero — Hero de la tienda publica tenant-scoped.
 *
 * Estructura:
 *   LEFT (60%): kicker teal + h1 editorial + subtitle + 2 CTAs
 *   RIGHT (40%): ilustracion grande con wash teal sutil de fondo
 *
 * CTAs:
 *   - Primario: "Ver productos" → scroll a #productos
 *   - Secundario: "Mi carrito" → abre el cart sidebar via useCart().open()
 */

import Link from "next/link";
import { ShoppingBag, ShoppingCart } from "@buleje/design-system/icons";
import { DoniaElena } from "@/components/ui-system/illustrations/pucallpa-locals";
import { useCart } from "@/contexts/cart-context";

export interface TiendaHeroProps {
  slug: string;
  storeName: string;
  productCount: number;
}

export default function TiendaHero({ slug, storeName, productCount }: TiendaHeroProps) {
  const { open: openCart, count } = useCart();
  return (
    <section
      className="relative overflow-hidden border-b border-[var(--rule-soft)]"
      style={{ background: "#060a0d" }}
      aria-label="Bienvenida a la tienda"
    >
      {/* Ambient glows */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-[var(--accent)]/12 blur-[120px]" />
        <div className="absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-white/5 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16 lg:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12 items-center">
          {/* LEFT — copy + CTAs (3/5 cols) */}
          <div className="lg:col-span-3 text-center lg:text-left">
            <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)] mb-5">
              Tu bodega en Pucallpa
            </span>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-[1.08] tracking-tight">
              Todo lo que necesitas,
              <span className="block text-white/85 mt-1">en 25 minutos</span>
            </h1>
            <p className="mt-5 text-base sm:text-lg text-white/70 leading-relaxed max-w-xl lg:max-w-none mx-auto lg:mx-0">
              Frescos, calidos, con la confianza de tu barrio. {storeName} te lleva
              la despensa completa a la puerta — Yape, Plin o efectivo.
            </p>

            {/* CTAs */}
            <div className="mt-7 flex flex-col sm:flex-row gap-3 items-center lg:items-start justify-center lg:justify-start">
              <Link
                href="#productos"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-600)] text-white font-bold text-sm transition-all active:scale-[0.98] shadow-lg shadow-[var(--accent)]/25 w-full sm:w-auto"
              >
                <ShoppingBag className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
                <span>Ver productos</span>
              </Link>
              <button
                type="button"
                onClick={openCart}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10 text-white font-semibold text-sm transition-all w-full sm:w-auto"
              >
                <ShoppingCart className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
                <span>Mi carrito{count > 0 ? ` (${count})` : ""}</span>
              </button>
            </div>

            {/* Meta stats — compact */}
            <div className="mt-7 flex flex-wrap items-center justify-center lg:justify-start gap-x-5 gap-y-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-white/50 tabular-nums">
              <span>
                {productCount > 0
                  ? `${productCount} producto${productCount !== 1 ? "s" : ""}`
                  : "Proximamente"}
              </span>
              <span className="h-1 w-1 rounded-full bg-white/25" aria-hidden="true" />
              <span>Delivery 25 min</span>
              <span className="h-1 w-1 rounded-full bg-white/25" aria-hidden="true" />
              <span>Yape · Plin · Efectivo</span>
            </div>
          </div>

          {/* RIGHT — ilustracion (2/5 cols) */}
          <div className="lg:col-span-2 flex justify-center lg:justify-end">
            <div className="relative">
              {/* Wash teal detras */}
              <div
                className="absolute inset-0 rounded-full bg-[var(--accent)]/15 blur-[40px] scale-90"
                aria-hidden="true"
              />
              {/* Card contenedora sutil */}
              <div
                className="relative rounded-3xl bg-white/[0.04] border border-white/10 p-6 sm:p-8 backdrop-blur-sm"
                aria-hidden="true"
              >
                <DoniaElena
                  size={260}
                  strokeWidth={1.5}
                  className="text-white/90"
                />
              </div>
              {/* Micro-badge identidad */}
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-[var(--accent)] text-white text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider shadow-lg shadow-[var(--accent)]/30 whitespace-nowrap">
                Hecho en Pucallpa
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
