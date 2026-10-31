"use client";

/**
 * StoreCard — Card de bodega/tienda para grilla de marketplace.
 *
 * Muestra:
 *   - Logo + nombre
 *   - Distancia (km) + tiempo delivery estimado
 *   - Rating + reseñas
 *   - Categorias principales (chips)
 *   - Estado (abierto / cerrando / cerrado)
 *   - Badge "Patrocinada", "Nueva", "Favorita"
 *
 * Variantes:
 *   - "grid" (default): vertical card con hero
 *   - "list": horizontal row compacto
 */

import Link from "next/link";
import Image from "next/image";
import { Clock, MapPin, Store, Heart } from "@buleje/design-system/icons";
import RatingStars from "./RatingStars";
import { cn } from "@/lib/utils";

export interface StoreCardData {
  slug: string;
  name: string;
  logo?: string;
  heroImage?: string;
  rating: number;
  reviewCount: number;
  distanceKm?: number;
  deliveryMinutes?: number;
  categories?: string[];
  status: "open" | "closing_soon" | "closed";
  badge?: string;
  isFavorite?: boolean;
  // ── MK-56: Trust badges (todos opcionales — el card se adapta) ──────────────
  verified?: boolean;        // bodega verificada por admin
  topSeller?: boolean;       // top vendedor del mes
  isNew?: boolean;           // nuevo (creado en últimos 30 días)
  fastDelivery?: boolean;    // delivery promedio <30 min
  // ── MK-58: Social proof timestamp (opcional) ────────────────────────────────
  lastSaleAgoMinutes?: number;
  // ── TS-33: badge de ofertas activas en card ─────────────────────────────────
  activePromos?: number;
}

// ── MK-56 + TS-33: helper para trust badges + ofertas activas ─────────────────
function TrustBadges({ store }: { store: StoreCardData }) {
  const items: Array<{ label: string; cls: string }> = [];
  if (store.verified)     items.push({ label: "Verificada",   cls: "bg-blue-50 text-blue-700 border-blue-200" });
  if (store.topSeller)    items.push({ label: "Top del mes",  cls: "bg-[var(--data-warning-50)] text-[var(--data-warning-500)] border-[var(--data-warning-500)]/30" });
  if (store.isNew)        items.push({ label: "Nuevo",        cls: "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] border-[var(--accent)]/30" });
  if (store.fastDelivery) items.push({ label: "<30 min",      cls: "bg-purple-50 text-[var(--accent)] border-purple-200" });
  // TS-33: ofertas activas — color rojo para llamar atención
  if (store.activePromos && store.activePromos > 0) {
    items.push({
      label: `${store.activePromos} ${store.activePromos === 1 ? "oferta" : "ofertas"}`,
      cls: "bg-rose-50 text-[var(--data-error-500)] border-rose-200 dark:bg-rose-950/30 dark:text-[var(--data-error-500)] dark:border-rose-800",
    });
  }
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((b) => (
        <span
          key={b.label}
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide border",
            b.cls,
          )}
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}

// ── MK-58: "Comprado hace X min" — anonimizado, social proof ──────────────────
function LastSaleHint({ minutes }: { minutes?: number }) {
  if (minutes == null || minutes < 0) return null;
  const text =
    minutes < 1   ? "Comprado hace segundos" :
    minutes === 1 ? "Comprado hace 1 min" :
    minutes < 60  ? `Comprado hace ${minutes} min` :
    minutes < 120 ? "Comprado hace 1h" :
    minutes < 1440 ? `Comprado hace ${Math.round(minutes / 60)}h` :
    null;
  if (!text) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--data-success-500)]">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--data-success-500)] animate-pulse" />
      {text}
    </span>
  );
}

interface Props {
  store: StoreCardData;
  variant?: "grid" | "list";
  onToggleFavorite?: (slug: string) => void;
  className?: string;
}

const STATUS_CFG = {
  open: { label: "Abierto", color: "text-[var(--accent)]", dot: "bg-[var(--accent)]" },
  closing_soon: { label: "Cierra pronto", color: "text-[var(--data-warning,_#eab308)]", dot: "bg-[var(--data-warning,_#eab308)]" },
  closed: { label: "Cerrado", color: "text-[var(--text-tertiary)]", dot: "bg-[var(--text-tertiary)]" },
} as const;

