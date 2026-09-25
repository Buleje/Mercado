"use client";

/**
 * StoreQuickPreviewDrawer — Drawer "Vista rápida" de una tienda premium.
 *
 * Rediseño 2026-06-06 (Brandon): más elaborado y ejecutivo.
 *   - Header con banner + logo en ring, badge "Destacada", rating ámbar y
 *     meta-strip (rating · categoría · zona · distancia opcional).
 *   - Segmented control (Destacados / Top productos) con pill activo.
 *   - Cards de producto más grandes (text-sm mínimo), descuento visible,
 *     add-to-cart con flash de confirmación.
 *   - Tokens del DS (var(--accent)), sin colores hardcodeados.
 *
 * Animación: slide-in desde la derecha 340ms + backdrop fade. Cierre: ESC,
 * click fuera, botón.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { m as motion, AnimatePresence } from "framer-motion";
import { precioVigente } from "@/lib/marketplace/precio-vigente";
import {
  Star,
  MapPin,
  X,
  Check,
  ArrowRight,
  Plus,
  Sparkles,
  TrendingUp,
  ShieldCheck,
} from "@buleje/design-system/icons";
import { useCart } from "@/contexts/cart-context";
import { cn } from "@/lib/utils";
import { formatCategoryLabel } from "@/lib/format-category";
import type { FeaturedNearbyStore, FeaturedNearbyProduct } from "@/lib/db/marketplace-featured.db";

interface Props {
  store: FeaturedNearbyStore | null;
  open: boolean;
  onClose: () => void;
  /**
   * Override del "agregar". En el storefront (default) agrega al carrito del
   * tenant vía useCart. En el MARKETPLACE (/tiendas) ese carrito NO es el que
   * usa el checkout (es cross-store), así que el caller pasa un handler que
   * NAVEGA al producto para agregar bien allá.
   */
  onAddToCart?: (p: FeaturedNearbyProduct) => void;
}

type DrawerTab = "destacados" | "top";

