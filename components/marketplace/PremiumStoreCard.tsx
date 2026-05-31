"use client";

/**
 * PremiumStoreCard — card de fila completa para tiendas con nivel "premium"
 * (beneficio superadmin). NO es la card estándar agrandada: es un layout
 * dedicado — identidad de la tienda a la izquierda + preview de productos
 * (con foto y precio) a la derecha/abajo, para que el cliente vea QUÉ vende.
 */

import Link from "next/link";
import Image from "next/image";
import { Star, ArrowRight, MapPin, Bike, ShieldCheck, Eye } from "@buleje/design-system/icons";

export interface PremiumProduct {
  productId: number;
  name: string;
  image: string;
  retailPrice: number;
  discountPrice?: number | null;
  /** Categoría del producto — para mostrar la variedad de la tienda. */
  category?: string;
}

interface Props {
  slug: string;
  name: string;
  logo: string | null;
  cover?: string | null;
  category?: string;
  zone?: string | null;
  rating?: number;
  reviewCount?: number;
  verified?: boolean;
  products: PremiumProduct[];
  /** Abre el drawer "Vista rápida" (peek + add sin salir de /tiendas). */
  onQuickView?: () => void;
}

function price(p: PremiumProduct) {
  const v = p.discountPrice ?? p.retailPrice;
  return `S/ ${v.toFixed(2)}`;
}

function Stars({ rating = 0, reviewCount = 0 }: { rating?: number; reviewCount?: number }) {
  if (!rating) return null;
  const full = Math.floor(rating);
  const partial = rating % 1 >= 0.5 ? 1 : 0;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating.toFixed(1)} de 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i < full ? "fill-[var(--accent)] text-[var(--accent)]" : i === full && partial ? "fill-[var(--accent)]/50 text-[var(--accent)]/50" : "fill-none text-[var(--rule-base)]"}`}
          strokeWidth={1.5}
          aria-hidden
        />
      ))}
      {reviewCount > 0 && (
        <span className="ml-0.5 text-[11px] font-bold text-[var(--text-tertiary)] tabular-nums">({reviewCount})</span>
      )}
    </span>
  );
}

export default function PremiumStoreCard({
  slug,
  name,
  logo,
  category,
  zone,
  rating,
  reviewCount,
  verified,
  products,
  onQuickView,
}: Props) {
  const shown = products.slice(0, 6);
  return (
    <div
      className="group relative flex flex-col gap-4 overflow-hidden rounded-3xl border-2 border-[var(--accent)]/40 bg-[var(--surface-raised)] p-4 sm:p-5 transition-all hover:border-[var(--accent)] hover:shadow-xl sm:flex-row sm:items-stretch"
      style={{ background: "linear-gradient(120deg, var(--accent-soft) 0%, var(--surface-raised) 45%)" }}
    >
      {/* Badge Premium — top-left para no chocar con "Vista rápida" (top-right) */}
      <span className="absolute left-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-md">
        <Star className="h-3 w-3 fill-current" aria-hidden /> Premium
      </span>

      {/* Vista rápida — drawer de productos + add SIN salir de /tiendas.
          z-20 sobre el stretched-link "Ver tienda" que cubre la card. */}
      {onQuickView && (
        <button
          type="button"
          onClick={onQuickView}
          aria-label={`Vista rápida de ${name}`}
          className="absolute right-3 top-3 z-20 inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--surface-canvas)]/95 px-3 text-xs font-extrabold text-[var(--accent)] shadow-md ring-1 ring-[var(--accent)]/30 backdrop-blur-sm transition-all hover:bg-[var(--accent)] hover:text-white active:scale-95"
        >
          <Eye className="h-4 w-4" strokeWidth={2.25} aria-hidden /> Vista rápida
        </button>
      )}

      {/* ── Identidad ── */}
      <div className="flex gap-3 sm:w-[300px] sm:shrink-0 sm:flex-col sm:gap-3 sm:border-r sm:border-[var(--rule-soft)] sm:pr-5">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] shadow-sm sm:h-20 sm:w-20">
          {logo ? (
            <Image src={logo} alt="" fill sizes="80px" className="object-cover" priority />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark,var(--accent))] text-2xl font-black text-white">
              {name.trim().charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-base font-extrabold leading-tight tracking-tight text-[var(--text-primary)] line-clamp-2 group-hover:text-[var(--accent)] transition-colors sm:text-lg">
            {name}
            {verified && (
              <ShieldCheck
                className="h-4 w-4 shrink-0 text-[var(--data-info-500,#0ea5e9)]"
                strokeWidth={2.5}
                aria-label="Verificada"
              />
            )}
          </p>
          <div className="mt-1">
            <Stars rating={rating} reviewCount={reviewCount} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {category && (
              <span className="inline-flex items-center rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">
                {category}
              </span>
            )}
            {zone && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                <MapPin className="h-2.5 w-2.5" strokeWidth={2} aria-hidden /> {zone}
              </span>
            )}
            <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
              <Bike className="h-2.5 w-2.5" strokeWidth={2} aria-hidden /> Delivery
            </span>
          </div>
          <Link
            href={`/marketplace/${slug}`}
            aria-label={`${name} — tienda destacada premium`}
            className="mt-3 hidden items-center gap-1.5 text-sm font-extrabold text-[var(--accent)] group-hover:gap-2.5 transition-all sm:inline-flex after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            Ver tienda <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          </Link>
        </div>
      </div>

      {/* ── Preview de productos ── */}
      <div className="min-w-0 flex-1">
        <p className="mb-2 text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          Variedad de la tienda · 1 por categoría
        </p>
        {shown.length > 0 ? (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {shown.map((p) => (
              <li
                key={p.productId}
                className="overflow-hidden rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)]"
              >
                <div className="relative aspect-square w-full bg-[var(--surface-sunken)]">
                  {p.image ? (
                    <Image src={p.image} alt="" fill sizes="(min-width:640px) 110px, 30vw" className="object-cover" />
                  ) : null}
                  {p.category && (
                    <span className="absolute left-1 top-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
                      {p.category}
                    </span>
                  )}
                </div>
                <div className="p-1.5">
                  <p className="truncate text-[11px] font-semibold text-[var(--text-secondary)]">{p.name}</p>
                  <p className="text-xs font-extrabold text-[var(--accent)]">{price(p)}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex h-full min-h-[96px] items-center justify-center rounded-xl border border-dashed border-[var(--rule-base)] text-xs text-[var(--text-tertiary)]">
            Entrá para ver el catálogo completo
          </div>
        )}
        <Link
          href={`/marketplace/${slug}`}
          aria-label={`${name} — tienda destacada premium`}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--accent)] group-hover:gap-2.5 transition-all sm:hidden after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          Ver tienda <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
