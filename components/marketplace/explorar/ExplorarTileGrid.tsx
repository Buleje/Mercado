"use client";

/**
 * ExplorarTileGrid — Top de /explorar en cajas uniformes, estilo
 * Mercado Libre / Amazon. Todas las tiles tienen el MISMO ancho,
 * MISMO alto, MISMO radius y MISMO border. Grid estricto sin spans
 * asimétricos — Zero descuadre.
 *
 * Layout desktop:
 *   Row 1: Banner principal                          (1 caja · h-[320px])
 *   Row 2: 4 bento cards iguales (grid-cols-4)       (4 cajas · h-[180px])
 *   Row 3: 8 iconos de categoría (grid-cols-8)       (1 caja · h-[120px])
 *   Row 4: Ofertas del día (col-span-2) + side (1)   (2 cajas · h-[420px])
 *
 * Mobile: todo 1-col / 2-col donde aplique.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Truck,
  Sparkles,
  Wallet,
  Leaf,
  Clock,
  ArrowRight,
  Flame,
  ShoppingBasket,
  ChefHat,
  Droplets,
  Gift,
  Package,
  HeartPulse,
  ArrowUpRight,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { getBannersForSlot } from "@/lib/promo-banners";
import { MOCK_DEALS } from "@/lib/mock-deals";

// ── Estilos shared ─────────────────────────────────────────────────────────
const TILE_BASE =
  "relative overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]";

// ── Bento 4 cajas iguales ──────────────────────────────────────────────────
const BENTO_ICONS: LucideIcon[] = [Truck, Sparkles, Wallet, Leaf];

function BentoTile({
  banner,
  Icon,
}: {
  banner: {
    id: string;
    title: string;
    subtitle?: string;
    ctaHref: string;
    bgFrom: string;
    bgTo: string;
  };
  Icon: LucideIcon;
}) {
  const bgIsLight = parseInt(banner.bgFrom.slice(1), 16) > 0xa0a0a0;
  const textCls = bgIsLight ? "text-[var(--text-primary)]" : "text-white";

  return (
    <Link
      href={banner.ctaHref}
      className={cn(
        "group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-[var(--rule-soft)] p-5",
        "transition-all hover:-translate-y-0.5 hover:shadow-lg",
        textCls,
      )}
      style={{
        background: `linear-gradient(135deg, ${banner.bgFrom}, ${banner.bgTo})`,
      }}
    >
      <div className="flex items-start justify-between">
        <Icon className="h-6 w-6 shrink-0 opacity-90" strokeWidth={1.75} aria-hidden />
        <ArrowUpRight
          className="h-4 w-4 opacity-60 transition-transform group-hover:rotate-12 group-hover:opacity-100"
          strokeWidth={2}
          aria-hidden
        />
      </div>
      <div>
        <h3 className="text-base sm:text-lg font-black tracking-[-0.02em] leading-[1.1]">
          {banner.title}
        </h3>
        {banner.subtitle && (
          <p className="mt-1 text-xs leading-snug opacity-85 line-clamp-2">
            {banner.subtitle}
          </p>
        )}
      </div>
    </Link>
  );
}

// ── 8 categorías icónicas ──────────────────────────────────────────────────
type QuickCat = { slug: string; label: string; Icon: LucideIcon };

const CATS: QuickCat[] = [
  { slug: "abarrotes", label: "Abarrotes", Icon: ShoppingBasket },
  { slug: "frutas-verduras", label: "Frutas", Icon: Leaf },
  { slug: "carnes", label: "Carnes", Icon: ChefHat },
  { slug: "lacteos", label: "Lácteos", Icon: Droplets },
  { slug: "bebidas", label: "Bebidas", Icon: Gift },
  { slug: "panaderia", label: "Panadería", Icon: Package },
  { slug: "limpieza-hogar", label: "Limpieza", Icon: Sparkles },
  { slug: "farmacia", label: "Farmacia", Icon: HeartPulse },
];

function CategoriasTile() {
  return (
    <div className={cn(TILE_BASE, "p-4 sm:p-5")}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
          Explora por categoría
        </h3>
        <Link
          href="/marketplace/explorar?view=grid"
          className="text-xs font-bold text-[var(--accent)] hover:underline"
        >
          Ver todas →
        </Link>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {CATS.map(({ slug, label, Icon }) => (
          <Link
            key={slug}
            href={`/marketplace/categoria/${slug}`}
            className="group flex flex-col items-center gap-2 rounded-xl p-2 transition-colors hover:bg-[var(--surface-sunken)]"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] group-hover:bg-[var(--accent-soft)] group-hover:text-[var(--accent)] transition-colors">
              <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </span>
            <span className="text-xs font-bold text-[var(--text-primary)] text-center">
              {label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Ofertas del día ────────────────────────────────────────────────────────
function useCountdownHMS() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const eod = (() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  })();
  const totalSec = Math.max(0, Math.floor((eod - now) / 1000));
  return {
    h: String(Math.floor(totalSec / 3600)).padStart(2, "0"),
    m: String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0"),
    s: String(totalSec % 60).padStart(2, "0"),
  };
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

function OfertasTile() {
  const { h, m, s } = useCountdownHMS();
  const deals = MOCK_DEALS.slice(0, 3);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-gradient-to-br from-[#fff1e6] via-[#ffe4cc] to-[#ffd4b3]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-black/5 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <Flame className="h-5 w-5 text-[#d9480f]" aria-hidden />
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d9480f]">
              Solo hoy
            </p>
            <h3 className="text-lg sm:text-xl font-black tracking-[-0.02em] text-[var(--text-primary)] leading-tight">
              Ofertas del día
            </h3>
          </div>
        </div>
        <div className="flex items-center gap-1 text-[var(--text-primary)] tabular-nums">
          <Clock className="h-3.5 w-3.5 opacity-60" aria-hidden />
          <span className="text-base sm:text-lg font-black">{h}</span>
          <span className="opacity-40">:</span>
          <span className="text-base sm:text-lg font-black">{m}</span>
          <span className="opacity-40">:</span>
          <span className="text-base sm:text-lg font-black">{s}</span>
        </div>
      </div>

      {/* Deals — 3 columnas iguales */}
      <div className="grid flex-1 grid-cols-3 gap-px bg-black/5">
        {deals.map((d) => (
          <Link
            key={d.id}
            href={`/marketplace/${d.storeSlug ?? "main"}`}
            className="group relative flex flex-col bg-[var(--surface-raised)] p-3 transition-colors hover:bg-white"
          >
            <span className="absolute top-2 right-2 inline-flex items-center rounded-full bg-[#d9480f] px-2 py-0.5 text-[10px] font-black tracking-wider text-white">
              -{d.discountPct}%
            </span>
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-[var(--surface-sunken)] mb-2">
              <Package className="h-8 w-8 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden />
            </div>
            <p className="text-xs font-bold text-[var(--text-primary)] leading-tight line-clamp-2 min-h-[2.25rem]">
              {d.name}
            </p>
            <p className="mt-auto pt-1 text-sm font-black tabular-nums text-[var(--text-primary)]">
              {fmt(d.price)}
            </p>
          </Link>
        ))}
      </div>

      {/* Footer CTA */}
      <Link
        href="/marketplace/ofertas"
        className="inline-flex items-center justify-center gap-1.5 bg-[var(--text-primary)] px-5 py-3 text-xs font-black uppercase tracking-wider text-[var(--surface-canvas)] hover:bg-[var(--accent)] transition-colors"
      >
        Ver todas las ofertas
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
      </Link>
    </div>
  );
}