const fmtPEN = (n: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(n);

export default function StoreQuickPreviewDrawer({ store, open, onClose, onAddToCart }: Props) {
  const { addItem } = useCart();
  const drawerRef = useRef<HTMLDivElement>(null);
  const [addedFlash, setAddedFlash] = useState<string | null>(null);
  const [tab, setTab] = useState<DrawerTab>("destacados");

  // ESC para cerrar
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll mientras está abierto
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Reset de tab al cambio de tienda — vía microtask (no setState en effect body).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setTab("destacados");
    });
    return () => {
      cancelled = true;
    };
  }, [open, store?.id]);

  const featured = useMemo(() => store?.productosDestacados ?? [], [store]);

  /**
   * "Top productos": prioriza descuentos vigentes, luego precio efectivo desc.
   * Proxy razonable hasta tener signal real de ventas.
   */
  const top = useMemo<FeaturedNearbyProduct[]>(() => {
    return [...featured].sort((a, b) => {
      // Precio y oferta salen de la regla única: una rebaja vencida no
      // prioriza ni baja el precio efectivo del orden.
      const va = precioVigente(a);
      const vb = precioVigente(b);
      if (va.enOferta !== vb.enOferta) return va.enOferta ? -1 : 1;
      return vb.precio - va.precio;
    });
  }, [featured]);

  if (!store) return null;

  const handleAdd = (p: FeaturedNearbyProduct) => {
    if (onAddToCart) {
      onAddToCart(p);
      return;
    }
    const price = precioVigente(p).precio;
    addItem({
      id: p.productId,
      name: p.name,
      price,
      image: p.image,
      category: store.category,
      unit: "unidad",
      stock: 99,
    });
    setAddedFlash(p.id);
    setTimeout(() => setAddedFlash(null), 1200);
  };

  const showDistance = Number(store.distanceKm) > 0;
  const initial = store.name.trim().charAt(0).toUpperCase();

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-[3px]"
            aria-hidden
          />

          {/* Panel */}
          <motion.aside
            key="panel"
            ref={drawerRef}
            role="dialog"
            aria-label={`Vista rápida de ${store.name}`}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", ease: [0.22, 1, 0.36, 1], duration: 0.34 }}
            className="fixed right-0 top-0 z-[81] h-full w-[94vw] max-w-[420px] bg-[var(--surface-canvas)] text-[var(--text-primary)] shadow-2xl flex flex-col"
          >
            {/* ── Header con banner ─────────────────────────── */}
            <div className="relative h-32 shrink-0 overflow-hidden bg-[var(--surface-sunken)]">
              {store.banner ? (
                <Image
                  src={store.banner}
                  alt=""
                  fill
                  sizes="420px"
                  className="object-cover"
                  priority
                />
              ) : (
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--accent), color-mix(in oklch, var(--accent) 60%, #051418))",
                  }}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />

              {/* Badge Destacada */}
              <span className="absolute left-3.5 top-3.5 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[length:var(--ts-2xs)] font-black uppercase tracking-[var(--ls-wider)] text-[var(--accent)] shadow-sm backdrop-blur">
                <Sparkles className="h-3 w-3" strokeWidth={2.75} aria-hidden />
                Destacada
              </span>

              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75 transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>

              {/* Identidad */}
              <div className="absolute bottom-3 left-3.5 right-3.5 flex items-end gap-2.5 text-white">
                <div className="relative h-14 w-14 shrink-0 rounded-2xl overflow-hidden bg-white ring-2 ring-white/70 shadow-lg grid place-items-center">
                  {store.logo ? (
                    <Image src={store.logo} alt="" fill sizes="56px" className="object-cover" />
                  ) : (
                    <span
                      className="grid h-full w-full place-items-center text-xl font-black text-white"
                      style={{
                        background:
                          "linear-gradient(135deg, var(--accent), color-mix(in oklch, var(--accent) 65%, #051418))",
                      }}
                    >
                      {initial}
                    </span>
                  )}
                </div>
                <div className="min-w-0 pb-0.5">
                  <h2 className="text-lg font-black leading-tight tracking-tight truncate drop-shadow-sm">
                    {store.name}
                  </h2>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-white/90">
                    {store.reviewCount > 0 ? (
                      <span className="inline-flex items-center gap-1 font-bold">
                        <Star
                          className="h-3.5 w-3.5 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]"
                          strokeWidth={0}
                          aria-hidden
                        />
                        {Number(store.rating).toFixed(1)}
                        <span className="font-medium text-white/65">({store.reviewCount})</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-bold">
                        <Sparkles
                          className="h-3.5 w-3.5 text-[var(--data-warning-500)]"
                          strokeWidth={2.25}
                          aria-hidden
                        />
                        Nueva
                      </span>
                    )}
                    <span aria-hidden className="text-white/45">
                      ·
                    </span>
                    <ShieldCheck
                      className="h-3.5 w-3.5 text-white/85"
                      strokeWidth={2}
                      aria-hidden
                    />
                    <span className="font-medium">Verificada</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Meta strip ────────────────────────────────── */}
            <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {store.category && (
                <span className="inline-flex shrink-0 items-center rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)]">
                  {formatCategoryLabel(store.category)}
                </span>
              )}
              {store.zone && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)]">
                  <MapPin className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                  {store.zone}
                </span>
              )}
              {showDistance && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-xs font-bold tabular-nums text-[var(--text-secondary)]">
                  {Number(store.distanceKm).toFixed(1)} km
                </span>
              )}
            </div>

            {/* ── Segmented control ─────────────────────────── */}
            <div
              role="tablist"
              aria-label="Vistas de productos"
              className="flex shrink-0 gap-1 border-b border-[var(--rule-base)] bg-[var(--surface-raised)] p-2"
            >
              <TabButton
                active={tab === "destacados"}
                onClick={() => setTab("destacados")}
                icon={<Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />}
                label="Destacados"
              />
              <TabButton
                active={tab === "top"}
                onClick={() => setTab("top")}
                icon={<TrendingUp className="h-3.5 w-3.5" strokeWidth={2.5} />}
                label="Top productos"
              />
            </div>

            {/* ── Body ─────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto bg-[var(--surface-canvas)]">
              {featured.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
                    <Sparkles className="h-6 w-6" aria-hidden />
                  </span>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Esta tienda aún no tiene productos cargados.
                  </p>
                </div>
              ) : tab === "destacados" ? (
                <ListView products={featured} onAdd={handleAdd} addedFlash={addedFlash} />
              ) : (
                <GridView products={top} storeSlug={store.slug} />
              )}
            </div>

            {/* ── Footer CTA ──────────────────────────────── */}
            <div className="shrink-0 border-t border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
              {featured.length > 0 && (
                <p className="mb-2 text-center text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  {featured.length}{" "}
                  {featured.length === 1 ? "producto destacado" : "productos destacados"}
                </p>
              )}
              <Link
                href={`/marketplace/${store.slug}`}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-sm font-extrabold uppercase tracking-[var(--ls-wider)] text-white transition-all hover:brightness-110 active:scale-[0.99]"
              >
                Ver toda la tienda
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              </Link>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────
// Segmented control button
// ─────────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "relative flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] transition-colors",
        active ? "text-white" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
      )}
    >
      {active && (
        <motion.span
          layoutId="drawer-tab-pill"
          className="absolute inset-0 rounded-lg bg-[var(--accent)]"
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      )}
      <span className="relative z-10 inline-flex items-center gap-1.5">
        {icon}
        {label}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────
