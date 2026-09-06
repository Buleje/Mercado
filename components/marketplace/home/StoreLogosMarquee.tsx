"use client";

/**
 * StoreLogosMarquee — "Las tiendas de tu barrio" (Brandon 2026-07-06 · rediseño
 * v6 "stories"). Una sola fila de AVATARES CIRCULARES grandes (estilo stories de
 * IG): logo en círculo con anillo de acento (gradiente teal firma), sello
 * verificado en la esquina, nombre + rating/"Nueva" debajo. Minimalista, foco
 * total en la marca, sin bandas de color. Fila scrollable (HorizontalCarousel:
 * drag + snap + flechas). Datos: `/api/marketplace/featured-stores` (o RSC).
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Star, ShieldCheck, ArrowRight } from "@buleje/design-system/icons";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";

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

const MAX_STORES = 16;

/** Avatar circular "stories": anillo de acento + logo + sello + nombre + rating. */
function StoreTile({ store: s }: { store: MarqueeStore }) {
  const rating = s.rating ?? 0;
  const hasRating = rating > 0;
  const initial = s.name.trim().charAt(0).toUpperCase();
  return (
    <Link
      href={`/marketplace/${s.slug}`}
      aria-label={`Ver tienda ${s.name}`}
      className="group/card flex flex-col items-center gap-2 pt-1 text-center"
    >
      {/* Anillo de acento (gradiente) + logo circular */}
      <span className="relative grid place-items-center">
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)] opacity-90 transition-opacity duration-300 group-hover/card:opacity-100"
        />
        <span className="relative m-[3px] grid h-[76px] w-[76px] place-items-center overflow-hidden rounded-full bg-[var(--surface-raised)] ring-2 ring-[var(--surface-raised)] transition-transform duration-300 group-hover/card:scale-[1.04] sm:h-[84px] sm:w-[84px]">
          {s.logo ? (
            <Image src={s.logo} alt="" fill sizes="84px" className="object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center bg-primary/10 text-2xl font-black text-[var(--accent)]">
              {initial}
            </span>
          )}
        </span>
        {/* Sello verificado en la esquina */}
        <span className="absolute -bottom-0.5 -right-0.5 z-10 grid h-6 w-6 place-items-center rounded-full bg-[var(--surface-raised)] shadow ring-1 ring-[var(--rule-base)]">
          <ShieldCheck
            className="h-3.5 w-3.5 text-[var(--accent)]"
            strokeWidth={2.5}
            aria-label="Tienda verificada"
          />
        </span>
      </span>

      {/* Nombre */}
      <span className="line-clamp-1 max-w-[92px] text-[length:var(--ts-xs)] font-extrabold leading-tight text-[var(--text-primary)] transition-colors group-hover/card:text-[var(--accent)] sm:max-w-[104px] sm:text-sm">
        {s.name}
      </span>

      {/* Rating o "Nueva" */}
      {hasRating ? (
        <span className="inline-flex items-center gap-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">
          <Star
            className="h-3 w-3 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]"
            aria-hidden
          />
          {rating.toFixed(1)}
        </span>
      ) : (
        <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wide text-[var(--accent)]">
          Nueva
        </span>
      )}
    </Link>
  );
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
      .catch(() => {
        /* no crítico: la banda se oculta */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (stores.length < 3) return null;

  const shown = stores.slice(0, MAX_STORES);

  return (
    <section
      aria-label="Las tiendas de tu barrio"
      className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7"
    >
      <div className="relative overflow-hidden rounded-[28px] border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-6 shadow-[0_8px_30px_-14px_rgba(0,0,0,0.12)] sm:px-5 sm:py-7">
        {/* Glow decorativo de marca (esquina) — apenas perceptible, no ensucia. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[var(--accent)]/[0.06] blur-3xl"
        />

        {/* ── Header editorial ─────────────────────────────────────────── */}
        <header className="relative mb-5 flex items-end justify-between gap-3 px-1 sm:px-2">
          <div className="min-w-0">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
              Marcas del barrio
            </p>
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
            <ArrowRight
              className="h-4 w-4 transition-transform group-hover/all:translate-x-0.5"
              strokeWidth={2.5}
              aria-hidden
            />
          </Link>
        </header>

        {/* ── Una sola fila de avatares "stories" (drag + snap + flechas) ── */}
        <div className="relative px-1 sm:px-2">
          <HorizontalCarousel
            ariaLabel="Tiendas de tu barrio"
            itemWidthClass="w-[86px] sm:w-[108px] shrink-0 snap-start"
            edgeBleed={false}
            showBar={false}
          >
            {shown.map((s) => (
              <StoreTile key={s.slug} store={s} />
            ))}
          </HorizontalCarousel>
        </div>
      </div>
    </section>
  );
}
