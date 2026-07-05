"use client";

/**
 * StoreLogosMarquee — "Las tiendas de tu barrio" (Brandon 2026-07-05 · rediseño
 * v4 "grilla contenida"). Antes era un marquee auto-scroll que se corría al
 * borde; ahora es una GRILLA de tarjetas de tienda (como el catálogo): logo en
 * tile, nombre + sello verificado, rating/rubro y conteo de productos, con
 * realce y CTA al pasar el mouse. Contenida, clickeable y sin movimiento que
 * distraiga. Datos: `/api/marketplace/featured-stores` (o `initialStores` RSC).
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
  Package,
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

const MAX_STORES = 12;

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
            <ArrowRight className="h-4 w-4 transition-transform group-hover/all:translate-x-0.5" strokeWidth={2.5} aria-hidden />
          </Link>
        </header>

        {/* ── Tiles verticales de tienda — una sola fila contenida ───────── */}
        <ul className="relative grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((s) => {
            const rating = s.rating ?? 0;
            const hasRating = rating > 0;
            const products = s.productsCount ?? 0;
            return (
              <li key={s.slug}>
                <Link
                  href={`/marketplace/${s.slug}`}
                  aria-label={`Ver tienda ${s.name}`}
                  className="group/card relative flex h-full flex-col items-center overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-[var(--accent)]/50 hover:shadow-[0_20px_44px_-18px_rgba(0,0,0,0.3)]"
                >
                  {/* Logo prominente con sheen en hover */}
                  <span className="relative grid h-20 w-20 place-items-center overflow-hidden rounded-2xl bg-[var(--surface-sunken)] ring-1 ring-[var(--rule-base)] transition-all duration-300 group-hover/card:ring-2 group-hover/card:ring-[var(--accent)]/60">
                    {s.logo ? (
                      <Image src={s.logo} alt={s.name} fill sizes="80px" className="object-cover transition-transform duration-500 group-hover/card:scale-110" />
                    ) : (
                      <span className="grid h-full w-full place-items-center bg-[var(--accent-soft)] text-[var(--accent)]">
                        <Store className="h-9 w-9" strokeWidth={1.75} aria-hidden />
                      </span>
                    )}
                  </span>

                  {/* Nombre + verificado */}
                  <span className="mt-3 flex items-center justify-center gap-1">
                    <span className="line-clamp-1 text-sm font-extrabold leading-tight text-[var(--text-primary)]">
                      {s.name}
                    </span>
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" strokeWidth={2.5} aria-label="Tienda verificada" />
                  </span>

                  {/* Rating · rubro */}
                  <span className="mt-1 flex flex-wrap items-center justify-center gap-x-1.5 text-xs text-[var(--text-secondary)]">
                    {hasRating ? (
                      <span className="inline-flex items-center gap-0.5 font-bold text-[var(--text-primary)]">
                        <Star className="h-3.5 w-3.5 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" strokeWidth={2} aria-hidden />
                        {rating.toFixed(1)}
                      </span>
                    ) : (
                      <span className="font-semibold">Nueva</span>
                    )}
                    {s.category && (
                      <>
                        {hasRating && <span className="text-[var(--rule-strong)]" aria-hidden>·</span>}
                        <span className="truncate capitalize">{s.category}</span>
                      </>
                    )}
                  </span>

                  {/* Chip de productos + CTA que aparece en hover */}
                  <span className="mt-3 flex items-center gap-2">
                    {products > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">
                        <Package className="h-3 w-3" aria-hidden /> {products} productos
                      </span>
                    )}
                    <span className="inline-flex items-center gap-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--accent)] opacity-0 transition-opacity duration-300 group-hover/card:opacity-100">
                      Ver <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