// ── Fill banner — respeta h-full del padre sin aspect-ratio propio ────────
export function FillBanner({
  slot,
}: {
  slot: "explorar" | "explorar-mid" | "explorar-bottom";
}) {
  const banners = getBannersForSlot(slot);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (banners.length <= 1) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % banners.length), 8000);
    return () => clearInterval(id);
  }, [banners.length]);

  if (banners.length === 0) return null;
  const b = banners[idx];
  const bgIsLight = parseInt(b.bgFrom.slice(1), 16) > 0xa0a0a0;
  const textCls = bgIsLight ? "text-[var(--text-primary)]" : "text-white";

  return (
    <Link
      href={b.ctaHref}
      className={cn(
        "group relative flex h-full w-full flex-col justify-between overflow-hidden rounded-2xl border border-[var(--rule-soft)] p-6 sm:p-8",
        "transition-shadow hover:shadow-lg",
        textCls,
      )}
      style={
        b.imageUrl
          ? { backgroundImage: `url(${b.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
          : { background: `linear-gradient(135deg, ${b.bgFrom}, ${b.bgTo})` }
      }
    >
      <div className="relative z-10">
        <h2
          className={cn(
            "font-black tracking-[-0.025em] leading-[1.05]",
            slot === "explorar"
              ? "text-[clamp(1.5rem,4vw,3rem)]"
              : "text-xl sm:text-2xl lg:text-3xl",
          )}
        >
          {b.title}
        </h2>
        {b.subtitle && (
          <p className="mt-2 text-sm sm:text-base leading-snug opacity-85 max-w-xl">
            {b.subtitle}
          </p>
        )}
      </div>
      <div className="relative z-10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--text-primary)] px-4 py-2 text-xs font-black uppercase tracking-wider text-[var(--surface-canvas)] hover:bg-[var(--accent)] transition-colors">
          {b.ctaLabel}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
        </span>
      </div>
      {/* Dots si hay más de 1 banner */}
      {banners.length > 1 && (
        <div className="absolute bottom-3 right-3 flex gap-1 z-10">
          {banners.map((_, i) => (
            <span
              key={i}
              aria-hidden
              className={cn(
                "h-1 rounded-full transition-all",
                i === idx ? "w-4 bg-[var(--text-primary)]" : "w-1 bg-[var(--text-primary)]/30",
              )}
            />
          ))}
        </div>
      )}
    </Link>
  );
}

// ── Grid raíz ──────────────────────────────────────────────────────────────
export default function ExplorarTileGrid() {
  const bentoBanners = getBannersForSlot("bento").slice(0, 4);

  return (
    <section
      aria-label="Explorar — cajas destacadas"
      className="bg-[var(--surface-sunken)] border-b border-[var(--rule-soft)]"
    >
      <div className="mx-auto max-w-[1600px] space-y-4 px-3 sm:px-4 lg:px-6 py-4 sm:py-5">
        {/* ROW 1 · Banner principal — altura fija uniforme */}
        <div className="h-[220px] sm:h-[260px] lg:h-[300px]">
          <FillBanner slot="explorar" />
        </div>

        {/* ROW 2 · 4 bento cards iguales */}
        {bentoBanners.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {bentoBanners.slice(0, 4).map((b, i) => (
              <div key={b.id} className="h-[170px] sm:h-[180px]">
                <BentoTile banner={b} Icon={BENTO_ICONS[i] ?? Truck} />
              </div>
            ))}
          </div>
        )}

        {/* ROW 3 · Categorías (caja única) */}
        <CategoriasTile />

        {/* ROW 4 · Ofertas del día (2/3) + Side banner fill (1/3) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
          <div className="lg:col-span-2 h-[440px]">
            <OfertasTile />
          </div>
          <div className="lg:col-span-1 h-[440px]">
            <FillBanner slot="explorar-mid" />
          </div>
        </div>
      </div>
    </section>
  );
}
