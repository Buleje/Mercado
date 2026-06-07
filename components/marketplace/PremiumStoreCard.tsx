"use client";

/**
 * PremiumStoreCard — card de fila completa para tiendas con nivel "premium"
 * (beneficio superadmin). NO es la card estándar agrandada: es un layout
 * dedicado — identidad de la tienda a la izquierda + preview de productos
 * (con foto y precio) a la derecha/abajo, para que el cliente vea QUÉ vende.
 */

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { ArrowRight, MapPin, Bike, ShieldCheck, Eye, Award, Moon, Star } from "@buleje/design-system/icons";
import ShareStoreButton from "./ShareStoreButton";
import {
  haversineKm,
  ZONE_COORDS,
  type MarketplaceStore,
} from "@/components/marketplace/useMarketplaceGeo";

const StoreDistanceMapModal = dynamic(
  () => import("@/components/marketplace/StoreDistanceMapModal"),
  { ssr: false },
);

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
  /** Estado de apertura — server-computed desde businessHours (getStoreOpenStatus). */
  isOpenNow?: boolean;
  /** Etiqueta de próxima apertura ya formateada ("Abre mañana 8:00 AM"). */
  nextOpeningLabel?: string | null;
  products: PremiumProduct[];
  /** Abre el drawer "Vista rápida" (peek + add sin salir de /tiendas). */
  onQuickView?: () => void;
  /** Coords de la tienda + del cliente — para distancia + mapa. */
  lat?: number | null;
  lng?: number | null;
  userCoords?: { lat: number; lng: number } | null;
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
  isOpenNow,
  nextOpeningLabel,
  products,
  onQuickView,
  lat,
  lng,
  userCoords,
}: Props) {
  const shown = products.slice(0, 6);
  const isClosed = isOpenNow === false;
  const [mapOpen, setMapOpen] = useState(false);

  // Distancia tienda <-> cliente (coords reales o centroide de zona).
  let storeCoords: [number, number] | null = null;
  if (typeof lat === "number" && typeof lng === "number") {
    storeCoords = [lat, lng];
  } else {
    const zk = zone?.toLowerCase().replace(/ /g, "_") ?? "";
    storeCoords = ZONE_COORDS[zk] ?? null;
  }
  const distanceKm =
    userCoords && storeCoords
      ? haversineKm(userCoords.lat, userCoords.lng, storeCoords[0], storeCoords[1])
      : null;

  const mapStore: MarketplaceStore = {
    id: slug,
    slug,
    name,
    logo: logo ?? null,
    category: category ?? "",
    zone: zone ?? null,
    rating: rating ?? 0,
    reviewCount: reviewCount ?? 0,
    description: null,
    lat: lat ?? null,
    lng: lng ?? null,
  };
  // Brandon 2026-06-07: card cuadrada en mobile (max-md-) — rediseño ejecutivo
  // "todo recto". En desktop conserva rounded-2xl. El hover-shadow no aplica en
  // touch, así que no se ve en celular.
  return (
    <div className="group relative overflow-hidden rounded-2xl max-md:rounded-none border border-[var(--rule-base)] bg-[var(--surface-raised)] transition-all duration-200 ease-out hover:border-[var(--text-primary)]/40 hover:scale-[1.006] hover:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.35)]">
      {/* Banner "Cerrada ahora" — barra full-width arriba del card. No tapa
          ningún elemento (empuja el contenido) y avisa la próxima apertura.
          Brandon 2026-05-31. */}
      {isClosed && (
        <div
          role="status"
          className="flex items-center gap-2 bg-[var(--text-primary)] px-4 py-1.5 text-[length:var(--ts-xs)] text-[var(--surface-canvas)]"
        >
          <Moon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
          <span className="font-extrabold uppercase tracking-wide">Cerrada ahora</span>
          {nextOpeningLabel && (
            <span className="truncate font-semibold opacity-80">· {nextOpeningLabel}</span>
          )}
        </div>
      )}

      <div className="relative flex flex-col gap-4 p-4 sm:p-5 sm:flex-row sm:items-stretch">
        {/* Vista rápida — drawer de productos + add SIN salir de /tiendas.
            z-20 sobre el stretched-link "Ver tienda" que cubre la card. */}
        {onQuickView && (
          <button
            type="button"
            onClick={onQuickView}
            aria-label={`Vista rápida de ${name}`}
            title="Vista rápida"
            className="absolute right-3 top-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-canvas)]/95 text-[var(--text-primary)] ring-1 ring-[var(--rule-base)] backdrop-blur-sm transition-all hover:bg-[var(--text-primary)] hover:text-[var(--surface-raised)] active:scale-95"
          >
            <Eye className="h-5 w-5" strokeWidth={2.25} aria-hidden />
          </button>
        )}

        {/* Compartir tienda por WhatsApp — cada cliente trae 2-3 vecinos
            (Brandon 2026-06-02). z-20 sobre el stretched-link "Ver tienda";
            a la izquierda del botón de vista rápida si existe. */}
        <ShareStoreButton
          slug={slug}
          name={name}
          className={`absolute top-3 z-20 ${onQuickView ? "right-[3.75rem]" : "right-3"}`}
        />

        {/* ── Identidad ── */}
        <div className="flex gap-3 sm:w-[300px] sm:shrink-0 sm:flex-col sm:gap-3 sm:border-r sm:border-[var(--rule-soft)] sm:pr-5">
          {/* Logo con anillo premium + badge de nivel icon-only en la esquina.
              Wrapper relativo SIN overflow → el badge sobresale en la esquina
              superior-derecha del logo (no sobre el nombre ni los productos) →
              señala "premium" sin tapar contenido. Brandon 2026-05-31. */}
          <div className="relative shrink-0">
            <div
              className={`h-16 w-16 overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] sm:h-20 sm:w-20 ${isClosed ? "grayscale opacity-80" : ""}`}
            >
              {logo ? (
                <Image src={logo} alt={`Logo de ${name}`} width={80} height={80} sizes="80px" className="h-full w-full object-cover" priority />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark,var(--accent))] text-2xl font-black text-white">
                  {name.trim().charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            {/* Badge Premium — icon-only, esquina superior-derecha del logo. */}
            <span
              className="absolute -right-1.5 -top-1.5 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--text-primary)] text-[var(--surface-raised)] ring-2 ring-[var(--surface-raised)]"
              title="Tienda premium"
              aria-label="Tienda premium"
            >
              <Award className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            </span>
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
                <span
                  className="inline-flex items-center justify-center rounded-full bg-[var(--surface-sunken)] p-1 text-[var(--text-secondary)]"
                  title={zone}
                  aria-label={zone}
                >
                  <MapPin className="h-3 w-3" strokeWidth={2} aria-hidden />
                </span>
              )}
              <span
                className="inline-flex items-center justify-center rounded-full bg-[var(--surface-sunken)] p-1 text-[var(--text-secondary)]"
                title="Delivery"
                aria-label="Delivery"
              >
                <Bike className="h-3 w-3" strokeWidth={2} aria-hidden />
              </span>
              {/* Distancia + ver en mapa — z-20 sobre el stretched-link "Ver tienda". */}
              {distanceKm != null && userCoords && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMapOpen(true);
                  }}
                  aria-label={`Ver ubicación de ${name} en el mapa — a ${distanceKm.toFixed(1)} km de ti`}
                  className="relative z-20 inline-flex items-center gap-1 rounded-full border border-[var(--accent)]/40 bg-[var(--surface-canvas)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--accent)] transition-colors hover:bg-[var(--accent-soft)] active:scale-95"
                >
                  <MapPin className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                  <span className="tabular-nums">{distanceKm.toFixed(1)} km</span>
                </button>
              )}
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

        {/* ── Preview de productos ── (atenuado cuando está cerrada) */}
        <div className={`min-w-0 flex-1 ${isClosed ? "opacity-70" : ""}`}>
          {shown.length > 0 ? (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {shown.map((p, i) => (
                <li
                  key={p.productId}
                  className={`overflow-hidden rounded-xl max-md:rounded-none border border-[var(--rule-soft)] bg-[var(--surface-canvas)]${i >= 3 ? " hidden sm:block" : ""}`}
                >
                  <div className="relative aspect-square w-full bg-[var(--surface-sunken)]">
                    {p.image ? (
                      <Image src={p.image} alt={`${p.name} — ${name}`} fill sizes="(min-width:640px) 110px, 30vw" className="object-cover" />
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
            <div className="flex h-full min-h-[96px] items-center justify-center rounded-xl max-md:rounded-none border border-dashed border-[var(--rule-base)] text-xs text-[var(--text-tertiary)]">
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

      {mapOpen && userCoords && (
        <StoreDistanceMapModal
          open={mapOpen}
          onClose={() => setMapOpen(false)}
          store={mapStore}
          userCoords={userCoords}
        />
      )}
    </div>
  );
}
