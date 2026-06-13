"use client";

/**
 * StoreLogosMarquee — "Las tiendas de tu barrio" (Brandon 2026-06-13 · rediseño
 * v3 "brand wall" pro). Antes: aro circular con el logo. Ahora: muro de MARCAS
 * estilo marketplace premium — cada tienda es una tarjeta con su logo en tile
 * redondeado, nombre + sello verificado, y una línea de meta (rubro · rating).
 * Las tarjetas se deslizan en loop continuo (marquee, pausa en hover) con un
 * brillo "sheen" que barre el tile y un realce con anillo de acento al pasar el
 * mouse. Header editorial: eyebrow + título + contador en vivo + "Ver todas".
 *
 * Datos: `/api/marketplace/featured-stores` (o `initialStores` desde RSC para
 * pintar en el primer byte). Lista duplicada para loop seamless. Movimiento por
 * CSS (@keyframes inyectado), SSR-friendly y barato.
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Store,
  Star,
  ShieldCheck,
  ArrowUpRight,
  ArrowRight,
} from "@buleje/design-system/icons";

export interface MarqueeStore {
  slug: string;
  name: string;
  logo: string | null;
  category?: string | null;
  zone?: string | null;
  rating?: number;
  reviewCount?: number;
  productsCount?: number;
}

export default function StoreLogosMarquee({
  initialStores,
}: { initialStores?: MarqueeStore[] } = {}) {
  // perf audit P1: si llegan las tiendas resueltas del SERVER (RSC), se pintan
  // en el primer byte y se omite el fetch client. Sino, fetch legacy.
  const hasInitial = !!initialStores && initialStores.length > 0;
  const [stores, setStores] = useState<MarqueeStore[]>(hasInitial ? initialStores! : []);

  useEffect(() => {
    if (hasInitial) return;
    let cancelled = false;
    fetch("/api/marketplace/featured-stores?limit=20&productsPerStore=0", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch failed"))))
      .then((j) => {
        if (cancelled) return;
        const list = ((j?.stores ?? []) as MarqueeStore[])
          .map((s) => ({
            slug: s.slug,
            name: s.name,
            logo: s.logo ?? null,
            category: s.category ?? null,
            zone: s.zone ?? null,
            rating: s.rating ?? 0,
            reviewCount: s.reviewCount ?? 0,
            productsCount: s.productsCount ?? 0,
          }))
          .filter((s) => s.slug);
        setStores(list);
      })
      .catch(() => {/* no crítico: la banda se oculta */});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (stores.length < 3) return null;

  // Duplicamos para el loop seamless (translate -50% = el ancho de una copia).
  const loop = [...stores, ...stores];
  const durationS = Math.max(28, stores.length * 4.5);

  return (
    <section
      aria-label="Las tiendas de tu barrio"
      className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7"
    >
      <style>{`
        @keyframes bsm-brand-marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        @keyframes bsm-brand-sheen{0%{transform:translateX(-130%) skewX(-12deg)}60%,100%{transform:translateX(230%) skewX(-12deg)}}
        @keyframes bsm-brand-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(.78)}}
        @media (prefers-reduced-motion: reduce){
          .bsm-brand-track{animation:none !important}
          .bsm-brand-sheen{animation:none !important;opacity:0 !important}
          .bsm-brand-dot{animation:none !important}
        }
      `}</style>

      <div className="relative overflow-hidden rounded-[28px] border border-[var(--rule-base)] bg-gradient-to-br from-[var(--accent-soft)]/55 via-[var(--surface-raised)] to-[var(--surface-raised)] px-3 py-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:px-5 sm:py-7">
        {/* Glow decorativo de marca (esquina) */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[var(--accent)]/10 blur-3xl"
        />

        {/* ── Header editorial ─────────────────────────────────────────── */}
        <header className="relative mb-5 flex items-end justify-between gap-3 px-1 sm:px-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="bsm-brand-dot absolute inline-flex h-full w-full rounded-full bg-[var(--accent)]" style={{ animation: "bsm-brand-pulse 2.4s ease-in-out infinite" }} />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
              </span>
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
                Marcas del barrio
              </p>
            </div>
            <h2 className="mt-1 text-xl font-black leading-tight tracking-tight text-[var(--text-primary)] sm:text-2xl">
              Las tiendas de tu barrio
            </h2>
          </div>

          <Link
            href="/tiendas"
            className="group/all inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--surface-raised)] px-4 py-2 text-sm font-bold text-[var(--text-secondary)] ring-1 ring-[var(--rule-base)] transition-all hover:bg-[var(--accent)] hover:text-white hover:ring-[var(--accent)]"
          >
            <span className="hidden sm:inline">Ver las {stores.length} tiendas</span>
            <span className="sm:hidden">Ver todas</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover/all:translate-x-0.5" strokeWidth={2.5} aria-hidden />
          </Link>
        </header>

        {/* ── Marquee de tarjetas de marca ─────────────────────────────── */}
        <div className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_4%,black_96%,transparent)]">
          <ul
            className="bsm-brand-track flex w-max items-stretch gap-4 will-change-transform group-hover:[animation-play-state:paused] sm:gap-5"
            style={{ animation: `bsm-brand-marquee ${durationS}s linear infinite` }}
          >
            {loop.map((s, i) => {
              const dup = i >= stores.length;
              const rating = s.rating ?? 0;
              const hasRating = rating > 0;
              return (
                <li key={`${s.slug}-${i}`} aria-hidden={dup} className="shrink-0">
                  <Link
                    href={`/marketplace/${s.slug}`}
                    aria-label={`Ver tienda ${s.name}`}
                    tabIndex={dup ? -1 : undefined}
                    className="group/card relative flex w-[236px] items-center gap-3 overflow-hidden rounded-3xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-[var(--accent)]/40 hover:shadow-[0_18px_40px_-16px_rgba(0,0,0,0.32)] sm:w-[264px] sm:p-3.5"
                  >
                    {/* Logo tile con sheen que barre en hover */}
                    <span className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[var(--surface-sunken)] ring-1 ring-[var(--rule-base)] transition-all duration-300 group-hover/card:ring-[var(--accent)]/60 sm:h-[68px] sm:w-[68px]">
                      {s.logo ? (
                        <Image src={s.logo} alt={s.name} fill sizes="68px" className="object-cover transition-transform duration-500 group-hover/card:scale-110" />
                      ) : (
                        <span className="grid h-full w-full place-items-center bg-[var(--accent-soft)] text-[var(--accent)]">
                          <Store className="h-7 w-7" strokeWidth={1.75} aria-hidden />
                        </span>
                      )}
                      {/* sheen */}
                      <span
                        aria-hidden
                        className="bsm-brand-sheen pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/55 to-transparent opacity-0 group-hover/card:opacity-100"
                        style={{ animation: "bsm-brand-sheen 1.1s ease-in-out" }}
                      />
                    </span>

                    {/* Info de marca */}
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex items-center gap-1">
                        <span className="truncate text-sm font-extrabold leading-tight text-[var(--text-primary)] sm:text-[15px]">
                          {s.name}
                        </span>
                        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" strokeWidth={2.5} aria-label="Tienda verificada" />
                      </span>

                      <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                        {hasRating ? (
                          <span className="inline-flex items-center gap-0.5 font-bold text-[var(--text-primary)]">
                            <Star className="h-3.5 w-3.5 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" strokeWidth={2} aria-hidden />
                            {rating.toFixed(1)}
                          </span>
                        ) : s.category ? (
                          <span className="truncate font-semibold capitalize">{s.category}</span>
                        ) : (
                          <span className="font-semibold">Nueva</span>
                        )}
                        {hasRating && s.category && (
                          <>
                            <span className="text-[var(--rule-strong)]" aria-hidden>·</span>
                            <span className="truncate capitalize">{s.category}</span>
                          </>
                        )}
                      </span>
                    </span>

                    {/* CTA flecha que aparece en hover — ABSOLUTA para no robar
                        ancho a la fila (así el nombre respira). */}
                    <span className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-[var(--accent)] text-white opacity-0 shadow-md transition-all duration-300 group-hover/card:translate-y-0 group-hover/card:opacity-100 -translate-y-1">
                      <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