// Vista 1 — Lista compacta con add-to-cart (Destacados)
// ─────────────────────────────────────────────────────────────────

function ListView({
  products,
  onAdd,
  addedFlash,
}: {
  products: FeaturedNearbyProduct[];
  onAdd: (p: FeaturedNearbyProduct) => void;
  addedFlash: string | null;
}) {
  return (
    <ul className="space-y-2 px-3 py-3">
      {products.map((p) => {
        const { precio: price, enOferta: hasDiscount } = precioVigente(p);
        const flashing = addedFlash === p.id;
        return (
          <li
            key={p.id}
            className="flex items-center gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2.5 transition-colors hover:border-[var(--accent)]/40"
          >
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[var(--surface-sunken)]">
              {p.image ? (
                <Image src={p.image} alt="" fill sizes="56px" className="object-cover" />
              ) : (
                <div className="h-full w-full" />
              )}
              {p.discountLabel && (
                <span className="absolute left-0.5 top-0.5 rounded bg-[var(--data-error-500)] px-1 py-0.5 text-[8.5px] font-extrabold uppercase tracking-tight text-white">
                  {p.discountLabel}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-sm font-bold leading-tight text-[var(--text-primary)]">
                {p.name}
              </p>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-base font-extrabold text-[var(--accent)]">
                  {fmtPEN(price)}
                </span>
                {hasDiscount && (
                  <span className="text-xs text-[var(--text-tertiary)] line-through">
                    {fmtPEN(p.retailPrice)}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => onAdd(p)}
              aria-label={`Agregar ${p.name}`}
              className={cn(
                "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all active:scale-95",
                flashing
                  ? "bg-[var(--data-success-500)] text-white"
                  : "bg-[var(--accent)] text-white hover:brightness-110",
              )}
            >
              {flashing ? (
                <Check className="h-4 w-4" strokeWidth={3} />
              ) : (
                <Plus className="h-4 w-4" strokeWidth={2.5} />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────
// Vista 2 — Grid visual (Top productos)
// ─────────────────────────────────────────────────────────────────

function GridView({
  products,
  storeSlug,
}: {
  products: FeaturedNearbyProduct[];
  storeSlug: string;
}) {
  return (
    <ul className="grid grid-cols-2 gap-2.5 px-3 py-3">
      {products.map((p, i) => {
        const { precio: price, enOferta: hasDiscount } = precioVigente(p);
        return (
          <li key={p.id} className="group">
            <Link
              href={`/marketplace/${storeSlug}/producto/${p.productId}`}
              className="block overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] transition-all hover:border-[var(--accent)]/50 hover:shadow-md"
            >
              <div className="relative aspect-square overflow-hidden bg-[var(--surface-sunken)]">
                {p.image ? (
                  <Image
                    src={p.image}
                    alt=""
                    fill
                    sizes="200px"
                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                ) : (
                  <div
                    className="absolute inset-0"
                    style={{
                      background: "linear-gradient(135deg, var(--accent-soft), transparent)",
                    }}
                  />
                )}
                <span className="absolute left-1.5 top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-black/70 px-1 text-[10px] font-extrabold text-white">
                  #{i + 1}
                </span>
                {p.discountLabel && (
                  <span className="absolute right-1.5 top-1.5 rounded bg-[var(--data-error-500)] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-tight text-white">
                    {p.discountLabel}
                  </span>
                )}
              </div>
              <div className="p-2.5">
                <p className="line-clamp-2 min-h-[2lh] text-[13px] font-bold leading-tight text-[var(--text-primary)]">
                  {p.name}
                </p>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-sm font-extrabold text-[var(--accent)]">
                    {fmtPEN(price)}
                  </span>
                  {hasDiscount && (
                    <span className="text-[10px] text-[var(--text-tertiary)] line-through">
                      {fmtPEN(p.retailPrice)}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
