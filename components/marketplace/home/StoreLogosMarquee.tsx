"use client";

/**
 * StoreLogosMarquee — "Las tiendas de tu barrio" (Brandon 2026-07-06 · rediseño
 * v5 "una sola fila"). Antes era una grilla agrupada por rubro; ahora es UN
 * carrusel horizontal (HorizontalCarousel: drag + snap + flechas + barra) de
 * tarjetas estilo "mini-tienda": banda con gradiente teal firma + ícono del
 * rubro de watermark, logo-avatar solapado, nombre + verificado, rating/rubro/
 * zona y pie con conteo de productos + CTA en hover. Contenida, clickeable y en
 * una sola fila. Datos: `/api/marketplace/featured-stores` (o `initialStores` RSC).
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
  UtensilsCrossed,
  ShoppingBasket,
  Wrench,
  Smartphone,
  Pill,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { formatCategoryLabel } from "@/lib/format-category";
import { verticalForStoreCategory } from "@/lib/marketplace/verticals";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";

// Icono por vertical — single-source con lib/marketplace/verticals.
const VERTICAL_ICONS: Record<string, LucideIcon> = {
  comida: UtensilsCrossed,
  bodega: ShoppingBasket,
  ferreteria: Wrench,
  electro: Smartphone,
  farmacia: Pill,
};

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

const MAX_STORES = 15;

/** Tarjeta "mini-tienda" — banda gradiente + logo solapado + info + CTA hover. */
function StoreTile({ store: s }: { store: MarqueeStore }) {
  const rating = s.rating ?? 0;
  const hasRating = rating > 0;
  const products = s.productsCount ?? 0;
  const RubroIcon = VERTICAL_ICONS[verticalForStoreCategory(s.category) ?? ""] ?? Store;
  return (
    <Link
      href={`/marketplace/${s.slug}`}
      aria-label={`Ver tienda ${s.name}`}
      className="group/card relative flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-[var(--accent)]/60 hover:shadow-[0_20px_44px_-18px_rgba(0,0,0,0.3)]"
    >
      {/* Banda de portada — gradiente teal firma + ícono del rubro de watermark */}
      <div className="relative h-16 bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)]">
        <RubroIcon
          aria-hidden
          strokeWidth={1.5}
          className="pointer-events-none absolute -right-1 top-1 h-16 w-16 rotate-12 text-white/[0.18] transition-transform duration-500 group-hover/card:scale-110"
        />
        {hasRating && (
          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-0.5 rounded-full bg-[var(--surface-canvas)]/95 px-2 py-0.5 text-[length:var(--ts-2xs)] font-black tabular-nums text-[var(--text-primary)] shadow ring-1 ring-black/5">
            <Star
              className="h-2.5 w-2.5 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]"
              aria-hidden
            />
            {rating.toFixed(1)}
          </span>
        )}
      </div>

      {/* Logo-avatar solapando la banda */}
      <div className="px-3 -mt-7">
        <span className="relative grid h-14 w-14 place-items-center overflow-hidden rounded-2xl bg-[var(--surface-canvas)] shadow-md ring-4 ring-[var(--surface-raised)]">
          {s.logo ? (
            <Image
              src={s.logo}
              alt=""
              fill
              sizes="56px"
              className="object-cover transition-transform duration-500 group-hover/card:scale-110"
            />
          ) : (
            <span className="grid h-full w-full place-items-center bg-[var(--accent-soft)] text-[var(--accent)]">
              <Store className="h-7 w-7" strokeWidth={1.75} aria-hidden />
            </span>
          )}
        </span>
      </div>

      {/* Cuerpo */}
      <div className="flex flex-1 flex-col px-3 pb-3 pt-2">
        <span className="flex items-center gap-1">
          <span className="line-clamp-1 text-sm font-extrabold leading-tight text-[var(--text-primary)] transition-colors group-hover/card:text-[var(--accent)]">
            {s.name}
          </span>
          <ShieldCheck
            className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]"
            strokeWidth={2.5}
            aria-label="Tienda verificada"
          />
        </span>
        <span className="mt-0.5 line-clamp-1 text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
          {s.category ? formatCategoryLabel(s.category) : "Tienda"}
          {s.zone ? ` · ${s.zone}` : ""}
        </span>

        {/* Pie: conteo de productos (o "Nueva") + CTA en hover */}
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--rule-soft)] pt-2.5">
          {products > 0 ? (
            <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
              <Package className="h-3 w-3" aria-hidden /> {products} prod.
            </span>
          ) : (
            <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wide text-[var(--accent)]">
              Nueva
            </span>
          )}
          <span className="inline-flex items-center gap-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--accent)] opacity-0 transition-opacity duration-300 group-hover/card:opacity-100">
            Ver <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </span>
        </div>
      </div>
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

        {/* ── Una sola fila: carrusel horizontal (drag + snap + flechas + barra) ── */}
        <div className="relative px-1 sm:px-2">
          <HorizontalCarousel
            ariaLabel="Tiendas de tu barrio"
            itemWidthClass="w-[62vw] sm:w-[220px] lg:w-[236px] shrink-0 snap-start"
            edgeBleed={false}
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
