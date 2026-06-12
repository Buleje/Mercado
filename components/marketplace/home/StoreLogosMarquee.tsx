"use client";

/**
 * StoreLogosMarquee — banda animada con los logos de TODAS las tiendas
 * (Brandon 2026-06-12 v2): rediseño más grande + con más movimiento. Logos
 * grandes (h-24/h-28) en pastillas con anillo + sombra, nombre debajo, que se
 * deslizan en loop continuo (marquee) y, además, "respiran" (float sutil
 * escalonado). Hover: pausa + realce del logo. Cada logo linkea a su storefront.
 *
 * Datos: `/api/marketplace/featured-stores`. Lista duplicada para loop seamless.
 * Movimiento por CSS (@keyframes inyectado), SSR-friendly y barato.
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Store, Sparkles } from "@buleje/design-system/icons";

interface MarqueeStore {
  slug: string;
  name: string;
  logo: string | null;
}

export default function StoreLogosMarquee() {
  const [stores, setStores] = useState<MarqueeStore[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/marketplace/featured-stores?limit=20&productsPerStore=0", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch failed"))))
      .then((j) => {
        if (cancelled) return;
        const list = ((j?.stores ?? []) as MarqueeStore[])
          .map((s) => ({ slug: s.slug, name: s.name, logo: s.logo ?? null }))
          .filter((s) => s.slug);
        setStores(list);
      })
      .catch(() => {/* no crítico: la banda se oculta */});
    return () => {
      cancelled = true;
    };
  }, []);

  if (stores.length < 3) return null;

  // Duplicamos para el loop seamless (translate -50% = el ancho de una copia).
  const loop = [...stores, ...stores];
  const durationS = Math.max(22, stores.length * 3.2);

  return (
    <section
      aria-label="Nuestras tiendas"
      className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6"
    >
      <style>{`
        @keyframes bsm-store-marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        @keyframes bsm-store-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
      `}</style>

      <div className="relative overflow-hidden rounded-3xl border border-[var(--rule-base)] bg-gradient-to-b from-[var(--accent-soft)]/40 to-[var(--surface-raised)] px-2 py-5 sm:py-6">
        {/* Encabezado chico */}
        <div className="mb-4 flex items-center justify-center gap-2 px-4">
          <Sparkles className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.25} aria-hidden />
          <p className="text-[length:var(--ts-2xs)] sm:text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]">
            Las tiendas de tu barrio
          </p>
          <Sparkles className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.25} aria-hidden />
        </div>

        {/* Marquee con máscara de degradado en los bordes */}
        <div className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]">
          <div
            className="flex w-max items-start gap-6 sm:gap-9 will-change-transform group-hover:[animation-play-state:paused]"
            style={{ animation: `bsm-store-marquee ${durationS}s linear infinite` }}
          >
            {loop.map((s, i) => (
              <Link
                key={`${s.slug}-${i}`}
                href={`/marketplace/${s.slug}`}
                aria-label={`Ver tienda ${s.name}`}
                aria-hidden={i >= stores.length}
                tabIndex={i >= stores.length ? -1 : undefined}
                className="group/item flex shrink-0 flex-col items-center gap-2 w-24 sm:w-28"
              >
                <span
                  className="relative grid h-24 w-24 sm:h-28 sm:w-28 place-items-center overflow-hidden rounded-full bg-[var(--surface-raised)] ring-2 ring-[var(--rule-base)] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.25)] transition-all duration-300 group-hover/item:-translate-y-1 group-hover/item:scale-105 group-hover/item:ring-[var(--accent)] group-hover/item:shadow-[0_14px_32px_-8px_rgba(0,0,0,0.35)]"
                  style={{ animation: `bsm-store-float ${3 + (i % 4) * 0.5}s ease-in-out ${(i % 5) * 0.3}s infinite` }}
                >
                  {s.logo ? (
                    <Image src={s.logo} alt={s.name} fill sizes="112px" className="object-cover" />
                  ) : (
                    <span className="grid h-full w-full place-items-center bg-[var(--accent-soft)] text-[var(--accent)]">
                      <Store className="h-9 w-9 sm:h-10 sm:w-10" strokeWidth={1.75} aria-hidden />
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate text-xs sm:text-sm font-bold text-[var(--text-secondary)] transition-colors group-hover/item:text-[var(--accent)]">
                  {s.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
