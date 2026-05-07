"use client";

/**
 * StoreQuickPreviewDrawer — Drawer lateral que aparece al hacer hover sobre
 * una card en FeaturedStoresNearby. Muestra los productos destacados de la
 * tienda con dos vistas seleccionables:
 *   - "Destacados": lista compacta con add-to-cart (default).
 *   - "Top productos": grid visual con foco en la imagen (price + label).
 *
 * Animación: slide-in desde la derecha 340ms cubic-bezier + backdrop fade.
 * Cierre: ESC, click fuera, mouseleave con grace de 250ms (para que el
 * usuario pueda mover el mouse hacia el drawer sin que se cierre).
 *
 * Ancho: w-[380px] — más estrecho que el `max-w-md` original (Brandon
 * mayo 2026: "estaba muy ancho"). Cabe sobre cualquier viewport ≥414 px
 * sin tapar el contenido del listado de tiendas.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star,
  MapPin,
  X,
  ShoppingCart,
  ArrowRight,
  Plus,
  Sparkles,
  TrendingUp,
} from "@buleje/design-system/icons";
import { useCart } from "@/contexts/cart-context";
import type { FeaturedNearbyStore, FeaturedNearbyProduct } from "@/lib/db/marketplace-featured.db";

interface Props {
  store: FeaturedNearbyStore | null;
  open: boolean;
  onClose: () => void;
}

type DrawerTab = "destacados" | "top";

const fmtPEN = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 2 }).format(n);

export default function StoreQuickPreviewDrawer({ store, open, onClose }: Props) {
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

  // Reset al cambio de tienda — vía microtask para no caer en
  // la regla "no setState directo en effect body".
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
   * "Top productos": mismas productos pero ordenados/curados distinto.
   * Prioriza:
   *   1. Productos con descuento vigente (discountPrice != null).
   *   2. Por precio efectivo descendente (asume "top" = high-ticket).
   * Es un proxy razonable hasta que tengamos signal real de ventas.
   */
  const top = useMemo<FeaturedNearbyProduct[]>(() => {
    return [...featured].sort((a, b) => {
      const aDisc = a.discountPrice != null ? 1 : 0;
      const bDisc = b.discountPrice != null ? 1 : 0;
      if (aDisc !== bDisc) return bDisc - aDisc;
      const aP = a.discountPrice ?? a.retailPrice;
      const bP = b.discountPrice ?? b.retailPrice;
      return bP - aP;
    });
  }, [featured]);

  if (!store) return null;

  const handleAdd = (p: FeaturedNearbyProduct) => {
    const price = p.discountPrice ?? p.retailPrice;
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
            className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-[3px]"
            aria-hidden
          />

          {/* Panel — w-[380px] fijo (Brandon: drawer estaba muy ancho) */}
          <motion.aside
            key="panel"
            ref={drawerRef}
            role="dialog"
            aria-label={`Vista rápida de ${store.name}`}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", ease: [0.22, 1, 0.36, 1], duration: 0.34 }}
            className="fixed right-0 top-0 z-[81] h-full w-[92vw] max-w-[380px] bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-2xl flex flex-col"
          >
            {/* ── Header con banner ─────────────────────────── */}
            <div className="relative h-28 shrink-0 overflow-hidden bg-[var(--surface-sunken)]">
              {store.banner ? (
                <Image src={store.banner} alt="" fill sizes="380px" className="object-cover" priority />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--brand-primary)]/30 to-[var(--brand-secondary)]/20" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="absolute right-2.5 top-2.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75 transition-colors"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>

              <div className="absolute bottom-2.5 left-3.5 right-3.5 text-white">
                <div className="flex items-center gap-2">
                  {store.logo && (
                    <div className="relative h-9 w-9 rounded-lg overflow-hidden bg-white shrink-0 ring-2 ring-white/40">
                      <Image src={store.logo} alt="" fill sizes="36px" className="object-cover" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h2 className="text-sm font-extrabold leading-tight truncate">{store.name}</h2>
                    <div className="flex items-center gap-1.5 text-[11px] text-white/85 mt-0.5">
                      <span className="inline-flex items-center gap-0.5">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" strokeWidth={2} />
                        <strong>{Number(store.rating).toFixed(1)}</strong>
                        <span className="text-white/55">({store.reviewCount})</span>
                      </span>
                      <span aria-hidden className="text-white/40">·</span>
                      <span className="inline-flex items-center gap-0.5">
                        <MapPin className="h-3 w-3" strokeWidth={2} />
                        {Number(store.distanceKm).toFixed(1)} km
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Tabs ─────────────────────────────────────── */}
            <div role="tablist" aria-label="Vistas de productos" className="flex shrink-0 border-b border-[var(--rule-base)] bg-[var(--surface-canvas)]">
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
            <div className="flex-1 overflow-y-auto">
              {featured.length === 0 ? (
                <div className="text-sm text-muted py-10 text-center px-4">
                  Esta tienda aún no tiene productos cargados.
                </div>
              ) : tab === "destacados" ? (
                <ListView products={featured} onAdd={handleAdd} addedFlash={addedFlash} />
              ) : (
                <GridView products={top} storeSlug={store.slug} />
              )}
            </div>

            {/* ── Footer CTA ──────────────────────────────── */}
            <div className="shrink-0 border-t border-[var(--rule-base)] p-3 bg-[var(--surface-canvas)]">
              <Link
                href={`/marketplace/${store.slug}`}
                className="w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-xl bg-[var(--brand-primary)] text-white text-[13px] font-extrabold uppercase tracking-[var(--ls-wider)] hover:bg-[var(--brand-primary)]/90 transition-colors"
              >
                Ver toda la tienda
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
              </Link>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────
// Tabs
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
      className={[
        "flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold uppercase tracking-[var(--ls-wider)] transition-colors relative",
        active
          ? "text-[var(--brand-primary)]"
          : "text-muted hover:text-[var(--text-primary)]",
      ].join(" ")}
    >
      {icon}
      {label}
      {active && (
        <motion.span
          layoutId="drawer-tab-underline"
          className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-[var(--brand-primary)]"
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      )}
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
    <ul className="px-3 py-3 space-y-2">
      {products.map((p) => {
        const price = p.discountPrice ?? p.retailPrice;
        const hasDiscount = p.discountPrice != null;
        const flashing = addedFlash === p.id;
        return (
          <li
            key={p.id}
            className="flex items-center gap-2.5 p-2 rounded-lg border border-[var(--rule-base)] hover:border-[var(--brand-primary)]/40 transition-colors"
          >
            <div className="relative h-12 w-12 shrink-0 rounded-md overflow-hidden bg-[var(--surface-sunken)]">
              {p.image ? (
                <Image src={p.image} alt="" fill sizes="48px" className="object-cover" />
              ) : (
                <div className="h-full w-full" />
              )}
              {p.discountLabel && (
                <span className="absolute top-0.5 left-0.5 rounded bg-[var(--brand-secondary)] px-1 py-0.5 text-[8.5px] font-extrabold uppercase tracking-tight text-white">
                  {p.discountLabel}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold leading-tight truncate">{p.name}</p>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="text-sm font-extrabold text-[var(--brand-primary)]">{fmtPEN(price)}</span>
                {hasDiscount && (
                  <span className="text-[11px] text-muted line-through">{fmtPEN(p.retailPrice)}</span>
                )}
              </div>
            </div>
            <button
              onClick={() => onAdd(p)}
              aria-label={`Agregar ${p.name} al carrito`}
              className={[
                "shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg transition-all active:scale-95",
                flashing
                  ? "bg-[var(--data-success-500)] text-white"
                  : "bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary)]/90",
              ].join(" ")}
            >
              {flashing ? <ShoppingCart className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />}
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
        const price = p.discountPrice ?? p.retailPrice;
        const hasDiscount = p.discountPrice != null;
        return (
          <li key={p.id} className="group">
            <Link
              href={`/marketplace/${storeSlug}/producto/${p.productId}`}
              className="block rounded-lg overflow-hidden border border-[var(--rule-base)] hover:border-[var(--brand-primary)]/50 hover:shadow-md transition-all"
            >
              <div className="relative aspect-square bg-[var(--surface-sunken)] overflow-hidden">
                {p.image ? (
                  <Image
                    src={p.image}
                    alt=""
                    fill
                    sizes="180px"
                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--brand-primary)]/15 to-[var(--brand-secondary)]/10" />
                )}
                <span className="absolute top-1.5 left-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-black/70 text-white text-[10px] font-extrabold">
                  #{i + 1}
                </span>
                {p.discountLabel && (
                  <span className="absolute top-1.5 right-1.5 rounded bg-[var(--brand-secondary)] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-tight text-white">
                    {p.discountLabel}
                  </span>
                )}
              </div>
              <div className="p-2">
                <p className="text-[12px] font-bold leading-tight line-clamp-2 min-h-[2lh]">{p.name}</p>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-sm font-extrabold text-[var(--brand-primary)]">{fmtPEN(price)}</span>
                  {hasDiscount && (
                    <span className="text-[10px] text-muted line-through">{fmtPEN(p.retailPrice)}</span>
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