export default function StoreCard({ store, variant = "grid", onToggleFavorite, className }: Props) {
  const cfg = STATUS_CFG[store.status];
  const isClosed = store.status === "closed";

  if (variant === "list") {
    return (
      <Link
        href={`/tiendas/${store.slug}`}
        className={cn(
          "flex items-center gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3",
          "hover:border-[var(--accent)] transition-colors",
          isClosed && "opacity-75",
          className,
        )}
      >
        {/* Logo */}
        <div className="shrink-0 h-14 w-14 rounded-xl bg-[var(--surface-sunken)] overflow-hidden border border-[var(--rule-base)]">
          {store.logo ? (
            <Image src={store.logo} alt={store.name} width={56} height={56} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--text-tertiary)]">
              <Store className="h-5 w-5" strokeWidth={1.5} aria-hidden />
            </div>
          )}
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 title={store.name} className="text-sm font-bold text-[var(--text-primary)] truncate">{store.name}</h3>
            {store.badge && (
              <span className="shrink-0 rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] px-2 py-0.5 text-xs font-bold uppercase tracking-wide">
                {store.badge}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <RatingStars value={store.rating} count={store.reviewCount} size="xs" />
            <span aria-hidden className="text-[var(--text-tertiary)]">·</span>
            <span className={cn("text-xs font-bold flex items-center gap-1", cfg.color)}>
              <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
              {cfg.label}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
            {store.distanceKm !== undefined && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" strokeWidth={2} aria-hidden />
                {Number(store.distanceKm).toFixed(1)} km
              </span>
            )}
            {store.deliveryMinutes && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" strokeWidth={2} aria-hidden />
                {store.deliveryMinutes} min
              </span>
            )}
            <LastSaleHint minutes={store.lastSaleAgoMinutes} />
          </div>
          {/* MK-56: trust badges */}
          <div className="mt-1.5">
            <TrustBadges store={store} />
          </div>
        </div>
      </Link>
    );
  }

  // Grid variant (default)
  return (
    <div
      className={cn(
        "group relative rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden",
        "hover:border-[var(--accent)] hover:shadow-md transition-all",
        isClosed && "opacity-75",
        className,
      )}
    >
      <Link href={`/tiendas/${store.slug}`} className="block">
        {/* Hero */}
        <div className="relative aspect-[16/10] bg-[var(--surface-sunken)] overflow-hidden">
          {store.heroImage ? (
            <Image
              src={store.heroImage}
              alt=""
              fill
              sizes="(max-width: 640px) 50vw, 320px"
              className="object-cover motion-safe:transition-transform motion-safe:duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[var(--text-tertiary)]">
              <Store className="h-8 w-8" strokeWidth={1} aria-hidden />
            </div>
          )}
          {/* Badge */}
          {store.badge && (
            <span className="absolute top-2 left-2 rounded-full bg-[var(--surface-canvas)] text-[var(--text-primary)] px-2.5 py-1 text-xs font-bold uppercase tracking-wide shadow-sm">
              {store.badge}
            </span>
          )}
          {/* Status chip */}
          <span
            className={cn(
              "absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-[var(--surface-canvas)] px-2 py-0.5 text-xs font-bold",
              cfg.color,
            )}
          >
            <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
            {cfg.label}
          </span>
          {/* Delivery time chip */}
          {store.deliveryMinutes && (
            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-2 py-0.5 text-xs font-bold">
              <Clock className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
              {store.deliveryMinutes} min
            </span>
          )}
        </div>
      </Link>

      {/* Info */}
      <div className="p-3">
        <div className="flex items-start gap-2">
          <Link href={`/tiendas/${store.slug}`} className="flex-1 min-w-0">
            <h3 title={store.name} className="text-sm font-extrabold text-[var(--text-primary)] truncate">{store.name}</h3>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              {/* MK-57: rating prominente con count */}
              <RatingStars value={store.rating} count={store.reviewCount} size="xs" />
              <LastSaleHint minutes={store.lastSaleAgoMinutes} />
            </div>
            {/* MK-56: trust badges */}
            <div className="mt-1.5">
              <TrustBadges store={store} />
            </div>
          </Link>
          {onToggleFavorite && (
            <button
              type="button"
              onClick={() => onToggleFavorite(store.slug)}
              aria-label={store.isFavorite ? "Quitar de favoritos" : "Guardar favorita"}
              className="shrink-0 h-8 w-8 rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] inline-flex items-center justify-center transition-colors"
            >
              <Heart
                className={cn(
                  "h-4 w-4",
                  store.isFavorite ? "fill-[var(--data-error,_#e11d48)] text-[var(--data-error,_#e11d48)]" : "",
                )}
                strokeWidth={2}
                aria-hidden
              />
            </button>
          )}
        </div>
        {/* Chips */}
        {(store.categories?.length ?? 0) > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {store.categories?.slice(0, 3).map((c) => (
              <span
                key={c}
                className="inline-block rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)]"
              >
                {c}
              </span>
            ))}
          </div>
        )}
        {/* Meta */}
        <div className="mt-2 flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
          {store.distanceKm !== undefined && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" strokeWidth={2} aria-hidden />
              {Number(store.distanceKm).toFixed(1)} km
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
